/**
 * החזרת בדיקת פתיחה לביצוע חוזר.
 *
 * איתי ראה את הסרטונים ורוצה שהמתאמן יצלם שוב. הסרטונים לא נמחקים כאן:
 * המתאמן מחליף רק את מה שצריך תיקון, וההחלפה עצמה מוחקת את הישן.
 */
import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import { sendToUser } from "@/lib/push";

/** הערה ארוכה מזה היא כבר שיחה, ולא משהו שנקרא ממסך טלפון. */
const MAX_NOTE = 500;

export async function POST(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const traineeId = String(body?.traineeId ?? "");
  const programId = String(body?.programId ?? "");
  const note = String(body?.note ?? "").trim();
  const exerciseIds = Array.isArray(body?.exerciseIds)
    ? body.exerciseIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  if (!traineeId || !programId) {
    return NextResponse.json({ error: "חסרים פרטים" }, { status: 400 });
  }
  // בלי הסבר המתאמן מקבל "תצלם שוב" ולא יודע מה לתקן, וזה מחזיר אותו
  // לאותו ביצוע בדיוק.
  if (!note) {
    return NextResponse.json(
      { error: "צריך לכתוב מה לתקן" },
      { status: 400 }
    );
  }
  // בלי סימון תרגיל אין מה לחסום, והמתאמן היה יכול לשלוח שוב בלי לצלם
  // כלום. זה הופך את ההחזרה למשהו שאפשר ללחוץ דרכו.
  if (exerciseIds.length === 0) {
    return NextResponse.json(
      { error: "צריך לסמן אילו תרגילים לצלם מחדש" },
      { status: 400 }
    );
  }

  await initDb();
  const assignment = await db.execute({
    sql: `SELECT id FROM assignments
           WHERE trainee_id = ? AND program_id = ?
             AND status = 'active' AND initial_check_status = 'pending'`,
    args: [traineeId, programId],
  });
  const assignmentId = assignment.rows[0] ? String(assignment.rows[0].id) : null;

  const result = await db.execute({
    sql: `UPDATE assignments
             SET initial_check_status = 'returned',
                 initial_check_decided_at = ?,
                 initial_check_note = ?
           WHERE trainee_id = ? AND program_id = ?
             AND status = 'active' AND initial_check_status = 'pending'`,
    args: [
      new Date().toISOString(),
      note.slice(0, MAX_NOTE),
      traineeId,
      programId,
    ],
  });
  if (!result.rowsAffected) {
    return NextResponse.json({ error: "הבקשה כבר טופלה" }, { status: 409 });
  }

  /*
   * הסימון בא אחרי שינוי הסטטוס, כי רק שינוי מוצלח מזכה בסימון. יש חלון
   * זעיר שבו המתאמן כבר רשאי להעלות, אבל הוא לא פותח פרצה: העלאה מאפסת
   * את השדה והסימון כאן כותב אותו מחדש, כלומר הסימון תמיד מנצח.
   */
  if (assignmentId) {
    const marked = new Date().toISOString();
    await db.batch(
      exerciseIds.map((exerciseId: string) => ({
        sql: `UPDATE initial_check_videos SET redo_requested_at = ?
               WHERE assignment_id = ? AND exercise_id = ?`,
        args: [marked, assignmentId, exerciseId],
      })),
      "write"
    );
  }

  after(async () => {
    try {
      await sendToUser(traineeId, {
        // ההערה עצמה נשארת במסך ולא נכנסת לגוף ההתראה. הטלפון מונח על
        // הרצפה בלי צליל, ואת התיקון קוראים כשחוזרים למסך.
        title: "צריך לצלם שוב",
        body: "FITAY צפה בסרטונים והשאיר לך הערה.",
        url: "/client",
        tag: "initial-check-returned",
      });
    } catch {}
  });

  return NextResponse.json({ ok: true });
}
