/**
 * חילוץ תמונת פתיחה לסרטון.
 *
 * הבעיה: הנגנים מוגדרים preload="metadata", ולכן הדפדפן יודע כמה הסרטון
 * ארוך אבל לא מפענח אף פריים. התוצאה היא מלבן שחור עד שלוחצים על נגן.
 * מתאמן שנכנס לתרגיל רואה חור שחור במקום להבין מה הוא הולך לעשות.
 *
 * הפתרון: פריים אחד מתוך הסרטון, שמור כתמונה ומוגש כ-poster. הוא מוצג
 * מיד, בלי שהסרטון עצמו יורד.
 *
 * למה לא הפריים הראשון: קליפ של תרגיל מתחיל כמעט תמיד בתנוחת הכנה, לפעמים
 * לפני שנכנסים לפריים בכלל. אמצע הסרטון מראה את התרגיל עצמו.
 *
 * הקובץ הזה עצמאי ולא נוגע בצינור הדחיסה שב-video-compress.ts. הוא כן
 * לוקח ממנו את ensureFfmpeg, את probeInput ואת דפוס ההורדה, כי זה אותו
 * בינארי, אותה קריאה של מבנה הקובץ ואותו אחסון.
 */
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { put } from "@vercel/blob";
import { ensureFfmpeg, FFMPEG_TIMEOUT_MS, probeInput } from "./video-compress";
import db from "./db";

/**
 * מתחת לזה הפריים כמעט בוודאות אחיד — שחור, לבן או תמונה מטושטשת של
 * תנועה. JPEG של פריים אמיתי עם גוף אדם ורקע לא יורד לגודל כזה.
 * הערך נקבע בבדיקה על הקליפים של FITAY, לא מנוסחה.
 */
const MIN_USEFUL_BYTES = 4096;

/**
 * תקרת גודל לקובץ שממנו מחלצים פריים.
 *
 * נמוכה בכוונה מהתקרה של הדחיסה. הדחיסה רצה לבדה בהפעלה משלה, וכאן
 * מדובר בעבודה שרצה על קליפ שכבר נדחס ל-720. קובץ גדול מזה מסמן שמשהו
 * לא כשורה, ועדיף לדלג עליו מאשר לשרוף את תקרת הזמן של הפונקציה.
 */
const MAX_INPUT_BYTES = 150 * 1024 * 1024;

/**
 * איפה לחפש פריים, כשבר מאורך הסרטון.
 *
 * 0.4 ראשון ולא 0.5, כי בחלק מהתרגילים אמצע הסרטון בדיוק הוא נקודת
 * המנוחה בין חזרות. השאר הם גיבוי לקליפ שיצא אחיד בנקודה הראשונה.
 */
const SEEK_FRACTIONS = [0.4, 0.6, 0.25, 0.75];

/** ה-probe המשותף עוצר בעצמו אחרי 15 שניות; לא מתחילים אותו בלי כל החלון הזה. */
const PROBE_BUDGET_MS = 15 * 1000;

