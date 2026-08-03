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
 * תקציב הזמן של ההפעלה כולה: הורדה, דחיסה והעלאה.
 *
 * התקרה של ffmpeg לבדה לא הספיקה. קליפ כבד יכול לבלוע כמה שניות בהורדה,
 * ואז דחיסה של 45 שניות מלאות דוחפת את ההעלאה אל מעבר לגבול והפונקציה
 * נחתכת באמצע. במצב הזה הקובץ הדחוס כבר קיים בזיכרון ואף אחד לא רואה
 * אותו. לכן ffmpeg מקבל את מה שנשאר מהתקציב ולא יותר.
 */
const INVOCATION_BUDGET_MS = 50 * 1000;

/** שמור להעלאת הקובץ הדחוס ולעדכון השורה, אחרי ש-ffmpeg סיים. */
const UPLOAD_RESERVE_MS = 6 * 1000;

/** מתחת לזה אין טעם להתחיל בכלל, ועדיף להשאיר את השורה ל-cron. */
const MIN_FFMPEG_MS = 8 * 1000;

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

/**
 * כמה זמן קליפ נחשב תפוס על ידי הפעלה שכבר מטפלת בו.
 *
 * המונה לבדו לא הספיק. הוא מונע משתי הפעלות שקראו את אותו ערך בדיוק
 * להתחיל יחד, אבל לא ממי שנכנס באמצע: הפעלה שמתחילה שנייה אחרי הראשונה
 * קוראת את הערך המעודכן, מצליחה לתפוס אותו, ומתחילה ffmpeg על אותו קובץ
 * בזמן שהראשונה עוד רצה. שתיהן מעלות קובץ, ורק אחת מהן מעדכנת את
 * התרגילים, כך שהקטלוג והתרגיל מצביעים לשני קבצים שונים.
 *
 * שתי דקות ולא שישים שניות: התקרה של הפונקציה היא 60, וצריך מרווח כדי
 * שהפעלה איטית לא תיחשב נטושה בזמן שהיא עדיין עובדת. הפעלה שנחתכה
 * באמצע משחררת את הקליפ מעצמה כשהזמן הזה עובר.
 */
export const LEASE_MS = 2 * 60 * 1000;

/**
 * מה יש בקובץ, לפי מה ש-ffmpeg עצמו מדווח עליו.
 *
 * video ו-audio הם מספרי הרצועות בקלט, לא סדר יחסי. null באודיו אומר
 * שאין בקובץ אף רצועת שמע שהבינארי הזה יודע לפענח.
 */
export type InputStreams = {
  duration: number | null;
  video: number | null;
  audio: number | null;
};

/**
 * ככה ffmpeg מסמן רצועה שאין לו מפענח עבורה.
 *
 * זה בדיוק המקרה של apac, השמע המרחבי של אפל: הרצועה קיימת בקובץ,
 * הבינארי מדפיס אותה כ-"none", וכל ניסיון לגעת בה נופל על
 * "Decoder (codec none) not found". במקום לנחש לפי מיקום, קוראים מה
 * הוא אומר ומדלגים על מה שהוא לא מכיר.
 */
const UNDECODABLE = /^(none|unknown)$/i;

function parseStreams(stderr: string): InputStreams {
  let duration: number | null = null;
  const clock = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (clock) {
    const seconds =
      Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    if (Number.isFinite(seconds) && seconds > 0) duration = seconds;
  }

  let video: number | null = null;
  let audio: number | null = null;
  // "Stream #0:1(und): Audio: none (apac / 0x63617061)" → 1, Audio, none
  const line = /Stream #0:(\d+)[^\n]*?:\s*(Video|Audio):\s*([A-Za-z0-9_]+)/g;
  for (const match of stderr.matchAll(line)) {
    const index = Number(match[1]);
    const codec = match[3];
    if (UNDECODABLE.test(codec)) continue;
    if (match[2] === "Video" && video === null) video = index;
    if (match[2] === "Audio" && audio === null) audio = index;
  }

  return { duration, video, audio };
}

/**
 * קורא את מבנה הקובץ לפני שנוגעים בו.
 *
 * דרך ffmpeg ולא ffprobe, כי @ffmpeg-installer אורז רק את הבינארי של
 * ffmpeg. הרצה בלי פלט מדפיסה את פרטי הקלט ל-stderr ויוצאת בשגיאה, וזה
 * המצב התקין כאן. הבדיקה קלה ולא מפענחת את הסרטון.
 */
