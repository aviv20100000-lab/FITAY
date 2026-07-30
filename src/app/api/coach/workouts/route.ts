import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function isCoach() {
  const user = await getSessionUser();
  return !!user && user.role === "coach";
}

/** אימון חדש בתוך תוכנית. */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const programId = String(body.programId ?? "");
  const title = String(body.title ?? "").trim();
  const phase = Number(body.phase ?? 1);

  if (!programId) return NextResponse.json({ error: "חסרה תוכנית" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "צריך שם לאימון" }, { status: 400 });
  if (![1, 2].includes(phase)) {
    return NextResponse.json({ error: "שלב חייב להיות 1 או 2" }, { status: 400 });
  }

  await initDb();
  const pos = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM workouts WHERE program_id = ?",
    args: [programId],
  });

  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO workouts (id,program_id,title,phase,position) VALUES (?,?,?,?,?)",
    args: [id, programId, title, phase, Number(pos.rows[0].next)],
  });

  return NextResponse.json({ id });
}

/**
 * שינוי שם/שלב של אימון, או סידור מחדש של האימונים בתוכנית.
 * שני מצבים: { order: [id,…] } לסידור, או { id, title?, phase? } לעריכה.
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
      order.map((workoutId, index) => ({
        sql: "UPDATE workouts SET position = ? WHERE id = ?",
        args: [index, workoutId],
      })),
      "write"
    );
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  const title = String(body.title ?? "").trim();
  const phase = Number(body.phase ?? 1);

  if (!title) return NextResponse.json({ error: "צריך שם לאימון" }, { status: 400 });
  if (![1, 2].includes(phase)) {
    return NextResponse.json({ error: "שלב חייב להיות 1 או 2" }, { status: 400 });
  }

  const res = await db.execute({
    sql: "UPDATE workouts SET title = ?, phase = ? WHERE id = ?",
    args: [title, phase, id],
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ error: "האימון לא נמצא" }, { status: 404 });
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
  // התרגילים נמחקים איתו דרך ON DELETE CASCADE.
  await db.execute({ sql: "DELETE FROM workouts WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
