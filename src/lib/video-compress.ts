/**
 * דחיסת סרטון שהועלה מהדפדפן, בשרת, בלי פעולה נוספת מצד FITAY.
 *
 * למה זה בכלל צריך לרוץ פה ולא בדרך:
 * ההעלאה עוברת מהטלפון ישר ל-Vercel Blob ולא דרך השרת, אחרת כל קליפ מעל
 * 4.5MB היה נחסם על ידי מגבלת גוף הבקשה. המשמעות היא שהשרת רואה את הקובץ
 * רק אחרי שהוא כבר באחסון, ולכן הדחיסה היא שלב שני: מוריד, ממיר, מעלה
 * גרסה דחוסה, ומחליף את הכתובת שמוגשת למתאמן.
 *
 * הדגלים כאן זהים לאלה של scripts/videos-convert.ts בכוונה. אותו פלט
 * בדיוק, בלי משנה אם הקליפ הומר במחשב או הועלה מהטלפון.
 *
 * הקובץ המקורי לא נמחק. הוא נשאר ב-Blob ומצביעים אליו מ-original_url.
 */
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { chmod, copyFile, mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
// @ffmpeg-installer ולא ffmpeg-static, בכוונה.
// ffmpeg-static מוריד את הבינארי מהאינטרנט בזמן ההתקנה, וההורדה הזאת לא
// קרתה בוורסל. הקובץ פשוט לא היה שם, והדחיסה נפלה על
// "no such file or directory". כאן הבינארי מגיע כחבילת npm רגילה לכל
// מערכת הפעלה, בלי הורדה ובלי סקריפט התקנה.
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { put } from "@vercel/blob";

const ffmpegPath: string | null = ffmpegInstaller.path || null;
import db from "./db";

/**
 * /tmp בפונקציה של Vercel הוא 512MB, וצריך להכיל גם את המקור וגם את הפלט.
 * קליפ גדול מזה נשאר כמו שהוא במקום להפיל את הפונקציה.
 */
const MAX_INPUT_BYTES = 340 * 1024 * 1024;

/**
 * תקרת זמן ל-ffmpeg.
 *
 * הפונקציה עצמה נחתכת אחרי 60 שניות בתוכנית Hobby, ולכן אין טעם בתקרה
 * ארוכה מזה. עוצרים לפני, כדי שהשגיאה תירשם בשורה ולא תיעלם עם הפונקציה.
 */
export const FFMPEG_TIMEOUT_MS = 45 * 1000;

/**
 * ffmpeg מוכן להרצה, בנתיב שאפשר להריץ ממנו.
 *
 * וורסל אורז את הבינארי בלי הרשאת הרצה, והתיקייה של הקוד היא לקריאה
 * בלבד, ולכן אי אפשר להוסיף את ההרשאה במקום. מעתיקים ל-/tmp, שם מותר
 * לכתוב, ומוסיפים שם את ההרשאה. ההעתקה קורית פעם אחת לכל הפעלה.
 */
let readyBinary: Promise<string> | null = null;

export function ensureFfmpeg(): Promise<string> {
  if (!readyBinary) {
    readyBinary = (async () => {
      if (!ffmpegPath) throw new Error("ffmpeg לא נמצא בחבילה");

      // בודקים שהמקור באמת קיים לפני ההעתקה, כדי שהשגיאה תגיד מה חסר
      // ולא תשאיר הודעת copyfile סתומה.
      try {
        await stat(ffmpegPath);
      } catch {
        throw new Error(`קובץ ffmpeg לא נמצא בנתיב ${ffmpegPath}`);
      }

      // הסיומת נשמרת. בלינוקס אין לו סיומת ובווינדוס הוא exe, ובלעדיה
      // ווינדוס לא מוכן להריץ את הקובץ בכלל.
      const target = join(tmpdir(), `ffmpeg-fitay${extname(ffmpegPath)}`);
      try {
        await stat(target);
      } catch {
        await copyFile(ffmpegPath, target);
      }
      await chmod(target, 0o755);
      return target;
    })().catch((err) => {
      readyBinary = null; // שההפעלה הבאה תנסה שוב במקום לזכור כישלון
      throw err;
    });
  }
  return readyBinary;
}

/** אחרי שלושה כישלונות מפסיקים לנסות, כדי שלא יהיה לופ אין־סופי. */
export const MAX_ATTEMPTS = 3;

export type CompressOutcome =
  | { status: "done"; from: number; to: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

function mb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1) + "MB";
}

/** שם הפלט: IMG_1341.mov → IMG_1341-web.mp4 */
function webName(filename: string) {
  const stem = filename.slice(0, filename.length - extname(filename).length);
  const safe = (stem || "video").replace(/[^\w.-]+/g, "_");
  return `${safe}-web.mp4`;
}