export async function probeInput(input: string): Promise<InputStreams> {
  const binary = await ensureFfmpeg();

  return new Promise<InputStreams>((resolve) => {
    const child = spawn(binary, ["-hide_banner", "-i", input], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (d) => {
      // הראש ולא הזנב: פרטי הקלט מודפסים ראשונים.
      stderr = (stderr + String(d)).slice(0, 20000);
    });

    const timer = setTimeout(() => child.kill("SIGKILL"), 15 * 1000);
    const finish = () => {
      clearTimeout(timer);
      resolve(parseStreams(stderr));
    };

    child.on("error", finish);
    child.on("close", finish);
  });
}

/**
 * ההגדרה של libx264, לפי אורך הקליפ ולפי כמה ניסיונות כבר נכשלו.
 *
 * veryfast מספיק לקליפ תרגיל רגיל. קליפ ארוך לא מסיים בזמן שיש
 * לפונקציה, ושם עדיף קובץ מעט גדול יותר על פני שורה שנשארת אדומה.
 * ניסיון שני יורד עוד שלב, כי אם הראשון נחתך בזמן אין טעם לחזור עליו
 * באותה הגדרה בדיוק.
 */
export function presetFor(duration: number | null, attempt: number): string {
  const ladder = ["veryfast", "superfast", "ultrafast"];
  const seconds = duration ?? 0;
  let step = 0;
  if (seconds > 45) step = 1;
  if (seconds > 90) step = 2;
  step += Math.max(0, attempt - 1);
  return ladder[Math.min(step, ladder.length - 1)];
}

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

/**
 * בחירת הרצועות שייכנסו לפלט.
 *
 * בוחרים במפורש ולא נותנים ל-ffmpeg לבחור לבד. קליפ אייפון מגיע עם שתי
 * רצועות שמע, aac רגילה ו-apac שהוא השמע המרחבי של אפל, ועוד רצועות
 * data מסוג mebx. הבחירה האוטומטית נופלת על apac, והבינארי שאנחנו
 * אורזים לא מכיר אותו. עם ffmpeg מערכתי עדכני זה עובר, ולכן זה לא נתפס
 * בפיתוח.
 *
 * המיפוי לפי מספר הרצועה שהתגלה בפועל ולא לפי מיקום יחסי: בקבצים שראינו
 * ה-aac היא הראשונה, אבל אם אייפון עתידי יכתוב את ה-apac לפניה, בחירה
 * לפי מיקום הייתה נופלת עליה שוב.
 */
function mapArgs(streams: InputStreams): string[] {
  // בלי שום רצועה מזוהה אין על מה להסתמך, וחוזרים לבחירה לפי מיקום.
  if (streams.video === null && streams.audio === null) {
    return ["-map", "0:v:0", "-map", "0:a:0?"];
  }

  const args = ["-map", streams.video === null ? "0:v:0" : `0:${streams.video}`];
  // קליפ בלי שמע שאפשר לפענח יוצא אילם, וזה עדיף על שורה אדומה. תרגיל
  // נצפה ממילא בלי קול ברוב המקרים.
  if (streams.audio === null) args.push("-an");
  else args.push("-map", `0:${streams.audio}`);
  return args;
}

