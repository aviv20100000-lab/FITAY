import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function guard() {
  const user = await getSessionUser();
  return user && user.role === "coach" ? user : null;
}

/** תוכנית חדשה — ריקה, או שכפול של תבנית קיימת. */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

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

/**
 * שינוי שם / רמה / מספר שבועות של תוכנית קיימת, וגם סימון כתבנית.
 *
 * הסימון כתבנית הוא לא קישוט. רשימת התוכניות באישור מעבר רמה נשלפת
 * מהתבניות בלבד, ולכן תוכנית אישית שלא סומנה פשוט לא מופיעה שם כאפשרות.
 * עד שהמתג הזה נוסף, הדרך היחידה הייתה לבנות אותה מחדש מההתחלה.
 */
export async function PATCH(request: Request) {
  if (!(await guard())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const id = String(body.id ?? "");
  const title = String(body.title ?? "").trim();
  const level = Number(body.level ?? 1);
  const weeks = Number(body.weeks ?? 8);

  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "צריך שם לתוכנית" }, { status: 400 });
  if (![1, 2, 3].includes(level)) {
    return NextResponse.json({ error: "רמה חייבת להיות 1 עד 3" }, { status: 400 });
  }
  if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) {
    return NextResponse.json({ error: "מספר שבועות לא תקין" }, { status: 400 });
  }

  await initDb();

  // isTemplate אופציונלי: מסך שלא שולח אותו לא משנה את הסימון הקיים.
  const sets = ["title = ?", "level = ?", "weeks = ?"];
  const args: (string | number)[] = [title, level, weeks];
  if (body.isTemplate != null) {
    sets.push("is_template = ?");
    args.push(body.isTemplate ? 1 : 0);
  }
  args.push(id);

  const res = await db.execute({
    sql: `UPDATE programs SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ error: "התוכנית לא נמצאה" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * מחיקת תוכנית. אימונים ותרגילים נמחקים איתה ב-CASCADE.
 *
 * חסומה בשני מצבים. תוכנית שמשויכת עכשיו — מחיקה שקטה תשאיר מתאמן בלי
 * אימונים. תוכנית שמישהו כבר סיים בעבר — היא חלק מההיסטוריה שלו, ומחיקה
 * תמחק גם אותה.
 */
export async function DELETE(request: Request) {
  if (!(await guard())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  await initDb();
  const assigned = await db.execute({
    sql: `SELECT COUNT(*) AS n,
                 SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
            FROM assignments WHERE program_id = ?`,
    args: [id],
  });
  const n = Number(assigned.rows[0].n);
  const active = Number(assigned.rows[0].active ?? 0);
  if (active > 0) {
    return NextResponse.json(
      { error: `התוכנית משויכת ל-${active} מתאמנים. צריך לבטל את השיוך קודם.` },
      { status: 409 }
    );
  }
  if (n > 0) {
    return NextResponse.json(
      { error: "מתאמנים כבר התאמנו לפי התוכנית הזאת והיא שמורה בהיסטוריה שלהם." },
      { status: 409 }
    );
  }

  // מפורש ולא בהסתמכות על CASCADE — מפתחות זרים לא תמיד דלוקים.
  await db.batch(
    [
      {
        sql: `DELETE FROM workout_items
               WHERE workout_id IN (SELECT id FROM workouts WHERE program_id = ?)`,
        args: [id],
      },
      { sql: "DELETE FROM workouts WHERE program_id = ?", args: [id] },
      { sql: "UPDATE programs SET template_id = NULL WHERE template_id = ?", args: [id] },
      { sql: "DELETE FROM programs WHERE id = ?", args: [id] },
    ],
    "write"
  );
  return NextResponse.json({ ok: true });
}
