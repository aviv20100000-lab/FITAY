/*
 * שחזור 18 השורות שעודכנו ב-14 באוגוסט 2026 לערכיהן המקוריים, מתוך
 * fix-step-drift.original.json.
 *
 * למה משחזרים: העדכון ל-3 התברר כטעות. הסטים בוצעו לפני מיזוג הסולמות,
 * במנח של דרגה 1 ו-2 כפי שהאפליקציה הציגה אז, והעמודה מתעדת את הדרגה
 * שבה הסט בוצע בפועל. הערכים המקוריים הם האמת, ובלעדיהם המילוי של
 * דרגה 3 ניזון ממספרים שהושגו במנח קל יותר.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const record = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fix-step-drift.original.json"),
    "utf8"
  )
) as {
  עודכן_ל: number;
  שורות_מקוריות: {
    trainee_id: string;
    exercise_id: string;
    logged_at: string;
    difficulty_step: number;
    sets: number;
  }[];
};

async function main() {
  let total = 0;
  for (const row of record["שורות_מקוריות"]) {
    const result = await db.execute({
      sql: `UPDATE set_logs SET difficulty_step = ?
             WHERE trainee_id = ? AND exercise_id = ? AND logged_at = ?
               AND difficulty_step = ?`,
      args: [
        row.difficulty_step,
        row.trainee_id,
        row.exercise_id,
        row.logged_at,
        record["עודכן_ל"],
      ],
    });
    total += result.rowsAffected;
    console.log(
      `${row.exercise_id} ב-${row.logged_at}: הוחזרו ${result.rowsAffected} סטים לדרגה ${row.difficulty_step} (צפוי: ${row.sets})`
    );
  }
  console.log(`סך הכל שוחזרו ${total} סטים (צפוי: 18)`);
}

main();
