/**
 * שדרוג האיכות של הסרטונים שכבר בקטלוג:
 *   npm run videos:requality                 בדיקה יבשה, לא נוגע בכלום
 *   npm run videos:requality -- --write      מבצע
 *   npm run videos:requality -- --write --limit 1     סרטון אחד, לפיילוט
 *
 * למה זה קיים:
 * הדחיסה הישנה הורידה כל סרטון לרוחב 720 ב-CRF 26. איתי מצלם באייפון
 * ב-4K, ומה שהמתאמן ראה היה תשיעית מהפיקסלים של המקור. ההגדרות תוקנו
 * ב-video-encode.ts, אבל זה משפיע רק על העלאות חדשות. הסקריפט הזה מטפל
 * במה שכבר נמצא.
 *
 * ההמרה רצה מהמקור ולא מהקובץ הדחוס. דחיסה על דחיסה רק מוסיפה נזק.
 * המקור נשמר תמיד ב-original_url, ולכן לא צריך לבקש מאיתי להעלות שוב
 * שום דבר.
 *
 * שום קובץ לא נמחק. כל המרה יוצרת מפתח חדש ב-R2, והקובץ הישן נשאר שם.
 * ההחלפה של הכתובת היא הפעולה היחידה שהמתאמן מרגיש, והיא אטומית לכל
 * סרטון בנפרד. סקריפט שנעצר באמצע משאיר קטלוג תקין.
 *
 * רץ עם ffmpeg המערכתי ולא עם הבינארי הארוז: אין כאן תקרת זמן של
 * פונקציה, ואפשר להרשות preset איטי יותר. אם הוא לא מותקן:
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
import { putFile, uniqueKey } from "../src/lib/r2";
import { VIDEO_CRF, VIDEO_SCALE_FILTER } from "../src/lib/video-encode";

/**
 * הסימן שמבדיל קובץ ששודרג כבר.
 *
 * הסקריפט ירוץ יותר מפעם אחת, ולו רק כי הרצה ראשונה תיעצר על סרטון
 * אחד לפיילוט. הבדיקה היא על הכתובת עצמה ולא על עמודה חדשה במסד, כדי
 * לא לגעת בסכימה. שמונה ספרות הקסה הן הסיומת ש-uniqueKey מוסיף, והן
 * מה שהופך את הזיהוי למדויק ולא לניחוש על השם.
 */
const ALREADY = /-hq-[0-9a-f]{8}\.mp4$/i;

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + "MB";

/** גקסון רמה 1.mov → גקסון רמה 1-hq.mp4 */
function hqName(filename: string) {
  const stem = filename.slice(0, filename.length - extname(filename).length);
  return `${stem || "video"}-hq.mp4`;
}

function hasFfmpeg() {
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return probe.status === 0;
}

/**
 * ההמרה עצמה. מחזיר את הודעת השגיאה, או null כשהצליח.
 *
 * הניסיון השני בלי שמע: קליפ אייפון נושא רצועת apac, השמע המרחבי של
 * אפל, ולא כל בינארי יודע לפענח אותה. תרגיל נצפה ממילא בלי קול, ולכן
 * קליפ אילם עדיף על סרטון שנשאר בכיעור של 720.
 */