async function runFfmpeg(input: string, output: string) {
  const binary = await ensureFfmpeg();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-threads", "0",
        "-i", input,
        // בוחרים רצועות במפורש ולא נותנים ל-ffmpeg לבחור לבד.
        // קליפ אייפון מגיע עם שתי רצועות שמע: aac רגילה ו-apac, השמע
        // המרחבי של אפל, ועוד רצועות data מסוג mebx. הבחירה האוטומטית
        // נופלת על apac, והבינארי שאנחנו אורזים לא מכיר אותו:
        // "Decoder (codec none) not found for input stream". עם ffmpeg
        // מערכתי עדכני זה עובר, ולכן זה לא נתפס בפיתוח.
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-dn", "-sn", "-ignore_unknown",
        // H.264 + AAC — הצירוף היחיד שמתנגן בכל טלפון.
        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
        // veryfast ולא medium. בתוכנית Hobby הפונקציה נחתכת אחרי 60 שניות,
        // וכאן צריך מרווח. נמדד על קליפ אייפון של 17 שניות: אותו זמן
        // המרה, והקובץ יצא אפילו קטן יותר, 1.8MB מול 2.3MB.
        "-crf", "26", "-preset", "veryfast",
        // רוחב 720, גובה מחושב וזוגי. בלי הגדלה של קליפ קטן.
        "-vf", "scale='min(720,iw)':-2",
        "-c:a", "aac", "-b:a", "96k",
        // מטא־דאטה בתחילת הקובץ — הסרטון מתחיל לנגן לפני שהכל ירד.
        "-movflags", "+faststart",
        output,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    let stderr = "";
    child.stderr?.on("data", (d) => {
      // שומרים רק את הזנב. שגיאת ffmpeg על קובץ פגום יכולה להיות ארוכה מאוד.
      stderr = (stderr + String(d)).slice(-2000);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg נתקע מעל ${FFMPEG_TIMEOUT_MS / 1000} שניות`));
    }, FFMPEG_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg יצא בקוד ${code}`));
    });
  });
}

/**
 * דוחס סרטון אחד לפי המזהה שלו. בטוח להרצה חוזרת: קליפ שכבר נדחס יוצא
 * מיד, וקליפ שנכשל שלוש פעמים לא נוגעים בו שוב.
 */
export async function compressVideo(id: string): Promise<CompressOutcome> {
  const res = await db.execute({
    sql: `SELECT id, filename, url, size, compress_state, compress_attempts
          FROM videos WHERE id = ?`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return { status: "failed", reason: "הסרטון לא נמצא בקטלוג" };

  const state = String(row.compress_state ?? "done");
  if (state === "done" || state === "skipped") {
    return { status: "skipped", reason: "כבר טופל" };
  }

  const attempts = Number(row.compress_attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) {
    return { status: "skipped", reason: "עבר את מספר הניסיונות" };
  }

  const sourceUrl = String(row.url);
  const filename = String(row.filename);

  // סופרים את הניסיון לפני שמתחילים. אחרת פונקציה שנחתכה באמצע הייתה
  // חוזרת לתור לנצח בלי שאף אחד ידע.
  await db.execute({
    sql: "UPDATE videos SET compress_attempts = ?, compress_error = '' WHERE id = ?",
    args: [attempts + 1, id],
  });

  let dir: string | null = null;
  try {
    const declared = Number(row.size ?? 0);
    if (declared > MAX_INPUT_BYTES) {
      await db.execute({
        sql: `UPDATE videos SET compress_state = 'skipped',
              compress_error = ? WHERE id = ?`,
        args: [`הקובץ ${mb(declared)}, גדול מדי לדחיסה בשרת`, id],
      });
      return { status: "skipped", reason: "הקובץ גדול מדי" };
    }

    dir = await mkdtemp(join(tmpdir(), "fitay-"));
    const input = join(dir, `in${extname(filename) || ".mp4"}`);
    const output = join(dir, "out.mp4");

    const download = await fetch(sourceUrl);
    if (!download.ok || !download.body) {
      throw new Error(`ההורדה מהאחסון נכשלה (${download.status})`);
    }
    await pipeline(
      Readable.fromWeb(download.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(input)
    );

    const before = (await stat(input)).size;
    await runFfmpeg(input, output);
    const after = (await stat(output)).size;

    // אם הדחיסה לא הרוויחה כלום, אין טעם להחליף קובץ ולשלם על אחסון כפול.
    // הקליפים שהומרו כבר במחשב נופלים בדיוק לכאן.
    if (after >= before * 0.95) {
      await db.execute({
        sql: `UPDATE videos SET compress_state = 'done', compress_error = ''
              WHERE id = ?`,
        args: [id],
      });
      return { status: "done", from: before, to: before };
    }

    const blob = await put(`videos/${webName(filename)}`, createReadStream(output), {
      access: "public",
      addRandomSuffix: true,
      contentType: "video/mp4",
    });

    // מחליפים את הכתובת שמוגשת, ושומרים את המקור. אם הקליפ כבר שויך
    // לתרגיל, השיוך צריך לעבור איתו — אחרת התרגיל היה ממשיך להצביע
    // לקובץ הכבד.
    await db.execute({
      sql: `UPDATE videos
            SET url = ?, size = ?,
                original_url = COALESCE(original_url, ?),
                original_size = COALESCE(original_size, ?),
                compress_state = 'done', compress_error = ''
            WHERE id = ?`,
      args: [blob.url, after, sourceUrl, before, id],
    });
    await db.execute({
      sql: "UPDATE exercises SET video_file = ? WHERE video_file = ?",
      args: [blob.url, sourceUrl],
    });
    await db.execute({
      sql: "UPDATE workout_items SET video_file = ? WHERE video_file = ?",
      args: [blob.url, sourceUrl],
    });

    return { status: "done", from: before, to: after };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const exhausted = attempts + 1 >= MAX_ATTEMPTS;
    await db.execute({
      sql: `UPDATE videos SET compress_state = ?, compress_error = ? WHERE id = ?`,
      args: [exhausted ? "skipped" : "failed", reason.slice(0, 500), id],
    });
    return { status: "failed", reason };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** מזהי הסרטונים שממתינים לדחיסה או שנכשלו וזכאים לניסיון נוסף. */
export async function pendingVideoIds(limit = 3): Promise<string[]> {
  const res = await db.execute({
    sql: `SELECT id FROM videos
          WHERE compress_state IN ('pending','failed')
            AND compress_attempts < ?
          ORDER BY uploaded_at ASC
          LIMIT ?`,
    args: [MAX_ATTEMPTS, limit],
  });
  return res.rows.map((r) => String(r.id));
}
