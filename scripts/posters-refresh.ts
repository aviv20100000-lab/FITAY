/**
 * רענון תמונות הפתיחה של הסרטונים שכבר בקטלוג:
 *   npm run posters:refresh                  בדיקה יבשה, לא נוגע בכלום
 *   npm run posters:refresh -- --write       מבצע
 *   npm run posters:refresh -- --write --limit 1      סרטון אחד, לפיילוט
 *   npm run posters:refresh -- --write --only "מקבילים"
 *       רק סרטונים ששמם מכיל את הטקסט
 *   npm run posters:refresh -- --write --redo
 *       מייצר מחדש גם פוסטרים שהסקריפט הזה כבר רענן
 *
 * למה זה קיים:
 * הפוסטרים יוצרו ברוחב 540 כשהסרטון המוגש היה 720. אחרי שהקטלוג שודרג
 * ל-1080 (videos-requality.ts), הפוסטר נשאר התמונה היחידה שלא הוחדה:
 * בספריית הסרטונים ובמסך החימום הוא מה שרואים כל הזמן, ולפני ניגון הוא
 * מה שמוצג על כל תרגיל. הרוחב תוקן ב-video-poster.ts, אבל הצינור בשרת
 * מדלג על סרטון שכבר יש לו תמונה, ולכן התיקון לבדו לא נוגע בקיים.
 * הסקריפט הזה מייצר מחדש את מה שכבר בקטלוג.
 *
 * הפוסטר נחלץ מהקובץ שמוגש כרגע (videos.url) ולא מהמקור: הוא צריך
 * להיראות כמו הסרטון שהמתאמן באמת רואה, וממילא הקובץ המוגש כבר ברוחב
 * שהפוסטר צריך.
 *
 * שום קובץ לא נמחק. כל רענון מעלה מפתח חדש ל-R2 והפוסטר הישן נשאר שם.
 * הפעולה היחידה שהמתאמן מרגיש היא החלפת poster_url, שורה אחת לכל סרטון,
 * ולכן סקריפט שנעצר באמצע משאיר קטלוג תקין.
 *
 * רץ עם ffmpeg המערכתי ולא עם הבינארי הארוז: אין כאן תקרת זמן של
 * פונקציה. אם הוא לא מותקן:
 *   winget install Gyan.FFmpeg
 */
import { spawnSync } from "child_process";
import { createWriteStream } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import db, { initDb } from "../src/lib/db";
import { isOurStorage, putFile, uniqueKey } from "../src/lib/r2";
import {
  MIN_USEFUL_BYTES,
  POSTER_JPEG_QUALITY,
  POSTER_SCALE_FILTER,
  SEEK_FRACTIONS,
} from "../src/lib/video-poster";

/**
 * הסימן שמבדיל פוסטר שהסקריפט הזה כבר ייצר.
 *
 * אותו טריק כמו ב-videos-requality.ts: הבדיקה על הכתובת עצמה ולא על
 * עמודה חדשה במסד, כדי לא לגעת בסכימה. הצינור שבשרת קורא לקבצים שלו
 * "-poster", וכאן "-poster-hd", ולכן הרצה חוזרת יודעת לדלג על מה שכבר
 * רוענן גם אם ההרצה הקודמת נעצרה באמצע. שמונה ספרות ההקסה הן הסיומת
 * ש-uniqueKey מוסיף.
 */
const ALREADY = /-poster-hd-[0-9a-f]{8}\.jpg$/i;

const kb = (bytes: number) => (bytes / 1024).toFixed(0) + "KB";

/** IMG_1341-hq.mp4 → IMG_1341-hq-poster-hd.jpg */
function posterHdName(filename: string) {
  const stem = filename.slice(0, filename.length - extname(filename).length);
  const safe = (stem || "video").replace(/[^\w.-]+/g, "_");
  return `${safe}-poster-hd.jpg`;
}

function hasFfmpeg() {
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return probe.status === 0;
}

/** אורך הסרטון בשניות, או null כשאי אפשר לקרוא אותו. */
function probeDuration(path: string): number | null {
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { encoding: "utf8" }
  );
  const parsed = Number((res.stdout || "").trim());
  return res.status === 0 && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
}