export type PosterOutcome =
  | { status: "done"; url: string; bytes: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** IMG_1341-web.mp4 → IMG_1341-web-poster.jpg */
function posterName(filename: string) {
  const stem = filename.slice(0, filename.length - extname(filename).length);
  const safe = (stem || "video").replace(/[^\w.-]+/g, "_");
  return `${safe}-poster.jpg`;
}

/**
 * פריים אחד בזמן נתון.
 *
 * -ss לפני -i הוא חיפוש מהיר: ffmpeg קופץ לנקודה במקום לפענח מההתחלה.
 * מסנן thumbnail בוחר את הפריים המייצג מתוך חלון, ולא את הראשון שנקרה
 * בדרך, וככה נמנע פריים מטושטש באמצע תנועה.
 */
async function grabFrame(
  input: string,
  output: string,
  at: number,
  videoStream: number | null,
  timeoutMs = FFMPEG_TIMEOUT_MS
) {
  const binary = await ensureFfmpeg();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", at.toFixed(2),
        "-i", input,
        // אותה בחירת רצועות מפורשת כמו בדחיסה, מאותה סיבה: קליפ אייפון
        // מגיע עם רצועת apac ורצועות data מסוג mebx, והבחירה האוטומטית
        // נופלת עליהן. כאן יוצא פריים אחד ולכן אין רצועת שמע בפלט בכלל.
        "-map", videoStream === null ? "0:v:0" : `0:${videoStream}`,
        "-an", "-dn", "-sn", "-ignore_unknown",
        "-frames:v", "1",
        // 540 ולא 720 כמו הסרטון. התמונה הזאת נטענת בכל כניסה לתרגיל,
        // והיא נעלמת ברגע שלוחצים על נגן, ולכן היא לא צריכה להיות חדה
        // כמו הסרטון שהיא מחליפה. ב-720 הקבצים יצאו 170KB עד 230KB,
        // וזה הורגש כהמתנה ברשת סלולרית.
        "-vf", "thumbnail,scale='min(540,iw)':-2",
        // 5 ולא 3. נמדד: ההפרש בין השניים הוא כרבע מהמשקל, ובגודל שבו
        // התמונה מוצגת בטלפון הוא לא נראה.
        "-q:v", "5",
        output,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr = (stderr + String(d)).slice(-2000);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg לא סיים בתוך ${Math.ceil(timeoutMs / 1000)} שניות`));
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
 * מייצר תמונת פתיחה לסרטון אחד ושומר את הכתובת בקטלוג.
 *
 * בטוח להרצה חוזרת: סרטון שכבר יש לו תמונה יוצא מיד, אלא אם מבקשים
 * במפורש לייצר מחדש.
 */
export async function generatePoster(
  id: string,
  {
    force = false,
    deadlineAt,
  }: { force?: boolean; deadlineAt?: number } = {}
): Promise<PosterOutcome> {
  const timeLeft = () => deadlineAt === undefined
    ? Number.POSITIVE_INFINITY
    : deadlineAt - Date.now();
  const res = await db.execute({
    sql: `SELECT id, filename, url, size, poster_url, compress_state
            FROM videos WHERE id = ?`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return { status: "failed", reason: "הסרטון לא נמצא בקטלוג" };
  if (row.poster_url && !force) {
    return { status: "skipped", reason: "כבר יש תמונת פתיחה" };
  }

  /**
   * לא נוגעים בקליפ שהדחיסה עוד עשויה לגעת בו.
   *
   * pending ו-failed שניהם עדיין בתור: failed חוזר לניסיון עד שלוש פעמים.
   * הדחיסה מחליפה את כתובת הקובץ בסיום, ולכן פריים שנחלץ עכשיו נלקח
   * מקובץ שעומד להיות מוחלף. חשוב מזה: שתי עבודות ffmpeg על אותו קליפ
   * באותו זמן מתחרות על אותה תקרת זמן ואותו זיכרון. הדחיסה קודמת.
   *
   * הבדיקה חוזרת כאן ולא רק ב-postersPendingIds, כי סקריפט המילוי סורק
   * את כל הקטלוג ולא עובר דרך התור.
   */
  const state = String(row.compress_state ?? "done");
  if (state === "pending" || state === "failed") {
    return { status: "skipped", reason: "עדיין בתור לדחיסה, ננסה אחריה" };
  }

  const declared = Number(row.size ?? 0);
  if (declared > MAX_INPUT_BYTES) {
    return {
      status: "skipped",
      reason: `הקובץ ${(declared / 1024 / 1024).toFixed(0)}MB, גדול מדי לחילוץ פריים`,
    };
  }

  const sourceUrl = String(row.url);
  const filename = String(row.filename);
  const controller = new AbortController();
  const deadlineTimer = deadlineAt === undefined
    ? null
    : setTimeout(() => controller.abort(), Math.max(0, timeLeft()));

  let dir: string | null = null;
  try {
    if (timeLeft() <= 0) throw new Error("נגמר תקציב הזמן ליצירת הפוסטר");

    dir = await mkdtemp(join(tmpdir(), "fitay-poster-"));
    const input = join(dir, `in${extname(filename) || ".mp4"}`);

    const download = await fetch(sourceUrl, { signal: controller.signal });
    if (!download.ok || !download.body) {
      throw new Error(`ההורדה מהאחסון נכשלה (${download.status})`);
    }
    await pipeline(
      Readable.fromWeb(download.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(input),
      { signal: controller.signal }
    );

    // אין דרך לבטל את ה-probe המשותף מבחוץ, ולכן מתחילים אותו רק כשכל
    // תקרת 15 השניות שלו עדיין נמצאת בתוך ה-deadline של הפוסטר.
    if (timeLeft() < PROBE_BUDGET_MS) {
      throw new Error("לא נשאר מספיק זמן לקריאת מבנה הסרטון");
    }
    const streams = await probeInput(input);
    const duration = streams.duration;
    if (!duration) {
      return { status: "failed", reason: "לא הצלחנו לקרוא את אורך הסרטון" };
    }

    // עוברים על נקודות החיפוש עד שיוצא פריים שנראה כמו תמונה אמיתית.
    // אם כולן יצאו אחידות, לוקחים את הטובה מביניהן ולא נשארים בלי כלום.
    let best: { path: string; bytes: number } | null = null;
    for (const [index, fraction] of SEEK_FRACTIONS.entries()) {
      const frameBudget = Math.min(FFMPEG_TIMEOUT_MS, timeLeft());
      if (frameBudget <= 0) break;

      const output = join(dir, `poster-${index}.jpg`);
      try {
        await grabFrame(
          input,
          output,
          duration * fraction,
          streams.video,
          frameBudget
        );
      } catch {
        continue;
      }
      const bytes = (await stat(output).catch(() => null))?.size ?? 0;
      if (bytes === 0) continue;
      if (!best || bytes > best.bytes) best = { path: output, bytes };
      if (bytes >= MIN_USEFUL_BYTES) break;
    }

    if (!best) {
      return { status: "failed", reason: "לא הצלחנו לחלץ פריים מהסרטון" };
    }

    /**
     * הטוקן מועבר במפורש כשהוא קיים.
     *
     * בוורסל ההרשאה מגיעה מ-OIDC ואין צורך בו. מהמחשב המקומי OIDC לא
     * תקף, אבל VERCEL_OIDC_TOKEN כן יושב ב-.env.local אחרי env pull,
     * וספריית האחסון מעדיפה אותו על פני הטוקן הרגיל ונופלת. העברה
     * מפורשת גוברת, ובוורסל היא לא משנה כלום.
     */
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const blob = await put(
      `videos/${posterName(filename)}`,
      createReadStream(best.path),
      {
        access: "public",
        addRandomSuffix: true,
        contentType: "image/jpeg",
        abortSignal: controller.signal,
        ...(blobToken ? { token: blobToken } : {}),
      }
    );

    await db.execute({
      sql: "UPDATE videos SET poster_url = ? WHERE id = ?",
      args: [blob.url, id],
    });

    return { status: "done", url: blob.url, bytes: best.bytes };
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * מזהי הסרטונים שעדיין אין להם תמונת פתיחה.
 *
 * רק קליפים שהדחיסה סיימה איתם או ויתרה עליהם סופית. done הוא הקובץ
 * שבאמת מוגש למתאמן אחרי הדחיסה; skipped כבר לא יחזור לתור הדחיסה ולכן
 * אין סכנה ששתי עבודות ffmpeg יתחרו על אותה תקרת זמן. pending ו-failed
 * עדיין בתור הדחיסה ונשארים בחוץ.
 */
export async function postersPendingIds(limit = 5): Promise<string[]> {
  const res = await db.execute({
    sql: `SELECT id FROM videos
           WHERE poster_url IS NULL
             AND compress_state IN ('done','skipped')
           ORDER BY uploaded_at ASC
           LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => String(r.id));
}
