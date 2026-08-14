/**
 * המתאמן מבקש לחזור על אימון שכבר ניצל את הכפילה שלו.
 *
 * הכלל של איתי: אותו אימון פעמיים ברצף מותר, שלוש אף פעם, ולכל אימון
 * כפילה אחת לאורך התוכנית. מי שרוצה עוד עובר דרך כאן, ואיתי מאשר או
 * דוחה מהמסך שלו.
 *
 * הבקשה נבדקת מול רצף הביצועים ולא נסמכת על מה שהמסך שלח: מסך יכול
 * לשלוח כל מזהה, והכלל חייב להיאכף בשרת.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToCoach } from "@/lib/push";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const workoutId = String(body?.workoutId ?? "");
  if (!workoutId) {
    return NextResponse.json({ error: "חסר אימון" }, { status: 400 });
  }

  await initDb();

  // רק אימון בתוכנית שמשויכת לו ופעילה. אחרת אפשר לבקש על אימון של אחר.
  const owned = await db.execute({
    sql: `SELECT w.id, w.title, w.program_id, u.name AS trainee_name
            FROM workouts w
            JOIN assignments a
              ON a.program_id = w.program_id
             AND a.trainee_id = ?
             AND a.status = 'active'
            JOIN users u ON u.id = a.trainee_id
           WHERE w.id = ?
           LIMIT 1`,
    args: [user.id, workoutId],
  });
  const row = owned.rows[0];
  if (!row) {
    return NextResponse.json({ error: "האימון לא משויך לך" }, { status: 403 });
  }
  const programId = String(row.program_id);

  /*
   * הבקשה תקפה רק אם האימון באמת נעול, כלומר הוא כבר בוצע פעמיים ברצף
   * בתוכנית הזאת. בלי הבדיקה הזאת אפשר לצבור אישורים מראש ולעקוף את
   * הכלל כולו.
   */
  const sequence = await db.execute({
    sql: `SELECT c.workout_id, c.completed_at
            FROM completions c
            JOIN assignments a
              ON a.trainee_id = c.trainee_id
             AND a.program_id = c.program_id
             AND a.status = 'active'
           WHERE c.trainee_id = ? AND c.program_id = ?
             AND c.completed_at >= a.assigned_at
           ORDER BY c.completed_at DESC`,
    args: [user.id, programId],
  });
  const ids = sequence.rows.map((r) => String(r.workout_id));
  let doubled = false;
  for (let i = 0; i + 1 < ids.length; i += 1) {
    if (ids[i] === workoutId && ids[i + 1] === workoutId) {
      doubled = true;
      break;
    }
  }
  if (!doubled) {
    return NextResponse.json(
      { error: "האימון הזה עדיין פתוח לחזרה, אין צורך באישור" },
      { status: 409 }
    );
  }

  // בקשה פתוחה אחת לכל אימון. האינדקס אוכף את זה, וזו התשובה הקריאה.
  const open = await db.execute({
    sql: `SELECT id FROM repeat_requests
           WHERE trainee_id = ? AND workout_id = ? AND status = 'pending'
           LIMIT 1`,
    args: [user.id, workoutId],
  });
  if (open.rows.length > 0) {
    return NextResponse.json(
      { error: "כבר שלחת בקשה על האימון הזה" },
      { status: 409 }
    );
  }

  await db.execute({
    sql: `INSERT INTO repeat_requests
            (id, trainee_id, program_id, workout_id, status, requested_at)
          VALUES (?, ?, ?, ?, 'pending', ?)`,
    args: [randomUUID(), user.id, programId, workoutId, new Date().toISOString()],
  });

  await sendToCoach({
    title: "בקשה לחזור על אימון",
    body: `${String(row.trainee_name)} מבקש לעשות שוב את ${String(row.title)}.`,
    url: "/coach",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
