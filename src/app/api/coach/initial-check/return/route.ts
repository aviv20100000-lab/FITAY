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

  await initDb();
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
