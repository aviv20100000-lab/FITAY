import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

/**
 * הכרעה על הקשיה שממתינה.
 *
 * לכאן מגיעות רק הקשיות שכל הסטים בהן אושרו בלי נגיעה במספר, כלומר אין
 * עליהן ראיה. מי שרשם באמת כבר הוקשה אוטומטית ולא עבר כאן בכלל.
 *
 * באישור הדרגה עולה באותו רגע, וההנחיה שתוצג למתאמן באימון הבא נכתבת
 * ל-item_progress. בדחייה הדרגה נשארת, ומה שאיתי כתב נשמר ומוצג למתאמן:
 * מסך שלא משתנה בלי הסבר הוא מסך שמאבדים בו אמון.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const eventId = String(body?.eventId ?? "");
  const approve = body?.approve === true;
  const note = String(body?.note ?? "").trim().slice(0, 500);

  if (!eventId) {
    return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
  }
  if (!approve && !note) {
    return NextResponse.json(
      { error: "צריך להסביר למתאמן למה לא עולים" },
      { status: 400 }
    );
  }

  await initDb();

  const found = await db.execute({
    sql: `SELECT assignment_id, workout_item_id, kind, to_step
            FROM progression_events
           WHERE id = ? AND status = 'pending'`,
    args: [eventId],
  });
  const event = found.rows[0];
  if (!event) {
    // כבר הוכרעה, אולי בלשונית אחרת שנשארה פתוחה.
    return NextResponse.json({ error: "הבקשה כבר הוכרעה" }, { status: 409 });
  }

  const at = new Date().toISOString();

  const statements: { sql: string; args: (string | number)[] }[] = [
    {
      sql: `UPDATE progression_events
               SET status = ?, coach_note = ?, decided_at = ?
             WHERE id = ? AND status = 'pending'`,
      args: [approve ? "approved" : "declined", approve ? "" : note, at, eventId],
    },
  ];

  if (approve) {
    // אותה כתיבה בדיוק שהמנגנון עושה כשההקשיה אוטומטית, כדי שלא יהיו
    // שתי דרכים שונות להעלות דרגה.
    statements.push({
      sql: `INSERT INTO item_progress
              (assignment_id, workout_item_id, difficulty_step, advice, stall_count, updated_at)
            VALUES (?,?,?,?,0,?)
            ON CONFLICT(assignment_id, workout_item_id) DO UPDATE SET
              difficulty_step = excluded.difficulty_step,
              advice = excluded.advice,
              stall_count = 0,
              updated_at = excluded.updated_at`,
      args: [
        String(event.assignment_id),
        String(event.workout_item_id),
        Number(event.to_step),
        String(event.kind),
        at,
      ],
    });
  }

  await db.batch(statements, "write");

  return NextResponse.json({ ok: true });
}
