/** בדיקת שפיות: npm run db:check — מאמת שהכל מחובר ותקין, בלי להדפיס סודות. */
import db, { initDb } from "../src/lib/db";
import { login } from "../src/lib/auth";

const ok = (m: string) => console.log("  ✓ " + m);
const bad = (m: string) => console.log("  ✗ " + m);

async function main() {
  console.log("\n── משתני סביבה ──");
  for (const k of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "JWT_SECRET"]) {
    const v = process.env[k];
    v ? ok(`${k} — ${v.length} תווים`) : bad(`${k} חסר`);
  }

  console.log("\n── חיבור למסד ──");
  await initDb();
  ok("התחברות ל-Turso הצליחה");

  console.log("\n── טבלאות ──");
  const tables = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  const names = tables.rows.map((r) => String(r.name));
  for (const t of ["users", "exercises", "programs", "workouts", "workout_items", "assignments", "completions", "set_logs", "videos"]) {
    names.includes(t) ? ok(t) : bad(`${t} חסרה`);
  }

  console.log("\n── תוכן ──");
  const ex = await db.execute(
    "SELECT COUNT(*) c FROM exercises WHERE category <> 'warmup'"
  );
  const exCount = Number(ex.rows[0].c);
  exCount === 11 ? ok(`${exCount} תרגילים`) : bad(`${exCount} תרגילים (ציפיתי ל-11)`);

  const warm = await db.execute(
    "SELECT COUNT(*) c FROM exercises WHERE category = 'warmup'"
  );
  const warmCount = Number(warm.rows[0].c);
  warmCount === 6 ? ok(`${warmCount} תרגילי חימום`) : bad(`${warmCount} תרגילי חימום (ציפיתי ל-6)`);

  const tpl = await db.execute(`
    SELECT p.title, COUNT(w.id) AS workouts
      FROM programs p LEFT JOIN workouts w ON w.program_id = p.id
     WHERE p.is_template = 1
     GROUP BY p.id ORDER BY p.level
  `);
  if (tpl.rows.length === 3) {
    for (const r of tpl.rows) {
      Number(r.workouts) === 6
        ? ok(`${r.title} — ${r.workouts} אימונים`)
        : bad(`${r.title} — ${r.workouts} אימונים (ציפיתי ל-6)`);
    }
  } else {
    bad(`${tpl.rows.length} תבניות (ציפיתי ל-3)`);
  }

  const vids = await db.execute("SELECT COUNT(*) c FROM videos");
  const linked = await db.execute(
    "SELECT COUNT(*) c FROM exercises WHERE video_file IS NOT NULL"
  );
  console.log(
    `  • ${Number(vids.rows[0].c)} סרטונים בקטלוג, ${Number(linked.rows[0].c)} תרגילים מחוברים`
  );

  const coaches = await db.execute("SELECT name, phone FROM users WHERE role='coach'");
  if (coaches.rows.length === 1) {
    const c = coaches.rows[0];
    const p = String(c.phone);
    ok(`מאמן: ${c.name} · ${p.slice(0, 3)}****${p.slice(-2)}`);
  } else {
    bad(`${coaches.rows.length} חשבונות מאמן (ציפיתי ל-1)`);
  }

  console.log("\n── התחברות מקצה לקצה ──");
  const phone = process.env.COACH_PHONE;
  const pass = process.env.COACH_PASSWORD;
  if (phone && pass) {
    const user = await login(phone, pass);
    user ? ok(`התחברות עובדת — ${user.name}, תפקיד: ${user.role}`)
         : bad("ההתחברות נכשלה — הטלפון או הסיסמה לא תואמים");
    const wrong = await login(phone, pass + "x");
    wrong ? bad("סיסמה שגויה התקבלה! בעיית אבטחה") : ok("סיסמה שגויה נדחית כמצופה");
  } else {
    bad("COACH_PHONE / COACH_PASSWORD חסרים — לא בדקתי התחברות");
  }
  console.log("");
}

main().catch((e) => { console.error("נכשל:", e); process.exit(1); });
