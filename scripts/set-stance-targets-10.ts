/**
 * חד-פעמי: מיישר את היעד ל-10 בכל פריטי התוכנית של תרגילי רמות המנח.
 *
 *   npx tsx --env-file=.env.local scripts/set-stance-targets-10.ts
 *
 * הכלל של איתי: בתרגילי שלושת המנחים השער הוא 10 באחד הסטים, ולכן
 * התקרה בתוכנית חייבת להיות 10. תרגילים חדשים כבר מקבלים 10 כברירת
 * מחדל בעורך; הסקריפט הזה מתקן רק את מה שנוצר לפני הכלל.
 * מותר למחוק את הקובץ אחרי ההרצה.
 */
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  authToken: process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN,
});

const LEVELED = `SELECT id FROM exercises
  WHERE stance_video_level_2 IS NOT NULL OR stance_video_level_3 IS NOT NULL`;

async function snapshot(label: string) {
  const res = await db.execute(`
    SELECT e.name, i.reps, COUNT(*) AS items
      FROM workout_items i JOIN exercises e ON e.id = i.exercise_id
     WHERE i.exercise_id IN (${LEVELED})
     GROUP BY e.name, i.reps ORDER BY e.name`);
  console.log(label);
  for (const r of res.rows) {
    console.log(`  ${r.name}: תקרה ${r.reps} (${r.items} פריטים)`);
  }
}

async function main() {
  await snapshot("לפני:");
  const res = await db.execute(`
    UPDATE workout_items SET reps = 10
     WHERE reps IS NOT NULL AND reps <> 10
       AND exercise_id IN (${LEVELED})`);
  console.log(`עודכנו ${res.rowsAffected} פריטים.`);
  await snapshot("אחרי:");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
