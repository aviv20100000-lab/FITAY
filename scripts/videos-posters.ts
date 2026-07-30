/**
 * מייצר תמונת פתיחה לכל סרטון בקטלוג שאין לו אחת.
 *
 * הרצה:  npm run videos:posters
 *        npm run videos:posters -- --force     כדי לייצר מחדש גם למי שיש
 *
 * בטוח להרצה חוזרת. סרטון שכבר יש לו תמונה מדולג, ולכן אפשר להריץ שוב
 * אחרי שהוספת קליפים בלי לשלם על עיבוד של כל השאר.
 *
 * רץ ברצף ולא במקביל, בכוונה. ffmpeg לוקח את כל הליבות שיש לו, ושלוש
 * המרות במקביל על מחשב נייד רק מאיטות אחת את השנייה.
 */
import db, { initDb } from "../src/lib/db";
import { generatePoster } from "../src/lib/video-poster";

async function main() {
  const force = process.argv.includes("--force");

  await initDb();
  const res = await db.execute(
    force
      ? "SELECT id, filename FROM videos ORDER BY uploaded_at"
      : "SELECT id, filename FROM videos WHERE poster_url IS NULL ORDER BY uploaded_at"
  );

  if (!res.rows.length) {
    console.log("אין סרטונים שצריכים תמונת פתיחה.");
    return;
  }

  console.log(`${res.rows.length} סרטונים לעיבוד\n`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, row] of res.rows.entries()) {
    const id = String(row.id);
    const name = String(row.filename);
    process.stdout.write(`[${index + 1}/${res.rows.length}] ${name} … `);

    const outcome = await generatePoster(id, { force });
    if (outcome.status === "done") {
      done++;
      console.log(`✓ ${(outcome.bytes / 1024).toFixed(0)}KB`);
    } else if (outcome.status === "skipped") {
      skipped++;
      console.log(`דילוג: ${outcome.reason}`);
    } else {
      failed++;
      console.log(`✗ ${outcome.reason}`);
    }
  }

  console.log(`\nנוצרו ${done} · דילוג ${skipped} · נכשלו ${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
