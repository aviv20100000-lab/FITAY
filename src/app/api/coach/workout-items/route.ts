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
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

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
  const notes = String(body.notes ?? "").trim().slice(0, 280);

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
          VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?)`,
    args: [id, workoutId, exerciseId, Number(pos.rows[0].next), sets, reps, seconds, rest, ringHeight, bodyAngle, notes],
  });

  return NextResponse.json({ id });
}

/**
 * עריכת תרגיל קיים, או סידור מחדש של התרגילים באימון.
 * זה הלב של נוהל הצבירה — כל שבוע מאמן FITAY מעלה מספר או מוריד את הטבעת.
 * שני מצבים: { order: [id,…] } לסידור, או { id, … } לעריכת שדות.
 */
export async function PATCH(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  await initDb();

  if (Array.isArray(body.order)) {
    const order: string[] = body.order.map(String);
    if (order.length === 0) return NextResponse.json({ ok: true });
    await db.batch(
      order.map((itemId, index) => ({
        sql: "UPDATE workout_items SET position = ? WHERE id = ?",
        args: [index, itemId],
      })),
      "write"
    );
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  const sets = Number(body.sets ?? 3);
  const reps = body.reps === "" || body.reps == null ? null : Number(body.reps);
  const seconds = body.seconds === "" || body.seconds == null ? null : Number(body.seconds);
  const rest = Number(body.rest ?? 60);
  const ringHeight = String(body.ringHeight ?? "").trim() || null;
  const bodyAngle = String(body.bodyAngle ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim().slice(0, 280);

  if (!Number.isFinite(sets) || sets < 1) {
    return NextResponse.json({ error: "מספר סטים לא תקין" }, { status: 400 });
  }
  if (reps == null && seconds == null) {
    return NextResponse.json({ error: "צריך למלא חזרות או שניות" }, { status: 400 });
  }
  if (!Number.isFinite(rest) || rest < 0) {
    return NextResponse.json({ error: "זמן מנוחה לא תקין" }, { status: 400 });
  }

  const res = await db.execute({
    sql: `UPDATE workout_items
             SET sets = ?, reps = ?, seconds = ?, rest = ?, ring_height = ?,
                 body_angle = ?, notes = ?
           WHERE id = ?`,
    args: [sets, reps, seconds, rest, ringHeight, bodyAngle, notes, id],
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ error: "התרגיל לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
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
