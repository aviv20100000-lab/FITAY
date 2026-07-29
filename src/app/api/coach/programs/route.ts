import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function guard() {
  const user = await getSessionUser();
  return user && user.role === "coach" ? user : null;
}

/** תוכנית חדשה — ריקה, או שכפול של תבנית קיימת. */
export async function POST(request: Request) {
  if (!(await guard())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  let title: string, level: number, isTemplate: boolean, copyFrom: string | null;
  try {
    const body = await request.json();
    title = String(body.title ?? "").trim();
    level = Number(body.level ?? 1);
    isTemplate = Boolean(body.isTemplate);
    copyFrom = body.copyFrom ? String(body.copyFrom) : null;
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (!title) return NextResponse.json({ error: "צריך שם לתוכנית" }, { status: 400 });
  if (![1, 2, 3].includes(level)) {
    return NextResponse.json({ error: "רמה חייבת להיות 1 עד 3" }, { status: 400 });
  }

  await initDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  if (copyFrom) {
    // שכפול: המקור נשאר נקי, העותק מקבל template_id שמצביע אליו.
    const src = await db.execute({
      sql: "SELECT * FROM programs WHERE id = ?",
      args: [copyFrom],
    });
    const p = src.rows[0];
    if (!p) return NextResponse.json({ error: "התבנית לא נמצאה" }, { status: 404 });

    await db.execute({
      sql: `INSERT INTO programs (id,title,description,level,weeks,is_template,template_id,created_at)
            VALUES (?,?,?,?,?,0,?,?)`,
      args: [id, title, String(p.description), Number(p.level), Number(p.weeks), copyFrom, now],
    });

    const workouts = await db.execute({
      sql: "SELECT * FROM workouts WHERE program_id = ? ORDER BY position",
      args: [copyFrom],
    });
    for (const w of workouts.rows) {
      const newWorkoutId = randomUUID();
      await db.execute({
        sql: "INSERT INTO workouts (id,program_id,title,phase,position) VALUES (?,?,?,?,?)",
        args: [newWorkoutId, id, String(w.title), Number(w.phase), Number(w.position)],
      });
      const items = await db.execute({
        sql: "SELECT * FROM workout_items WHERE workout_id = ? ORDER BY position",
        args: [w.id],
      });
      for (const it of items.rows) {
        await db.execute({
          sql: `INSERT INTO workout_items
                  (id,workout_id,exercise_id,position,sets,reps,seconds,rest,ring_height,body_angle,video_file,notes)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            randomUUID(), newWorkoutId, String(it.exercise_id), Number(it.position),
            Number(it.sets), it.reps, it.seconds, Number(it.rest),
            it.ring_height, it.body_angle, it.video_file, String(it.notes),
          ],
        });
      }
    }
  } else {
    await db.execute({
      sql: `INSERT INTO programs (id,title,description,level,weeks,is_template,template_id,created_at)
            VALUES (?,?,'',?,8,?,NULL,?)`,
      args: [id, title, level, isTemplate ? 1 : 0, now],
    });
  }

  return NextResponse.json({ id });
}
