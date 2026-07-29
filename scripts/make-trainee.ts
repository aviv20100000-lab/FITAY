/**
 * יצירת מתאמן מהטרמינל — בעיקר לבדיקות:
 *   npm run make:trainee -- "שם" 0541234567 סיסמה [רמה]
 *
 * אם צוינה רמה (1-3), התבנית של אותה רמה משוכפלת לתוכנית אישית ומשויכת
 * למתאמן — כך שיש מה לראות מיד במסך הבית שלו. התבנית עצמה נשארת נקייה.
 *
 * במסלול הרגיל איתי פותח מתאמנים מהאפליקציה. זה קיצור דרך, לא תחליף.
 */
import { randomUUID } from "crypto";
import db, { initDb } from "../src/lib/db";
import { hashPassword, normalizePhone } from "../src/lib/auth";

async function cloneTemplate(level: number, traineeName: string) {
  const tplRes = await db.execute({
    sql: "SELECT * FROM programs WHERE is_template = 1 AND level = ? LIMIT 1",
    args: [level],
  });
  const tpl = tplRes.rows[0];
  if (!tpl) {
    console.log(`• אין תבנית לרמה ${level} — דילגתי על שיוך תוכנית`);
    return null;
  }

  const programId = randomUUID();
  await db.execute({
    sql: `INSERT INTO programs (id,title,description,level,weeks,is_template,template_id,created_at)
          VALUES (?,?,?,?,?,0,?,?)`,
    args: [
      programId,
      `${String(tpl.title)} — ${traineeName}`,
      String(tpl.description ?? ""),
      Number(tpl.level),
      Number(tpl.weeks),
      String(tpl.id),
      new Date().toISOString(),
    ],
  });

  const workouts = await db.execute({
    sql: "SELECT * FROM workouts WHERE program_id = ? ORDER BY position",
    args: [String(tpl.id)],
  });

  for (const w of workouts.rows) {
    const workoutId = randomUUID();
    await db.execute({
      sql: "INSERT INTO workouts (id,program_id,title,phase,position) VALUES (?,?,?,?,?)",
      args: [
        workoutId,
        programId,
        String(w.title),
        Number(w.phase),
        Number(w.position),
      ],
    });

    const items = await db.execute({
      sql: "SELECT * FROM workout_items WHERE workout_id = ? ORDER BY position",
      args: [String(w.id)],
    });
    for (const i of items.rows) {
      await db.execute({
        sql: `INSERT INTO workout_items
                (id,workout_id,exercise_id,position,sets,reps,seconds,rest,ring_height,body_angle,video_file,notes)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          randomUUID(), workoutId, String(i.exercise_id), Number(i.position),
          Number(i.sets), i.reps, i.seconds, Number(i.rest),
          i.ring_height, i.body_angle, i.video_file, String(i.notes ?? ""),
        ],
      });
    }
  }

  return programId;
}

async function main() {
  const [name, phoneInput, password, levelInput] = process.argv.slice(2);
  if (!name || !phoneInput || !password) {
    console.error('שימוש: npm run make:trainee -- "שם" 0541234567 סיסמה [רמה]');
    process.exit(1);
  }
  if (password.length < 4) {
    console.error("הסיסמה צריכה לפחות 4 תווים");
    process.exit(1);
  }

  await initDb();
  const phone = normalizePhone(phoneInput);

  const taken = await db.execute({
    sql: "SELECT id, name FROM users WHERE phone = ?",
    args: [phone],
  });
  if (taken.rows.length) {
    console.error(`כבר קיים משתמש עם הטלפון הזה: ${taken.rows[0].name}`);
    process.exit(1);
  }

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO users (id,name,phone,password_hash,role,active,rehab_mode,notes,session_version,created_at)
          VALUES (?,?,?,?, 'trainee', 1, 0, '', 1, ?)`,
    args: [id, name, phone, await hashPassword(password), new Date().toISOString()],
  });
  console.log(`✓ מתאמן נוצר: ${name} · ${phone}`);

  const level = Number(levelInput);
  if (level >= 1 && level <= 3) {
    const programId = await cloneTemplate(level, name);
    if (programId) {
      await db.execute({
        sql: "INSERT INTO assignments (trainee_id,program_id,assigned_at) VALUES (?,?,?)",
        args: [id, programId, new Date().toISOString()],
      });
      console.log(`✓ תוכנית רמה ${level} שוכפלה ושויכה`);
    }
  }
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