/**
 * פריים אחד בזמן נתון. מחזיר את הודעת השגיאה, או null כשהצליח.
 *
 * -ss לפני -i הוא חיפוש מהיר, ובחירת הרצועות מפורשת מאותה סיבה כמו
 * ב-video-poster.ts. ההבדל היחיד מהצינור שבשרת הוא הבינארי: כאן ffmpeg
 * המערכתי דרך spawnSync, כי אין דדליין של פונקציה לרוץ תחתיו.
 */
function grabFrame(input: string, output: string, at: number) {
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", at.toFixed(2),
    "-i", input,
    "-map", "0:v:0",
    "-an", "-dn", "-sn", "-ignore_unknown",
    "-frames:v", "1",
    "-vf", POSTER_SCALE_FILTER,
    "-q:v", POSTER_JPEG_QUALITY,
    output,
  ];
  const res = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (res.status === 0) return null;
  return (res.stderr || "").trim().slice(-400) || `ffmpeg יצא בקוד ${res.status}`;
}

/** הצלעות של הפלט, לדוח בלבד. */
function dimensions(path: string) {
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries",
     "stream=width,height", "-of", "csv=p=0", path],
    { encoding: "utf8" }
  );
  const out = (res.stdout || "").trim().replace(/,+$/, "");
  return out || "?";
}