async function runFfmpeg(
  input: string,
  output: string,
  { streams, preset, timeoutMs }: {
    streams: InputStreams;
    preset: string;
    timeoutMs: number;
  }
) {
  const binary = await ensureFfmpeg();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-threads", "0",
        "-i", input,
        ...mapArgs(streams),
        // רצועות data מסוג mebx וכתוביות לא נכנסות לפלט.
        "-dn", "-sn", "-ignore_unknown",
        // H.264 + AAC — הצירוף היחיד שמתנגן בכל טלפון.
        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
        // veryfast ולא medium. בתוכנית Hobby הפונקציה נחתכת אחרי 60 שניות,
        // וכאן צריך מרווח. נמדד על קליפ אייפון של 17 שניות: אותו זמן
        // המרה, והקובץ יצא אפילו קטן יותר, 1.8MB מול 2.3MB.
        // קליפ ארוך יורד להגדרה מהירה יותר, ראה presetFor.
        "-crf", "26", "-preset", preset,
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
      reject(
        new Error(
          `הדחיסה לא הספיקה ב-${Math.round(timeoutMs / 1000)} שניות. ` +
            "אם הקליפ ארוך, כדאי לקצר אותו ולהעלות שוב."
        )
      );
    }, timeoutMs);

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

  // סופרים את הניסיון לפני שמתחילים, ובאותה פעולה תופסים את הקליפ.
  // התנאי על הערך הישן מונע משתי הפעלות שקראו את אותה שורה להתחיל יחד,
  // והתנאי על זמן התפיסה מונע מהפעלה שנכנסת באמצע להצטרף לעבודה שכבר
  // רצה. ראה LEASE_MS.
  const startedAt = Date.now();
  const claimedAt = new Date(startedAt).toISOString();
  const staleBefore = new Date(startedAt - LEASE_MS).toISOString();
  const claim = await db.execute({
    sql: `UPDATE videos
          SET compress_attempts = ?, compress_error = '', compress_started_at = ?
          WHERE id = ? AND COALESCE(compress_attempts, 0) = ?
            AND compress_state IN ('pending','failed')
            AND (compress_started_at IS NULL OR compress_started_at < ?)`,
    args: [attempts + 1, claimedAt, id, attempts, staleBefore],
  });
  if (claim.rowsAffected === 0) {
    return { status: "skipped", reason: "הסרטון כבר נלקח על ידי הפעלה אחרת" };
  }
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

    const streams = await probeInput(input);
    if (streams.video === null && streams.duration === null) {
      throw new Error("לא הצלחנו לקרוא את הקובץ. ייתכן שההעלאה נקטעה.");
    }

    // מה שנשאר מהתקציב אחרי ההורדה, פחות מקום להעלאה. אין טעם להתחיל
    // דחיסה שממילא תיחתך יחד עם הפונקציה.
    const left =
      INVOCATION_BUDGET_MS - (Date.now() - startedAt) - UPLOAD_RESERVE_MS;
    const timeoutMs = Math.min(FFMPEG_TIMEOUT_MS, left);
    if (timeoutMs < MIN_FFMPEG_MS) {
      throw new Error("ההורדה מהאחסון לקחה יותר מדי זמן, ננסה שוב בהרצה הבאה.");
    }

    await runFfmpeg(input, output, {
      streams,
      preset: presetFor(streams.duration, attempts + 1),
      timeoutMs,
    });
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

    /**
     * הטוקן מועבר במפורש כשהוא קיים, כמו ב-video-poster.ts.
     *
     * בוורסל ההרשאה מגיעה מ-OIDC ואין צורך בו. מהמחשב המקומי הספרייה
     * מזהה שהפרויקט עובד עם OIDC ונופלת על "OIDC is enabled for this
     * project, but not for the development environment", עוד לפני
     * שהיא מסתכלת על הטוקן הרגיל. העברה מפורשת גוברת, ובוורסל היא לא
     * משנה כלום.
     */
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const blob = await put(`videos/${webName(filename)}`, createReadStream(output), {
      access: "public",
      addRandomSuffix: true,
      contentType: "video/mp4",
      ...(blobToken ? { token: blobToken } : {}),
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
    // משחררים רק תפיסה שלנו. אם ההפעלה הזאת התארכה מעבר ל-LEASE_MS ומישהו
    // אחר כבר לקח את הקליפ, הערך בשורה שייך לו ואסור לנו לנקות אותו.
    await db
      .execute({
        sql: `UPDATE videos SET compress_started_at = NULL
              WHERE id = ? AND compress_started_at = ?`,
        args: [id, claimedAt],
      })
      .catch(() => {});
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * מזהי הסרטונים שממתינים לדחיסה או שנכשלו וזכאים לניסיון נוסף.
 *
 * קליפ שהפעלה אחרת תפסה זה עתה נשאר בחוץ, כדי שהתור לא יחזיר עבודה
 * שמישהו כבר עושה. תפיסה ישנה מ-LEASE_MS נחשבת נטושה וחוזרת לתור.
 */
export async function pendingVideoIds(limit = 3): Promise<string[]> {
  const res = await db.execute({
    sql: `SELECT id FROM videos
          WHERE compress_state IN ('pending','failed')
            AND compress_attempts < ?
            AND (compress_started_at IS NULL OR compress_started_at < ?)
          ORDER BY uploaded_at ASC
          LIMIT ?`,
    args: [MAX_ATTEMPTS, new Date(Date.now() - LEASE_MS).toISOString(), limit],
  });
  return res.rows.map((r) => String(r.id));
}
