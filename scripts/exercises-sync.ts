/**
 * סנכרון ספריית התרגילים בלבד:
 *   npm run exercises:sync
 *
 * למה זה קיים ולא משתמשים ב-seed:
 * seed.ts מריץ DELETE FROM workouts לכל תבנית ובונה אותה מחדש. בגלל
 * מחיקה מדורגת זה מוחק גם את פריטי האימון, ו-set_logs מצביע אליהם לפי
 * מזהה. כלומר הרצה של seed על מסד חי מייתמת את היסטוריית האימונים של
 * כל מי שמשויך לתבנית. הסקריפט הזה נוגע בטבלת exercises בלבד.
 *
 * בטוח להרצה חוזרת. תרגיל קיים מתעדכן, חדש נוסף, ואף אחד לא נמחק.
 * שיוך סרטון וסימון גומייה לא נדרסים, כי הם לא נכללים בעדכון.
 */
import { ALL_EXERCISES } from "../src/lib/exercises-data";
import db, { initDb } from "../src/lib/db";

async function main() {
  await initDb();

  const before = await db.execute("SELECT id, name FROM exercises");
  const known = new Map(before.rows.map((r) => [String(r.id), String(r.name)]));

  let added = 0;
  let renamed = 0;

  for (const [i, ex] of ALL_EXERCISES.entries()) {
    const existing = known.get(ex.id);
    if (existing == null) added++;
    else if (existing !== ex.name) {
      renamed++;
      console.log(`  שם שונה: "${existing}" → "${ex.name}"`);
    }

    await db.execute({
      sql: `INSERT INTO exercises
              (id,name,category,kind,type,tempo,muscles,description,technique,tips,video_file,unilateral,position)
            VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name, category=excluded.category, kind=excluded.kind,
              type=excluded.type, tempo=excluded.tempo, muscles=excluded.muscles,
              description=excluded.description, technique=excluded.technique,
              tips=excluded.tips, unilateral=excluded.unilateral, position=excluded.position`,
      args: [
        ex.id, ex.name, ex.category, ex.kind, ex.type, ex.tempo, ex.muscles,
        ex.description, JSON.stringify(ex.technique), JSON.stringify(ex.tips),
        ex.unilateral ? 1 : 0, i,
      ],
    });
  }

  // תרגילים שיש במסד ואינם בקוד. לא נמחקים, רק מדווחים.
  const codeIds = new Set(ALL_EXERCISES.map((e) => e.id));
  const orphans = before.rows.filter((r) => !codeIds.has(String(r.id)));

  const after = await db.execute("SELECT COUNT(*) n FROM exercises");
  const noText = await db.execute(
    "SELECT name FROM exercises WHERE technique = '[]' ORDER BY position"
  );

  console.log(`\n✓ ${ALL_EXERCISES.length} תרגילים סונכרנו`);
  console.log(`  ${added} נוספו, ${renamed} שונו בשם`);
  console.log(`  סך הכל במסד: ${after.rows[0].n}`);

  if (orphans.length) {
    console.log(`\n⚠ ${orphans.length} תרגילים במסד שאינם בקוד (לא נמחקו):`);
    for (const o of orphans) console.log("   ", o.name);
  }

  if (noText.rows.length) {
    console.log(`\nממתינים לטקסט מאיתי (${noText.rows.length}):`);
    for (const r of noText.rows) console.log("   ", r.name);
  }
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
