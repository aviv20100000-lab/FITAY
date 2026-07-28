/**
 * הרצה חד-פעמית: npm run db:seed
 *
 * יוצר את הטבלאות ומכניס את 11 התרגילים מהחוברת.
 * חשבון המאמן נוצר רק אם הוגדרו COACH_PHONE ו-COACH_PASSWORD ב-.env.local —
 * כדי שסיסמאות לא יישבו בקוד. הסקריפט בטוח להרצה חוזרת.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import db, { initDb } from "../src/lib/db";
import { EXERCISES } from "../src/lib/exercises-data";
import { normalizePhone } from "../src/lib/auth";

async function main() {
  await initDb();
  console.log("✓ טבלאות נוצרו");

  for (const [i, ex] of EXERCISES.entries()) {
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
  console.log(`✓ ${EXERCISES.length} תרגילים הוכנסו`);

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