function encode(input: string, output: string, silent: boolean) {
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", input,
    "-map", "0:v:0",
    ...(silent ? ["-an"] : ["-map", "0:a:0?"]),
    "-dn", "-sn", "-ignore_unknown",
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-crf", VIDEO_CRF, "-preset", "medium",
    "-vf", VIDEO_SCALE_FILTER,
    ...(silent ? [] : ["-c:a", "aac", "-b:a", "96k"]),
    "-movflags", "+faststart",
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
  const limitArg = process.argv.indexOf("--limit");
  const limit =
    limitArg > -1 ? Number(process.argv[limitArg + 1]) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) && limitArg > -1) {
    console.error("‏--limit דורש מספר");
    process.exit(1);
  }

  if (!hasFfmpeg()) {
    console.error("ffmpeg לא נמצא. התקנה:  winget install Gyan.FFmpeg");
    process.exit(1);
  }

  await initDb();

  const res = await db.execute(
    `SELECT id, filename, url, size, original_url, original_size
     FROM videos ORDER BY uploaded_at ASC`
  );

  const pending = (res.rows as unknown as Record<string, unknown>[]).filter(
    (r) => !ALREADY.test(String(r.url))
  );
  const skipped = res.rows.length - pending.length;

  console.log(
    `בקטלוג ${res.rows.length} סרטונים. ` +
      `${pending.length} ממתינים לשדרוג, ${skipped} כבר שודרגו.`
  );
  if (!write) {
    console.log("\nבדיקה יבשה. שום דבר לא ישתנה. להרצה אמיתית: --write\n");
  }

  let done = 0;
  let failed = 0;
  let untouched = 0;
  let growth = 0;

  for (const row of pending) {
    if (done >= limit) break;

    const id = String(row.id);
    const filename = String(row.filename);
    const servedUrl = String(row.url);
    // המקור ולא הקובץ הדחוס. שורה שבה הדחיסה לא הרוויחה כלום נשארה בלי
    // original_url, ואז url עצמו הוא המקור.
    const sourceUrl = String(row.original_url || row.url);
    const servedSize = Number(row.size ?? 0);

    if (!write) {
      console.log(`• ${filename} — ${mb(servedSize)} → יומר מ-${sourceUrl.split("/").pop()}`);
      done++;
      continue;
    }

    process.stdout.write(`⟳ ${filename} (${mb(servedSize)}) … `);
    let dir: string | null = null;
    try {
      dir = await mkdtemp(join(tmpdir(), "fitay-hq-"));
      const input = join(dir, `in${extname(sourceUrl.split("?")[0]) || ".mp4"}`);
      const output = join(dir, "out.mp4");

      const download = await fetch(sourceUrl);
      if (!download.ok || !download.body) {
        throw new Error(`ההורדה נכשלה (${download.status})`);
      }
      await pipeline(
        Readable.fromWeb(download.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(input)
      );
      const sourceSize = (await stat(input)).size;

      // ניסיון עם שמע, ואם הוא נפל, ניסיון שני בלי שמע.
      let err = encode(input, output, false);
      if (err) err = encode(input, output, true);
      if (err) throw new Error(err);

      const newSize = (await stat(output)).size;
      if (newSize >= sourceSize) {
        console.log(`הפלט (${mb(newSize)}) לא קטן מהמקור (${mb(sourceSize)}), מדלג`);
        untouched++;
        continue;
      }

      const uploadedUrl = await putFile(
        uniqueKey("videos", hqName(filename)),
        output,
        "video/mp4"
      );

      /*
       * סדר הפעולות חשוב, כי הסקריפט יכול להיעצר באמצע.
       *
       * קודם השיוכים ורק אחר כך שורת הקטלוג. אם ההרצה נקטעת בין שתי
       * הפעולות, התרגיל כבר מצביע לקובץ החדש שכבר קיים ב-R2, ושורת
       * הקטלוג עדיין נראית לא משודרגת — כלומר הרצה חוזרת תטפל בה.
       *
       * בסדר ההפוך זה היה נשבר בשקט: שורת הקטלוג הייתה מסומנת כמשודרגת,
       * הרצה חוזרת הייתה מדלגת עליה, והתרגיל היה נשאר על קובץ ה-720
       * לנצח בלי שאף אחד ידע.
       *
       * חמש העמודות האלה הן בדיוק אלה שמעודכנות ב-compressVideo. עמודה
       * שנשכחת כאן משאירה תרגיל שמצביע לקובץ הישן.
       */
      for (const [table, column] of [
        ["exercises", "video_file"],
        ["exercises", "stance_video_level_2"],
        ["exercises", "stance_video_level_3"],
        ["exercises", "band_video_file"],
        ["workout_items", "video_file"],
      ] as const) {
        await db.execute({
          sql: `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
          args: [uploadedUrl, servedUrl],
        });
      }

      // הכתובת המוגשת מתחלפת, והמקור נשמר. COALESCE ולא השמה ישירה:
      // שורה שכבר מכירה את המקור שלה לא צריכה לאבד אותו.
      await db.execute({
        sql: `UPDATE videos
              SET url = ?, size = ?,
                  original_url = COALESCE(original_url, ?),
                  original_size = COALESCE(original_size, ?)
              WHERE id = ?`,
        args: [uploadedUrl, newSize, sourceUrl, sourceSize, id],
      });

      growth += newSize - servedSize;
      done++;
      console.log(`${dimensions(output)} · ${mb(newSize)}`);
    } catch (err) {
      failed++;
      console.log("נכשל");
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  if (!write) {
    console.log(`\n${done} סרטונים היו מומרים. להרצה: --write`);
    return;
  }
  console.log(
    `\n✓ ${done} שודרגו, ${failed} נכשלו, ${untouched} נשארו כמו שהם.`
  );
  console.log(`תוספת לנפח המוגש: ${mb(growth)}`);
}

main();