async function main() {
  const write = process.argv.includes("--write");
  const redo = process.argv.includes("--redo");
  const limitArg = process.argv.indexOf("--limit");
  const limit =
    limitArg > -1 ? Number(process.argv[limitArg + 1]) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) && limitArg > -1) {
    console.error("‏--limit דורש מספר");
    process.exit(1);
  }
  const onlyArg = process.argv.indexOf("--only");
  const only = onlyArg > -1 ? String(process.argv[onlyArg + 1] ?? "") : "";
  if (onlyArg > -1 && !only) {
    console.error("‏--only דורש טקסט לחיפוש בשם הקובץ");
    process.exit(1);
  }

  if (!hasFfmpeg()) {
    console.error("ffmpeg לא נמצא. התקנה:  winget install Gyan.FFmpeg");
    process.exit(1);
  }

  await initDb();

  const res = await db.execute(
    `SELECT id, filename, url, poster_url, compress_state, compress_started_at
     FROM videos ORDER BY uploaded_at ASC`
  );

  /*
   * שורה שהדחיסה עוד עשויה לגעת בה נשארת בחוץ, משתי סיבות שכבר כתובות
   * ב-video-poster.ts: pending ו-failed עדיין בתור וה-url שלהן עומד
   * להתחלף, ושורה שהפעלה בשרת תפסה זה עתה (LEASE_MS של שמונה דקות)
   * עלולה להתחלף באמצע ההורדה. done ו-skipped הם המצבים שבהם הקובץ
   * המוגש כבר סופי.
   */
  const busyBefore = Date.now() - 8 * 60 * 1000;
  const claimed = (r: Record<string, unknown>) => {
    const at = r.compress_started_at ? Date.parse(String(r.compress_started_at)) : NaN;
    return Number.isFinite(at) && at > busyBefore;
  };
  const settled = (r: Record<string, unknown>) =>
    ["done", "skipped"].includes(String(r.compress_state ?? "done"));

  const pending = (res.rows as unknown as Record<string, unknown>[])
    .filter((r) => redo || !ALREADY.test(String(r.poster_url ?? "")))
    .filter((r) => !only || String(r.filename).includes(only))
    .filter((r) => settled(r) && !claimed(r));
  const skipped = res.rows.length - pending.length;

  console.log(
    `בקטלוג ${res.rows.length} סרטונים. ` +
      `${pending.length} ממתינים לרענון פוסטר, ${skipped} מחוץ לטווח.`
  );
  if (redo) console.log("‏--redo: גם פוסטרים שכבר רועננו ייוצרו שוב.");
  if (only) console.log(`‏--only: רק שם שמכיל "${only}".`);
  if (!write) {
    console.log("\nבדיקה יבשה. שום דבר לא ישתנה. להרצה אמיתית: --write\n");
  }

  let done = 0;
  let failed = 0;

  for (const row of pending) {
    if (done >= limit) break;

    const id = String(row.id);
    const filename = String(row.filename);
    const sourceUrl = String(row.url);

    // כתובת ישנה של Vercel Blob תיכשל ממילא בהורדה — המאגר שם חוסם גם
    // קריאה. עדיף שהדוח יגיד את זה מראש מאשר שגיאת רשת סתומה.
    const foreign = !isOurStorage(sourceUrl);

    if (!write) {
      console.log(
        `• ${filename} — ייחלץ מ-${sourceUrl.split("/").pop()}` +
          (foreign ? "  (אזהרה: הכתובת לא באחסון שלנו, ההורדה כנראה תיכשל)" : "")
      );
      done++;
      continue;
    }

    process.stdout.write(`⟳ ${filename} … `);
    let dir: string | null = null;
    try {
      dir = await mkdtemp(join(tmpdir(), "fitay-poster-hd-"));
      const input = join(dir, `in${extname(sourceUrl.split("?")[0]) || ".mp4"}`);

      const download = await fetch(sourceUrl);
      if (!download.ok || !download.body) {
        throw new Error(`ההורדה נכשלה (${download.status})`);
      }
      await pipeline(
        Readable.fromWeb(download.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(input)
      );

      const duration = probeDuration(input);
      if (!duration) throw new Error("לא הצלחנו לקרוא את אורך הסרטון");

      // אותו סולם נקודות חיפוש כמו בצינור שבשרת: עוברים עליהן עד שיוצא
      // פריים שנראה כמו תמונה אמיתית, ואם כולן יצאו אחידות לוקחים את
      // הטובה מביניהן ולא נשארים בלי כלום.
      let best: { path: string; bytes: number } | null = null;
      for (const [index, fraction] of SEEK_FRACTIONS.entries()) {
        const output = join(dir, `poster-${index}.jpg`);
        if (grabFrame(input, output, duration * fraction)) continue;
        const bytes = (await stat(output).catch(() => null))?.size ?? 0;
        if (bytes === 0) continue;
        if (!best || bytes > best.bytes) best = { path: output, bytes };
        if (bytes >= MIN_USEFUL_BYTES) break;
      }
      if (!best) throw new Error("לא הצלחנו לחלץ פריים מהסרטון");

      /*
       * העלאה ורק אחר כך עדכון השורה, בלי שום מחיקה. הפוסטר הישן נשאר
       * ב-R2: אם ההרצה נקטעת בין ההעלאה לעדכון, הקטלוג עדיין מצביע
       * לתמונה הישנה והתקינה, והרצה חוזרת פשוט תעלה קובץ חדש.
       */
      /*
       * התיקייה posters ולא videos.
       *
       * כל 46 הפוסטרים הקיימים יושבים שם, וזה מה שמאפשר להסתכל על הדלי
       * ולדעת כמה מקום תופס כל סוג. פיילוט על סרטון אחד ב-20 באוגוסט
       * 2026 נחת בטעות תחת videos, ובהרצה מלאה זה היה מפזר את הפוסטרים
       * בין שתי תיקיות לתמיד. אותו prefix שהצינור בשרת משתמש בו
       * ב-video-poster.ts.
       */
      const posterUrl = await putFile(
        uniqueKey("posters", posterHdName(filename)),
        best.path,
        "image/jpeg"
      );
      await db.execute({
        sql: "UPDATE videos SET poster_url = ? WHERE id = ?",
        args: [posterUrl, id],
      });

      done++;
      console.log(`${dimensions(best.path)} · ${kb(best.bytes)}`);
    } catch (err) {
      failed++;
      console.log("נכשל");
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  if (!write) {
    console.log(`\n${done} פוסטרים היו מיוצרים מחדש. להרצה: --write`);
    return;
  }
  console.log(`\n✓ ${done} רועננו, ${failed} נכשלו.`);
  if (failed) process.exitCode = 1;
}

main();
