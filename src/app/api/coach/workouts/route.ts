import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function isCoach() {
  const user = await getSessionUser();
  return !!user && user.role === "coach";
}

/** אימון חדש בתוך תוכנית. */
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
