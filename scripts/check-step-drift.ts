/*
 * בדיקת קריאה בלבד: כמה סטים נרשמו עם difficulty_step שגוי מאז מעבר
 * הסולם למיפתוח לפי תרגיל. הדרגה הנכונה לרגע הרישום משוחזרת מאירועי
 * ההקשיה, כי to_step רק עולה. שום כתיבה למסד.
 */
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SINCE = "2026-08-13T00:00:00.000Z";

async function main() {
  const mismatch = await db.execute({
    sql: `SELECT sl.trainee_id, sl.exercise_id, sl.logged_at,
                 sl.difficulty_step,
                 (SELECT COALESCE(MAX(pe.to_step), 0)
                    FROM progression_events pe
                    JOIN assignments a
                      ON a.id = pe.assignment_id
                   WHERE a.trainee_id = sl.trainee_id
                     AND pe.exercise_id = sl.exercise_id
                     AND pe.status IN ('earned','approved')
                     AND pe.created_at < sl.logged_at
                     AND pe.created_at >= a.assigned_at) AS expected_step
            FROM set_logs sl
           WHERE sl.logged_at >= ?
           ORDER BY sl.logged_at`,
    args: [SINCE],
  });

  const names = await db.execute(
    "SELECT id, name FROM users WHERE role = 'trainee'"
  );
  const nameOf = new Map(names.rows.map((r) => [String(r.id), String(r.name)]));

  const wrong = mismatch.rows.filter(
    (r) => Number(r.difficulty_step) !== Number(r.expected_step)
  );
  console.log(`סטים שנרשמו מאז ${SINCE}: ${mismatch.rows.length}`);
  console.log(`מתוכם עם דרגה שגויה: ${wrong.length}`);
  for (const r of wrong) {
    console.log(
      `  ${nameOf.get(String(r.trainee_id)) ?? r.trainee_id} תרגיל ${r.exercise_id} ב-${r.logged_at}: נרשם ${r.difficulty_step}, צפוי ${r.expected_step}`
    );
  }
}

main();
