import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import { sendToCoach } from "@/lib/push";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const programId = String(body?.programId ?? "");
  if (!programId) {
    return NextResponse.json({ error: "חסרה תוכנית" }, { status: 400 });
  }

  await initDb();
  const assignment = await db.execute({
    sql: `SELECT a.initial_check_status, p.title,
                 (SELECT COUNT(DISTINCT sl.exercise_id)
                    FROM set_logs sl
                    JOIN workouts w ON w.id = sl.workout_id
                   WHERE sl.trainee_id = a.trainee_id
                     AND w.program_id = a.program_id
                     AND sl.logged_at >= a.assigned_at) AS exercises_done
            FROM assignments a JOIN programs p ON p.id = a.program_id
           WHERE a.trainee_id = ? AND a.program_id = ? AND a.status = 'active'`,
    args: [user.id, programId],
  });
  const row = assignment.rows[0];
  if (!row) return NextResponse.json({ error: "התוכנית לא נמצאה" }, { status: 404 });
  if (Number(row.exercises_done) < 4) {
    return NextResponse.json(
      { error: "אפשר לדווח אחרי שתסיים את האימון הראשון" },
      { status: 409 }
    );
  }
  if (String(row.initial_check_status) !== "not_ready") {
    return NextResponse.json({ error: "הדיווח כבר נשלח" }, { status: 409 });
  }

  await db.execute({
    sql: `UPDATE assignments
             SET initial_check_status = 'pending', initial_check_reported_at = ?
           WHERE trainee_id = ? AND program_id = ? AND status = 'active'`,
    args: [new Date().toISOString(), user.id, programId],
  });

  after(async () => {
    try {
      await sendToCoach({
        title: `${user.name} מחכה לאישור פתיחה`,
        body: `האימון הראשון ב-${String(row.title)} עבר בסדר.`,
        url: "/coach",
        tag: `initial-check-${user.id}`,
      });
    } catch {}
  });

  return NextResponse.json({ ok: true });
}
