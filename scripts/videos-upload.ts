/**
 * העלאת סרטונים ל-Cloudflare R2:
 *   npm run videos:upload -- "C:\נתיב\לתיקייה"
 *
 * הקבצים גדולים מדי בשביל GitHub, ולכן הם יושבים באחסון והמסד שומר רק
 * את הכתובת. הסקריפט בטוח להרצה חוזרת: קובץ שכבר הועלה (לפי טביעת אצבע
 * של התוכן) מדולג, גם אם שינית לו את השם.
 *
 * דורש את משתני R2 ב-.env.local. עד אוגוסט 2026 היעד היה Vercel Blob,
 * והמעבר נעשה אחרי שהמאגר שם הושעה וחסם גם קריאה.
 */
import { createHash, randomUUID } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { extname, join } from "path";
import db, { initDb } from "../src/lib/db";
import { putObject, contentTypeFor } from "../src/lib/r2";

const PLAYABLE = new Set([".mp4", ".m4v", ".webm"]);
const QUICKTIME = new Set([".mov"]);

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + "MB";

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('חסר נתיב. דוגמה: npm run videos:upload -- "C:\\videos"');
    process.exit(1);
  }
  for (const key of ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"]) {
    if (!process.env[key]) {
      console.error(`${key} חסר ב-.env.local. ראה את ההגדרות בלוח הבקרה של R2.`);
      process.exit(1);
    }
  }

  await initDb();

  const files = readdirSync(dir)
    .filter((f) => {
      const ext = extname(f).toLowerCase();
      return PLAYABLE.has(ext) || QUICKTIME.has(ext);
    })
    .sort();

  if (!files.length) {
    console.log("לא נמצאו סרטונים בתיקייה.");
    return;
  }

  const existing = await db.execute("SELECT hash, filename FROM videos");
  const known = new Set(existing.rows.map((r) => String(r.hash)));

  let uploaded = 0;
  let skipped = 0;
  const quicktime: string[] = [];

  for (const file of files) {
    const path = join(dir, file);
    const size = statSync(path).size;
    const body = readFileSync(path);
    const hash = createHash("sha256").update(body).digest("hex");

    if (known.has(hash)) {
      console.log(`• ${file} — כבר הועלה, מדלג`);
      skipped++;
      continue;
    }

    if (QUICKTIME.has(extname(file).toLowerCase())) quicktime.push(file);

    process.stdout.write(`↑ ${file} (${mb(size)}) … `);
    const url = await putObject(`videos/${file}`, body, contentTypeFor(file));

    // הקבצים כאן כבר עברו את videos:convert, ולכן אין מה לדחוס שוב.
    await db.execute({
      sql: `INSERT INTO videos (id,filename,url,hash,size,label,uploaded_at,compress_state)
            VALUES (?,?,?,?,?,'',?,'done')`,
      args: [randomUUID(), file, url, hash, size, new Date().toISOString()],
    });

    known.add(hash);
    uploaded++;
    console.log("הועלה");
  }

  console.log(`\n✓ ${uploaded} הועלו, ${skipped} דולגו.`);

  if (quicktime.length) {
    console.log(
      "\n⚠ קבצי .mov לא מתנגנים בכרום ובאנדרואיד — רק בספארי.\n" +
        "  הומלץ להמיר ל-mp4 לפני ההעלאה:\n" +
        "  npm run videos:convert -- \"<תיקיית מקור>\" \"<תיקיית יעד>\"\n" +
        "  הקבצים שהועלו כ-mov: " +
        quicktime.join(", ")
    );
  }

  console.log("\nעכשיו: מסך המאמן → תרגילים → בחר סרטון לכל תרגיל.");
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
