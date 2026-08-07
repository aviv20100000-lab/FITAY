/**
 * העברת שורות ישנות מכתובות Vercel Blob לכתובות R2.
 *   npx tsx --env-file=.env.local scripts/videos-repoint.ts <תיקיית מקור> [--write]
 *
 * המאגר בוורסל הושעה ומחזיר 403 גם על קריאה, ולכן כל כתובת ישנה מתה.
 * לכל שורה בטבלת videos שעדיין מצביעה לשם, הסקריפט מחפש עותק מקומי לפי
 * שם הקובץ, מעלה אותו ל-R2 ומעדכן את הכתובת בכל מקום שמצביע אליה.
 *
 * בלי --write רק מדפיס מה היה קורה. שורה בלי עותק מקומי לא נמחקת, רק
 * מדווחת, כי אין דרך לשחזר אותה בלי לפתוח מחדש את המאגר בוורסל.
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, extname } from "path";
import db, { initDb } from "../src/lib/db";
import { putObject, contentTypeFor, isOurStorage } from "../src/lib/r2";

async function main() {
  const dir = process.argv[2];
  const write = process.argv.includes("--write");
  if (!dir || !existsSync(dir)) {
    console.error('חסרה תיקיית מקור. דוגמה: scripts/videos-repoint.ts "C:\\videos-web"');
    process.exit(1);
  }

  await initDb();

  // התאמה לפי השם בלי הסיומת, כי חלק מהשורות נשמרו כ-mov והעותק המקומי mp4.
  const local = new Map<string, string>();
  for (const f of readdirSync(dir)) {
    if (![".mp4", ".m4v", ".webm"].includes(extname(f).toLowerCase())) continue;
    local.set(f.replace(/\.[^.]+$/, ""), join(dir, f));
  }

  const rows = await db.execute("SELECT id, filename, url FROM videos ORDER BY filename");
  const stale = rows.rows.filter((r) => !isOurStorage(String(r.url)));
  console.log(`שורות שעדיין מצביעות לאחסון הישן: ${stale.length} מתוך ${rows.rows.length}`);

  let moved = 0;
  const lost: string[] = [];

  for (const row of stale) {
    const filename = String(row.filename);
    const base = filename.replace(/\.[^.]+$/, "");
    const path = local.get(base);
    if (!path) {
      lost.push(filename);
      continue;
    }

    const target = `videos/${base}.mp4`;
    console.log(`${filename} → ${target}`);
    if (!write) {
      moved++;
      continue;
    }

    const body = readFileSync(path);
    const url = await putObject(target, body, contentTypeFor(target));
    const oldUrl = String(row.url);

    await db.execute({
      sql: "UPDATE videos SET url = ?, filename = ?, compress_state = 'done' WHERE id = ?",
      args: [url, `${base}.mp4`, String(row.id)],
    });
    // כל מי שהצביע לכתובת המתה עובר יחד איתה, אחרת השיוך היה נשבר.
    for (const table of ["exercises", "workout_items"]) {
      await db.execute({
        sql: `UPDATE ${table} SET video_file = ? WHERE video_file = ?`,
        args: [url, oldUrl],
      });
    }
    await db.execute({
      sql: "UPDATE exercises SET band_video_file = ? WHERE band_video_file = ?",
      args: [url, oldUrl],
    });
    moved++;
  }

  console.log(`\n${moved} ${write ? "הועברו" : "מוכנים להעברה, הרץ עם --write"}.`);
  if (lost.length) {
    console.log(`\nבלי עותק מקומי, נשארים מתים: ${lost.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
