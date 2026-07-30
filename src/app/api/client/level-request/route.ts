/**
 * המתאמן מבקש לעבור לרמה הבאה.
 *
 * לפי FITAY: מסיימים רמה, שולחים בקשה, והמאמן מאשר. המטרה היא
 * שלא ירוצו קדימה לפני שהם יציבים ברמה הנוכחית, ולכן המעבר לא אוטומטי.
 */
import { NextResponse, after } from "next/server";
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
  const programId = String(body?.programId ?? "");
  const note = String(body?.note ?? "").trim().slice(0, 500);
  if (!programId) {
    return NextResponse.json({ error: "חסרה תוכנית" }, { status: 400 });
  }

  await initDb();

  // רק תוכנית שמשויכת לו. אחרת אפשר לבקש מעבר על תוכנית של מישהו אחר.
  const assigned = await db.execute({
    sql: `SELECT a.target_sessions, a.initial_check_status,
                 (SELECT COUNT(*) FROM completions c
                   WHERE c.trainee_id = a.trainee_id
                     AND c.program_id = a.program_id
                     AND c.completed_at >= a.assigned_at) AS completed
            FROM assignments a
           WHERE a.trainee_id = ? AND a.program_id = ? AND a.status = 'active'`,
    args: [user.id, programId],
  });
  if (!assigned.rows.length) {
    return NextResponse.json({ error: "התוכנית לא משויכת לך" }, { status: 403 });
  }
  const assignment = assigned.rows[0];
  if (String(assignment.initial_check_status) !== "approved") {
    return NextResponse.json(
      { error: "צריך לקבל קודם את אישור הפתיחה מ-FITAY" },
      { status: 409 }
    );
  }
  if (Number(assignment.completed) < Number(assignment.target_sessions)) {
    return NextResponse.json(
      {
        error: `נשארו עוד ${Number(assignment.target_sessions) - Number(assignment.completed)} אימונים`,
      },
      { status: 409 }
    );
  }

  const open = await db.execute({
    sql: `SELECT 1 FROM level_requests
           WHERE trainee_id = ? AND from_program_id = ? AND status = 'pending'`,
    args: [user.id, programId],
  });
  if (open.rows.length) {
    return NextResponse.json(
      { error: "הבקשה כבר נשלחה וממתינה לבדיקה ב-FITAY" },
      { status: 409 }
    );
  }

  await db.execute({
    sql: `INSERT INTO level_requests (id,trainee_id,from_program_id,status,note,requested_at)
          VALUES (?,?,?,'pending',?,?)`,
    args: [randomUUID(), user.id, programId, note, new Date().toISOString()],
  });

  // ההתראה רצה אחרי התשובה. המתאמן לא צריך לחכות לה, ואם היא נכשלת
  // הבקשה עדיין נרשמה ומאמן FITAY יראה אותה במסך.
  after(async () => {
    try {
      const program = await db.execute({
        sql: "SELECT title FROM programs WHERE id = ?",
        args: [programId],
      });
      await sendToCoach({
        title: `${user.name} מבקש לעבור רמה`,
        body: `סיים את ${String(program.rows[0]?.title ?? "התוכנית")}`,
        url: "/coach",
        tag: `level-${user.id}`,
      });
    } catch {
      // התראה שלא נשלחה לא הופכת בקשה שנרשמה לכישלון.
    }
  });

  return NextResponse.json({ ok: true });
}
