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

  await db.execute({
    sql: `INSERT INTO completions
            (id,trainee_id,program_id,workout_id,completed_at,duration_sec,mood,pain_level,notes)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [
      randomUUID(), user.id, programId, workoutId, new Date().toISOString(),
      Number.isFinite(durationSec as number) ? durationSec : null,
      body.mood ? String(body.mood) : null,
      painLevel,
      String(body.notes ?? ""),
    ],
  });

  return NextResponse.json({ ok: true });
}
