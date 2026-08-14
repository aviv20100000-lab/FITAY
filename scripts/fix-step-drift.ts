/*
 * תיקון נקודתי של דרגות שגויות ב-set_logs, שריד מיזוג הסולמות של
 * item_progress לפי exercise_id (13 באוגוסט 2026).
 *
 * כל הפרמטרים משורת הפקודה, בכוונה: מזהה מתאמן צרוב בריפו היה נשאר שם
 * לתמיד, וסקריפט תיקון בלי פרמטרים קל מדי להריץ על הדבר הלא נכון.
 *
 * שימוש:
 *   npx tsx --env-file=.env.local scripts/fix-step-drift.ts <traineeId> <exerciseId> <sinceISO> <toStep>
 *
 * ההרצה מ-14 באוגוסט 2026 (18 שורות, הערכים המקוריים בקובץ ה-json שליד):
 *   ... fix-step-drift.ts 0f773b3c-89a7-4408-9ca0-d1d85b5ac1b8 fly_single 2026-08-13 3
 */
import { createClient } from "@libsql/client";

const [traineeId, exerciseId, since, toStepRaw] = process.argv.slice(2);
const toStep = Number(toStepRaw);
if (!traineeId || !exerciseId || !since || !Number.isInteger(toStep)) {
  console.error("שימוש: fix-step-drift.ts <traineeId> <exerciseId> <sinceISO> <toStep>");
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const result = await db.execute({
    sql: `UPDATE set_logs SET difficulty_step = ?
           WHERE trainee_id = ? AND exercise_id = ?
             AND logged_at >= ? AND difficulty_step <> ?`,
    args: [toStep, traineeId, exerciseId, since, toStep],
  });
  console.log(`עודכנו ${result.rowsAffected} שורות לדרגה ${toStep}`);
}

main();
