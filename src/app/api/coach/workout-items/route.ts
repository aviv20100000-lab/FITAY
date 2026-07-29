import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function isCoach() {
  const user = await getSessionUser();
  return !!user && user.role === "coach";
}

/**
 * תרגיל בתוך אימון.
 * ring_height ו-body_angle הם שני המרכיבים שקובעים קושי לפי החוברת.
 * גובה ריק הוא בחירה לגיטימית — המתאמן יבחר מה שנוח לו ועדיין מועיל.
 */
export async function POST(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const workoutId = String(body.workoutId ?? "");
  const exerciseId = String(body.exerciseId ?? "");
  const sets = Number(body.sets ?? 3);
  const reps = body.reps === "" || body.reps == null ? null : Number(body.reps);
  const seconds = body.seconds === "" || body.seconds == null ? null : Number(body.seconds);
  const rest = Number(body.rest ?? 60);
  const ringHeight = String(body.ringHeight ?? "").trim() || null;
  const bodyAngle = String(body.bodyAngle ?? "").trim() || null;

  if (!workoutId || !exerciseId) {
    return NextResponse.json({ error: "חסר אימון או תרגיל" }, { status: 400 });
  }
  if (!Number.isFinite(sets) || sets < 1) {
    return NextResponse.json({ error: "מספר סטים לא תקין" }, { status: 400 });
  }
  if (reps == null && seconds == null) {
    return NextResponse.json(
      { error: "צריך למלא חזרות או שניות" },
      { status: 400 }
    );
  }

  await initDb();
  const pos = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM workout_items WHERE workout_id = ?",
    args: [workoutId],
  });

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO workout_items
            (id,workout_id,exercise_id,position,sets,reps,seconds,rest,ring_height,body_angle,video_file,notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,NULL,'')`,
    args: [id, workoutId, exerciseId, Number(pos.rows[0].next), sets, reps, seconds, rest, ringHeight, bodyAngle],
  });

  return NextResponse.json({ id });
}

export async function DELETE(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  await initDb();
  await db.execute({ sql: "DELETE FROM workout_items WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
