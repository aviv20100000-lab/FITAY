/**
 * החזרת בקשת מעבר לביצוע חוזר.
 *
 * איתי ראה את הסרטונים ורוצה שהמתאמן יצלם שוב לפני שהוא מחליט על המעבר.
 * זה לא דחייה: דחייה אומרת שממשיכים בתוכנית הנוכחית, וכאן הבקשה נשארת
 * פתוחה בפועל והמתאמן מחליף את מה שסומן ושולח שוב.
 *
 * הסרטונים לא נמחקים כאן. המתאמן מחליף רק את התרגילים שסומנו, וההחלפה
 * עצמה מוחקת את הישן.
 */
import { NextResponse, after } from "next/server";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToUser } from "@/lib/push";

export const preferredRegion = "fra1";

/** הערה ארוכה מזה היא כבר שיחה, ולא משהו שנקרא ממסך טלפון. */
const MAX_NOTE = 500;

export async function POST(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const requestId = String(body?.requestId ?? "");
  const note = String(body?.note ?? "").trim();
  const exerciseIds = Array.isArray(body?.exerciseIds)
    ? body.exerciseIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];

  if (!requestId) {
    return NextResponse.json({ error: "חסרה בקשה" }, { status: 400 });
  }
  // בלי הסבר המתאמן מקבל "תצלם שוב" ולא יודע מה לתקן, וזה מחזיר אותו
  // לאותו ביצוע בדיוק.
  if (!note) {
    return NextResponse.json({ error: "צריך לכתוב מה לתקן" }, { status: 400 });
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

  const found = await db.execute({
    sql: `SELECT r.trainee_id, r.from_program_id, r.status
            FROM level_requests r WHERE r.id = ?`,
    args: [requestId],
  });
  const row = found.rows[0];
  if (!row) return NextResponse.json({ error: "הבקשה לא נמצאה" }, { status: 404 });

  const traineeId = String(row.trainee_id);
  const assignment = await db.execute({
    sql: `SELECT id FROM assignments
           WHERE trainee_id = ? AND program_id = ? AND status = 'active'`,
    args: [traineeId, String(row.from_program_id)],
  });
  const assignmentId = assignment.rows[0] ? String(assignment.rows[0].id) : null;

  const result = await db.execute({
    // מותנה ב-'pending' כמו במסלול ההכרעה, כדי שלחיצה כפולה לא תדרוס
    // החלטה שכבר התקבלה.
    sql: `UPDATE level_requests
             SET status = 'returned', decided_at = ?, coach_note = ?
           WHERE id = ? AND status = 'pending'`,
    args: [new Date().toISOString(), note.slice(0, MAX_NOTE), requestId],
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
        sql: `UPDATE level_check_videos SET redo_requested_at = ?
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
        tag: "level-returned",
      });
    } catch {}
  });

  return NextResponse.json({ ok: true });
}
