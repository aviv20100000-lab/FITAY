/**
 * המתאמן מבקש לעבור לרמה הבאה.
 *
 * לפי איתי: מסיימים רמה, שולחים בקשה, והמאמן מאשר. הכוונה שלו הייתה
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
    sql: "SELECT 1 FROM assignments WHERE trainee_id = ? AND program_id = ?",
    args: [user.id, programId],
  });
  if (!assigned.rows.length) {
    return NextResponse.json({ error: "התוכנית לא משויכת לך" }, { status: 403 });
  }

  const open = await db.execute({
    sql: `SELECT 1 FROM level_requests
           WHERE trainee_id = ? AND from_program_id = ? AND status = 'pending'`,
    args: [user.id, programId],
  });
  if (open.rows.length) {
    return NextResponse.json({ error: "כבר שלחת בקשה, היא ממתינה לאיתי" }, { status: 409 });
  }

  await db.execute({
    sql: `INSERT INTO level_requests (id,trainee_id,from_program_id,status,note,requested_at)
          VALUES (?,?,?,'pending',?,?)`,
    args: [randomUUID(), user.id, programId, note, new Date().toISOString()],
  });

  // ההתראה רצה אחרי התשובה. המתאמן לא צריך לחכות לה, ואם היא נכשלת
  // הבקשה עדיין נרשמה ואיתי יראה אותה במסך.
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
