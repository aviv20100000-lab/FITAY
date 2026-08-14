/**
 * איתי מאשר או דוחה בקשה לחזור על אימון.
 *
 * אישור שווה כפילה אחת נוספת לאימון הזה, לא היתר פתוח. הוא נצרך ברגע
 * שהאימון בוצע שוב פעמיים ברצף אחרי decided_at, וזה נבדק מול רצף
 * הביצועים במסך הבית. אין כאן דגל "נוצל", כי דגל כזה היה מקור אמת שני
 * לאותה עובדה, והשניים היו נפרדים ביום שבו מישהו מוחק ביצוע.
 */
import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToUser } from "@/lib/push";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const requestId = String(body?.requestId ?? "");
  const approve = body?.approve === true;
  if (!requestId) {
    return NextResponse.json({ error: "חסרה בקשה" }, { status: 400 });
  }

  await initDb();

  const found = await db.execute({
    sql: `SELECT r.trainee_id, r.status, w.title
            FROM repeat_requests r
            JOIN workouts w ON w.id = r.workout_id
           WHERE r.id = ?
           LIMIT 1`,
    args: [requestId],
  });
  const row = found.rows[0];
  if (!row) {
    return NextResponse.json({ error: "הבקשה לא נמצאה" }, { status: 404 });
  }
  // בקשה שכבר הוכרעה לא מוכרעת שוב. שני מסכים פתוחים אצל איתי הם מצב רגיל.
  if (String(row.status) !== "pending") {
    return NextResponse.json({ error: "הבקשה כבר הוכרעה" }, { status: 409 });
  }

  await db.execute({
    sql: `UPDATE repeat_requests
             SET status = ?, decided_at = ?
           WHERE id = ? AND status = 'pending'`,
    args: [approve ? "approved" : "declined", new Date().toISOString(), requestId],
  });

  await sendToUser(String(row.trainee_id), {
    title: approve ? "אושר" : "לא הפעם",
    body: approve
      ? `אפשר לעשות שוב את ${String(row.title)}.`
      : `ממשיכים בסדר הרגיל, בלי לחזור על ${String(row.title)}.`,
    url: "/client",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
