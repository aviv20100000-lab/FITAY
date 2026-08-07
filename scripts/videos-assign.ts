/**
 * כותב למסד את השיוכים מ-matches.json שהדף review.html מייצר.
 *   npx tsx --env-file=.env.local ..\video-tools\apply-matches.ts <נתיב ל-matches.json>
 * בלי --write הסקריפט רק מדפיס מה הוא היה עושה.
 *
 * קליפ שאין לו שורה בטבלת videos מדולג, כי אין לו כתובת להצביע אליה.
 * הסקריפט לא מוחק שום שיוך קיים, רק מחליף שיוך של תרגיל שמופיע בקובץ.
 */
import { pathToFileURL } from "url";
import { join } from "path";
import { readFileSync } from "fs";

type Entry = { exercise: string; band?: boolean };

async function main() {
  const file = process.argv[2];
  const write = process.argv.includes("--write");
  if (!file) {
    console.error('חסר נתיב. דוגמה: apply-matches.ts "C:\\Users\\owner\\Downloads\\matches.json"');
    process.exit(1);
  }

  const mod = await import(pathToFileURL(join(process.cwd(), "src", "lib", "db.ts")).href);
  const db = mod.default;

  const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, Entry>;

  const vids = await db.execute("SELECT filename, url FROM videos");
  const urlByBase = new Map<string, string>();
  for (const v of vids.rows) {
    urlByBase.set(String(v.filename).replace(/\.[^.]+$/, ""), String(v.url));
  }

  const ex = await db.execute("SELECT id FROM exercises");
  const known = new Set(ex.rows.map((r: Record<string, unknown>) => String(r.id)));

  let planned = 0;
  const skipped: string[] = [];

  for (const [clip, entry] of Object.entries(parsed)) {
    if (!entry?.exercise) continue;
    if (!known.has(entry.exercise)) {
      skipped.push(`${clip}: תרגיל לא מוכר ${entry.exercise}`);
      continue;
    }
    const url = urlByBase.get(clip);
    if (!url) {
      skipped.push(`${clip}: לא נמצא באחסון`);
      continue;
    }
    const column = entry.band ? "band_video_file" : "video_file";
    console.log(`${entry.exercise}.${column} → ${clip}`);
    planned++;
    if (write) {
      await db.execute({
        sql: `UPDATE exercises SET ${column} = ? WHERE id = ?`,
        args: [url, entry.exercise],
      });
    }
  }

  if (skipped.length) {
    console.log("\nדולגו:");
    for (const s of skipped) console.log("  " + s);
  }
  console.log(`\n${planned} שיוכים ${write ? "נכתבו" : "מוכנים לכתיבה, הרץ עם --write"}.`);
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
