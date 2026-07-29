import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/** סיום אימון. דיווח כאב נשמר רק אם המתאמן במצב שיקום. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const programId = String(body.programId ?? "");
  const workoutId = String(body.workoutId ?? "");
  if (!programId || !workoutId) {
    return NextResponse.json({ error: "חסרים פרטי אימון" }, { status: 400 });
  }

  await initDb();

  // אימות שהתוכנית באמת משויכת לו — אחרת אפשר לרשום אימונים על תוכניות של אחרים.
  const allowed = await db.execute({
    sql: "SELECT 1 FROM assignments WHERE trainee_id = ? AND program_id = ?",
    args: [user.id, programId],
  });
  if (!allowed.rows.length) {
    return NextResponse.json({ error: "התוכנית לא משויכת לך" }, { status: 403 });
  }

  const rawPain = body.painLevel;
  let painLevel: number | null = null;
  if (user.rehabMode && rawPain != null && rawPain !== "") {
    const n = Number(rawPain);
    if (Number.isFinite(n) && n >= 0 && n <= 10) painLevel = Math.round(n);
  }

  const durationSec =
    body.durationSec == null ? null : Math.max(0, Math.round(Number(body.durationSec)));

  // כל הרישומים של האימון הזה חולקים את אותה חותמת זמן — ככה שולפים
  // אחר כך את "הפעם הקודמת" כיחידה אחת.
  const at = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO completions
            (id,trainee_id,program_id,workout_id,completed_at,duration_sec,mood,pain_level,notes)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [
      randomUUID(), user.id, programId, workoutId, at,
      Number.isFinite(durationSec as number) ? durationSec : null,
      body.mood ? String(body.mood) : null,
      painLevel,
      String(body.notes ?? ""),
    ],
  });

  // ── הסטים שבוצעו בפועל ──────────────────────────────────────────────
  // נשמרים רק פריטים ששייכים באמת לאימון הזה, כדי שלא יירשמו סטים
  // על תרגילים של אימון אחר.
  const raw = Array.isArray(body.setLogs) ? body.setLogs : [];
  if (raw.length) {
    const itemsRes = await db.execute({
      sql: "SELECT id, exercise_id FROM workout_items WHERE workout_id = ?",
      args: [workoutId],
    });
    const validItems = new Map(
      itemsRes.rows.map((r) => [String(r.id), String(r.exercise_id)])
    );

    const num = (v: unknown) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };

    const statements = [];
    for (const entry of raw) {
      const itemId = String(entry?.workoutItemId ?? "");
      const exerciseId = validItems.get(itemId);
      if (!exerciseId) continue;

      const setNumber = num(entry?.setNumber);
      if (setNumber == null || setNumber < 1) continue;

      const reps = num(entry?.reps);
      const seconds = num(entry?.seconds);
      if (reps == null && seconds == null) continue;

      const side = entry?.side === "weak" || entry?.side === "strong" ? entry.side : null;

      statements.push({
        sql: `INSERT INTO set_logs
                (id,trainee_id,workout_id,workout_item_id,exercise_id,set_number,reps,seconds,side,logged_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [
          randomUUID(), user.id, workoutId, itemId, exerciseId,
          setNumber, reps, seconds, side, at,
        ],
      });
    }
    if (statements.length) await db.batch(statements, "write");
  }

  return NextResponse.json({ ok: true });
}
