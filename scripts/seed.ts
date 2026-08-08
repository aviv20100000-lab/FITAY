/**
 * הרצה חד-פעמית: npm run db:seed
 *
 * יוצר את הטבלאות, מכניס את 11 התרגילים מהחוברת ואת 6 תרגילי החימום,
 * ובונה את שלוש תבניות התוכניות.
 * חשבון המאמן נוצר רק אם הוגדרו COACH_PHONE ו-COACH_PASSWORD ב-.env.local —
 * כדי שסיסמאות לא יישבו בקוד. הסקריפט בטוח להרצה חוזרת.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import db, { initDb } from "../src/lib/db";
import { ALL_EXERCISES } from "../src/lib/exercises-data";
import { TEMPLATES } from "../src/lib/program-templates";
import { normalizePhone } from "../src/lib/auth";

async function main() {
  await initDb();
  console.log("✓ טבלאות נוצרו");

  for (const [i, ex] of ALL_EXERCISES.entries()) {
    await db.execute({
      sql: `INSERT INTO exercises
              (id,name,category,kind,type,progression,tempo,muscles,description,technique,tips,video_file,unilateral,position)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name, category=excluded.category, kind=excluded.kind,
              type=excluded.type, progression=excluded.progression,
              tempo=excluded.tempo, muscles=excluded.muscles,
              description=excluded.description, technique=excluded.technique,
              tips=excluded.tips, unilateral=excluded.unilateral, position=excluded.position`,
      args: [
        ex.id, ex.name, ex.category, ex.kind, ex.type,
        ex.progression ?? "stance", ex.tempo, ex.muscles,
        ex.description, JSON.stringify(ex.technique), JSON.stringify(ex.tips),
        ex.unilateral ? 1 : 0, i,
      ],
    });
  }
  console.log(`✓ ${ALL_EXERCISES.length} תרגילים הוכנסו (כולל חימום)`);

  // ── תבניות התוכניות ──────────────────────────────────────────────────
  // התבנית עצמה נשארת עם אותו id, אבל האימונים שבתוכה נבנים מחדש בכל הרצה
  // כדי שעדכון ב-program-templates.ts באמת יגיע למסד. תוכניות אישיות
  // ששוכפלו מהתבנית אינן נוגעות בזה — הן שורות נפרדות משלהן.
  const now = new Date().toISOString();
  for (const tpl of TEMPLATES) {
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

    let position = 0;
    for (const [phaseIndex, phase] of tpl.phases.entries()) {
      for (const workout of phase.workouts) {
        const workoutId = randomUUID();
        await db.execute({
          sql: "INSERT INTO workouts (id,program_id,title,phase,position) VALUES (?,?,?,?,?)",
          args: [workoutId, tpl.id, workout.title, phaseIndex + 1, position++],
        });
        for (const [i, [exerciseId, sets, reps, seconds, rest]] of workout.rows.entries()) {
          await db.execute({
            sql: `INSERT INTO workout_items
                    (id,workout_id,exercise_id,position,sets,reps,seconds,rest,ring_height,body_angle,video_file,notes)
                  VALUES (?,?,?,?,?,?,?,?,?,?,NULL,'')`,
            args: [
              randomUUID(), workoutId, exerciseId, i, sets, reps, seconds, rest,
              phase.ringHeight, phase.bodyAngle,
            ],
          });
        }
      }
    }
    console.log(`✓ תבנית: ${tpl.title}`);
  }

  const phone = process.env.COACH_PHONE;
  const password = process.env.COACH_PASSWORD;
  if (phone && password) {
    const normalized = normalizePhone(phone);
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE phone = ?",
      args: [normalized],
    });
    if (existing.rows.length) {
      console.log("• חשבון המאמן כבר קיים — לא שוניתי אותו");
    } else {
      await db.execute({
        sql: `INSERT INTO users (id,name,phone,password_hash,role,active,rehab_mode,notes,session_version,created_at)
              VALUES (?,?,?,?, 'coach', 1, 0, '', 1, ?)`,
        args: [
          randomUUID(),
          process.env.COACH_NAME || "איתי סרד",
          normalized,
          await bcrypt.hash(password, 10),
          new Date().toISOString(),
        ],
      });
      console.log("✓ חשבון המאמן נוצר");
    }
  } else {
    console.log("• דילגתי על חשבון המאמן (חסרים COACH_PHONE / COACH_PASSWORD)");
  }

  console.log("\nהכל מוכן.");
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
