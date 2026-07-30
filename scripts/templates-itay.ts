/**
 * הוספת התוכניות של איתי:
 *   npm run templates:itay
 *
 * מוסיף בלבד. התבניות הישנות לא נוגעים בהן, כי מתאמנים משויכים אליהן
 * ויש עליהן היסטוריית אימונים.
 *
 * בטוח להרצה חוזרת, אבל עם סייג אחד שחשוב להבין:
 * הרצה חוזרת בונה מחדש את האימונים של התבניות האלה, ולכן מזהי פריטי
 * האימון מתחלפים. אם כבר יש מתאמן שמשויך לתבנית הזאת ורשם עליה סטים,
 * ההיסטוריה שלו תתייתם. לכן הסקריפט עוצר אם הוא מזהה סטים רשומים,
 * אלא אם מריצים אותו עם --force.
 */
import { randomUUID } from "crypto";
import { ITAY_TEMPLATES } from "../src/lib/program-templates-itay";
import db, { initDb } from "../src/lib/db";

async function main() {
  await initDb();
  const force = process.argv.includes("--force");

  const ids = ITAY_TEMPLATES.map((t) => t.id);
  const placeholders = ids.map(() => "?").join(",");

  // האם כבר נרשמו סטים על התבניות האלה
  const logged = await db.execute({
    sql: `SELECT COUNT(*) n FROM set_logs
           WHERE workout_id IN (SELECT id FROM workouts WHERE program_id IN (${placeholders}))`,
    args: ids,
  });
  const loggedCount = Number(logged.rows[0].n);

  if (loggedCount > 0 && !force) {
    console.error(
      `עצירה: כבר רשומים ${loggedCount} סטים על התוכניות האלה.\n` +
        "בנייה מחדש תייתם אותם. אם אתה בטוח, הרץ שוב עם --force."
    );
    process.exit(1);
  }

  const now = new Date().toISOString();
  let workoutCount = 0;
  let itemCount = 0;

  for (const tpl of ITAY_TEMPLATES) {
    await db.execute({
      sql: `INSERT INTO programs (id,title,description,level,weeks,is_template,template_id,created_at)
            VALUES (?,?,?,?,?,1,NULL,?)
            ON CONFLICT(id) DO UPDATE SET
              title=excluded.title, description=excluded.description,
              level=excluded.level, weeks=excluded.weeks`,
      args: [tpl.id, tpl.title, tpl.description, tpl.level, tpl.weeks, now],
    });

    await db.execute({
      sql: "DELETE FROM workouts WHERE program_id = ?",
      args: [tpl.id],
    });

    for (const [wi, workout] of tpl.workouts.entries()) {
      const workoutId = randomUUID();
      // phase נשאר 1 בכל האימונים. במבנה של איתי אין שני שלבים בתוך רמה,
      // והעמודה מוגבלת במסד ל-1 או 2.
      await db.execute({
        sql: "INSERT INTO workouts (id,program_id,title,phase,position) VALUES (?,?,?,1,?)",
        args: [workoutId, tpl.id, workout.title, wi],
      });
      workoutCount++;

      for (const [ri, [exerciseId, sets, reps, seconds, rest]] of workout.rows.entries()) {
        const known = await db.execute({
          sql: "SELECT 1 FROM exercises WHERE id = ?",
          args: [exerciseId],
        });
        if (!known.rows.length) {
          console.error(`תרגיל לא נמצא בספרייה: ${exerciseId}`);
          process.exit(1);
        }

        await db.execute({
          sql: `INSERT INTO workout_items
                  (id,workout_id,exercise_id,position,sets,reps,seconds,rest,
                   ring_height,body_angle,video_file,notes)
                VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,'')`,
          args: [randomUUID(), workoutId, exerciseId, ri, sets, reps, seconds, rest],
        });
        itemCount++;
      }
    }
  }

  console.log(`✓ ${ITAY_TEMPLATES.length} תוכניות, ${workoutCount} אימונים, ${itemCount} תרגילים`);
  for (const t of ITAY_TEMPLATES) {
    console.log(`   ${t.title} — ${t.workouts.map((w) => w.title).join(", ")}`);
  }

  const all = await db.execute("SELECT COUNT(*) n FROM programs WHERE is_template = 1");
  console.log(`\nסך תבניות במסד: ${all.rows[0].n}`);
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
