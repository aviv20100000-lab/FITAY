/**
 * ניקוי כפילויות בקטלוג הסרטונים.
 *   npx tsx --env-file=.env.local scripts/videos-dedupe.ts [--write]
 *
 * המעבר ל-R2 יצר זוגות: שורת mov ישנה ושורת mp4 חדשה שהצביעו לאותו קובץ
 * אחרי ההמרה. התרגילים מצביעים לכתובת ולא למזהה השורה, ולכן מחיקת העודפת
 * לא שוברת שום שיוך. נשמרת השורה הוותיקה, זו שכבר יש לה פוסטר.
 */
import db, { initDb } from "../src/lib/db";

async function main() {
  const write = process.argv.includes("--write");
  await initDb();

  const rows = await db.execute(
    "SELECT id, filename, url, poster_url, uploaded_at FROM videos ORDER BY uploaded_at"
  );

  const byUrl = new Map<string, typeof rows.rows>();
  for (const r of rows.rows) {
    const url = String(r.url);
    if (!byUrl.has(url)) byUrl.set(url, [] as unknown as typeof rows.rows);
    byUrl.get(url)!.push(r);
  }

  let removed = 0;
  for (const [url, group] of byUrl) {
    if (group.length < 2) continue;
    // מעדיפים את השורה שיש לה פוסטר, אחרת את הוותיקה מביניהן.
    const keep = group.find((r) => r.poster_url) ?? group[0];
    for (const r of group) {
      if (r.id === keep.id) continue;
      console.log(`מוחק כפילות ${r.filename} (${String(url).slice(-24)})`);
      if (write) {
        await db.execute({ sql: "DELETE FROM videos WHERE id = ?", args: [String(r.id)] });
      }
      removed++;
    }
  }

  console.log(`\n${removed} ${write ? "נמחקו" : "מוכנים למחיקה, הרץ עם --write"}.`);
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
