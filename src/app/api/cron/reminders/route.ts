/**
 * תזכורת למתאמן שנעלם.
 *
 * מתאמן פעיל, עם תוכנית משויכת, שלא סיים אימון כמה ימים, מקבל דחיפה אחת.
 * אחרי השליחה נרשם absent_notified_at, ולא נשלחת עוד תזכורת עד שהוא
 * מתאמן או שעובר חלון שלם נוסף. תזכורת שחוזרת כל יום היא הדרך הבטוחה
 * לגרום למישהו לכבות התראות.
 */
import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { sendToUser } from "@/lib/push";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export const maxDuration = 60;

/** אחרי כמה ימים בלי אימון שולחים תזכורת. */
const ABSENT_DAYS = 4;

/** כמה ימים להמתין לפני תזכורת נוספת לאותו אדם. */
const REPEAT_AFTER_DAYS = 4;

const dayMs = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      return NextResponse.json(
        { error: "CRON_SECRET חסר בהגדרות הפרויקט" },
        { status: 500 }
      );
    }
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
    }
  }

  await initDb();

  const now = Date.now();
  const absentBefore = new Date(now - ABSENT_DAYS * dayMs).toISOString();
  const repeatBefore = new Date(now - REPEAT_AFTER_DAYS * dayMs).toISOString();

  // מתאמן בלי תוכנית משויכת לא מקבל תזכורת. אין לו מה לפתוח.
  // מתאמן שטרם התאמן אף פעם נכנס לפי created_at, כדי שגם הוא יקבל דחיפה.
  const candidates = await db.execute({
    sql: `SELECT u.id, u.name,
                 (SELECT MAX(c.completed_at) FROM completions c
                   WHERE c.trainee_id = u.id) AS last_done
            FROM users u
           WHERE u.role = 'trainee'
             AND u.active = 1
             AND EXISTS (SELECT 1 FROM assignments a WHERE a.trainee_id = u.id)
             AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
             AND (u.absent_notified_at IS NULL OR u.absent_notified_at < ?)
             AND COALESCE(
                   (SELECT MAX(c.completed_at) FROM completions c
                     WHERE c.trainee_id = u.id),
                   u.created_at
                 ) < ?`,
    args: [repeatBefore, absentBefore],
  });

  const sent: string[] = [];

  for (const row of candidates.rows) {
    const id = String(row.id);
    const name = String(row.name).trim().split(" ")[0];
    const everTrained = row.last_done != null;

    const body = everTrained
      ? "עברו כמה ימים מהאימון האחרון. הטבעות מחכות."
      : "התוכנית שלך מחכה. האימון הראשון הוא הקשה להתחיל.";

    const res = await sendToUser(id, {
      title: `${name}, נתראה באימון`,
      body,
      url: "/client",
      tag: "absent",
    });

    if (res.sent > 0) {
      await db.execute({
        sql: "UPDATE users SET absent_notified_at = ? WHERE id = ?",
        args: [new Date().toISOString(), id],
      });
      sent.push(id);
    }
  }

  return NextResponse.json({ checked: candidates.rows.length, sent: sent.length });
}
