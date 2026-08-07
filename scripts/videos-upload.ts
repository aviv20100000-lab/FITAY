/**
 * העלאת סרטונים ל-Vercel Blob:
 *   npm run videos:upload -- "C:\נתיב\לתיקייה"
 *
 * הקבצים גדולים מדי בשביל GitHub, ולכן הם יושבים ב-Blob והמסד שומר רק
 * את הכתובת. הסקריפט בטוח להרצה חוזרת: קובץ שכבר הועלה (לפי טביעת אצבע
 * של התוכן) מדולג, גם אם שינית לו את השם.
 *
 * דורש BLOB_READ_WRITE_TOKEN ב-.env.local — נוצר ב-Vercel תחת
 * Storage → Blob → Connect Project.
 */
import { put } from "@vercel/blob";
import { createHash, randomUUID } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { extname, join } from "path";
import db, { initDb } from "../src/lib/db";

const PLAYABLE = new Set([".mp4", ".m4v", ".webm"]);
const QUICKTIME = new Set([".mov"]);

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + "MB";

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('חסר נתיב. דוגמה: npm run videos:upload -- "C:\\videos"');
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "BLOB_READ_WRITE_TOKEN חסר ב-.env.local.\n" +
        "ב-Vercel: Storage → Blob → Connect Project, ואז הדבק את הטוקן."
    );
    process.exit(1);
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
    // הטוקן מועבר במפורש, כמו ב-video-compress.ts ו-video-poster.ts.
    // הספרייה מזהה שהפרויקט עובד עם OIDC ונופלת על "OIDC is enabled for
    // this project, but not for the development environment" עוד לפני
    // שהיא מסתכלת על הטוקן הרגיל, ולכן הרצה מהמחשב נכשלה כאן.
    const blob = await put(`videos/${file}`, body, {
      access: "public",
      addRandomSuffix: true,
      multipart: size > 20 * 1024 * 1024,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    await db.execute({
      sql: `INSERT INTO videos (id,filename,url,hash,size,label,uploaded_at)
            VALUES (?,?,?,?,?,'',?)`,
      args: [randomUUID(), file, blob.url, hash, size, new Date().toISOString()],
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
