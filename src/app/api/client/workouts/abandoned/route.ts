import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";

const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealLocalDay(day: string) {
  if (!LOCAL_DAY_PATTERN.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. כמו מסלול ההשלמות.
export const preferredRegion = "fra1";

/** רישום שקט של אימון שנשמר במכשיר ביום קודם ולא הושלם. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const programId = String(body.programId ?? "");
  const workoutId = String(body.workoutId ?? "");
  const day = String(body.day ?? "");
  if (!programId || !workoutId || !isRealLocalDay(day)) {
    return NextResponse.json({ error: "חסרים פרטי אימון" }, { status: 400 });
  }

  await initDb();

  // אותה בעלות כמו במסלול ההשלמות: שיוך פעיל של התוכנית למתאמן,
  // ואחריו אימות נפרד שהאימון שייך באמת לתוכנית שנשלחה.
  const allowed = await db.execute({
    sql: `SELECT id FROM assignments
           WHERE trainee_id = ? AND program_id = ? AND status = 'active'`,
    args: [user.id, programId],
  });
  if (!allowed.rows.length) {
    return NextResponse.json({ error: "התוכנית לא משויכת לך" }, { status: 403 });
  }

  const workout = await db.execute({
    sql: "SELECT id FROM workouts WHERE id = ? AND program_id = ?",
    args: [workoutId, programId],
  });
  if (!workout.rows.length) {
    return NextResponse.json({ error: "האימון לא שייך לתוכנית" }, { status: 400 });
  }

  await db.execute({
    sql: `INSERT INTO aborted_workouts
            (id, trainee_id, program_id, workout_id, started_day, reported_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(trainee_id, workout_id, started_day) DO NOTHING`,
    args: [randomUUID(), user.id, programId, workoutId, day, new Date().toISOString()],
  });

  return NextResponse.json({ ok: true });
}
