/*
 * סריקת קריאה בלבד: סטים שנרשמו עם difficulty_step שונה מהדרגה שהייתה
 * בתוקף ברגע הרישום. שום כתיבה למסד.
 *
 * הדרגה הצפויה משוחזרת מאירועי ההקשיה של השיוך שהסט שייך אליו, כי
 * to_step רק עולה בתוך ריצה. ההצמדה לשיוך נעשית דרך התוכנית של האימון
 * והשיוך האחרון שהתחיל לפני הרישום: ל-set_logs אין עמודת שיוך, ושיוך
 * חוזר של אותה תוכנית מאפס את הסולם, כך שהשוואה מול אירועים מריצה
 * אחרת הייתה מייצרת התרעות שווא.
 *
 * שימוש: npx tsx --env-file=.env.local scripts/check-step-drift.ts [sinceISO]
 * בלי פרמטר נסרק הכל.
 */
import { createClient } from "@libsql/client";

const since = process.argv[2] ?? "";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const res = await db.execute({
    sql: `SELECT sl.trainee_id, sl.exercise_id, sl.logged_at, sl.difficulty_step,
                 (SELECT COALESCE(MAX(pe.to_step), 0)
                    FROM progression_events pe
                   WHERE pe.exercise_id = sl.exercise_id
                     AND pe.created_at < sl.logged_at
                     AND pe.assignment_id = (
                           SELECT a.id FROM assignments a
                             JOIN workouts w ON w.id = sl.workout_id
                            WHERE a.trainee_id = sl.trainee_id
                              AND a.program_id = w.program_id
                              AND a.assigned_at <= sl.logged_at
                            ORDER BY a.assigned_at DESC LIMIT 1)
                 ) AS expected_step
            FROM set_logs sl
           WHERE sl.logged_at >= ?
           ORDER BY sl.logged_at`,
    args: [since],
  });

  const wrong = res.rows.filter(
    (r) => Number(r.difficulty_step) !== Number(r.expected_step)
  );
  const byTrainee = new Map<string, number>();
  const byPair = new Map<string, { count: number; steps: Set<string> }>();
  for (const r of wrong) {
    const trainee = String(r.trainee_id);
    byTrainee.set(trainee, (byTrainee.get(trainee) ?? 0) + 1);
    const pair = `${trainee} · ${r.exercise_id}`;
    const entry = byPair.get(pair) ?? { count: 0, steps: new Set<string>() };
    entry.count += 1;
    entry.steps.add(`נרשם ${r.difficulty_step} צפוי ${r.expected_step}`);
    byPair.set(pair, entry);
  }

  console.log(`נסרקו ${res.rows.length} סטים${since ? ` מאז ${since}` : ", כל ההיסטוריה"}`);
  console.log(`חורגים: ${wrong.length} סטים אצל ${byTrainee.size} מתאמנים`);
  for (const [pair, entry] of byPair) {
    console.log(`  ${pair}: ${entry.count} סטים (${[...entry.steps].join(", ")})`);
  }
}

main();
