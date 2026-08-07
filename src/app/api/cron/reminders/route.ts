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

/**
 * אחרי כמה ימים בלי אימון שולחים תזכורת, לפי הקצב שהמתאמן בחר.
 *
 * הסף היה ארבעה ימים לכולם. ברגע שנפתחה האפשרות להתאמן פעמיים בשבוע,
 * מתאמן שמגיע בראשון וברביעי נמצא בפער של שלושה עד ארבעה ימים בזמן
 * שהוא עומד בתוכנית במדויק, והתזכורת הייתה נשלחת אליו על לא עוול.
 *
 * אותו מספר משמש גם כהמתנה לפני תזכורת נוספת לאותו אדם, כדי שמי שמקבל
 * חלון ארוך יותר לא יקבל דווקא תזכורות תכופות יותר.
 *
 * המספרים ממתינים לאישור של איתי אחרי שיראה את זה עובד.
 */
const ABSENT_DAYS_BY_PACE: Record<number, number> = { 2: 6, 3: 4, 4: 4 };

/** מי שעוד לא בחר קצב. אותו סף שהיה נהוג לכולם. */
const DEFAULT_ABSENT_DAYS = 4;

/** החלון הרחב ביותר, לסינון הגס בשאילתה. */
const MAX_ABSENT_DAYS = Math.max(
  DEFAULT_ABSENT_DAYS,
  ...Object.values(ABSENT_DAYS_BY_PACE)
);

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
  // סינון גס בחלון הרחב ביותר. הסף המדויק של כל מתאמן נבדק למטה, לפי
  // הקצב שלו, כי שאילתה אחת לא יכולה להחזיק סף שונה לכל שורה בלי להפוך
  // לבלתי קריאה.
  const widestBefore = new Date(now - MAX_ABSENT_DAYS * dayMs).toISOString();

  // מתאמן בלי תוכנית משויכת לא מקבל תזכורת. אין לו מה לפתוח.
  // מתאמן שטרם התאמן אף פעם נכנס לפי created_at, כדי שגם הוא יקבל דחיפה.
  const candidates = await db.execute({
    sql: `SELECT u.id, u.name, u.created_at, u.absent_notified_at,
                 (SELECT MAX(c.completed_at) FROM completions c
                   WHERE c.trainee_id = u.id) AS last_done,
                 -- הקצב האיטי ביותר מבין התוכניות הפעילות, כלומר החלון
                 -- הסלחני ביותר. מי שמתאמן פעמיים בשבוע לא נמדד בסף של
                 -- מי שמתאמן ארבע.
                 (SELECT MIN(a.sessions_per_week) FROM assignments a
                   WHERE a.trainee_id = u.id AND a.status = 'active') AS pace
            FROM users u
           WHERE u.role = 'trainee'
             AND u.active = 1
             AND EXISTS (
               SELECT 1 FROM assignments a
                WHERE a.trainee_id = u.id AND a.status = 'active'
             )
             AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
             AND (u.absent_notified_at IS NULL OR u.absent_notified_at < ?)
             AND COALESCE(
                   (SELECT MAX(c.completed_at) FROM completions c
                     WHERE c.trainee_id = u.id),
                   u.created_at
                 ) < ?`,
    args: [widestBefore, widestBefore],
  });

  const sent: string[] = [];

  for (const row of candidates.rows) {
    const id = String(row.id);
    const name = String(row.name).trim().split(" ")[0];
    const everTrained = row.last_done != null;

    const pace = row.pace == null ? null : Number(row.pace);
    const windowDays =
      (pace != null ? ABSENT_DAYS_BY_PACE[pace] : undefined) ??
      DEFAULT_ABSENT_DAYS;
    const windowMs = windowDays * dayMs;

    // הסף האישי. הסינון בשאילתה הוא של החלון הרחב, ולכן מי שהחלון שלו
    // קצר יותר כבר עבר אותו, ומי שארוך יותר עשוי עדיין להיות בתוכו.
    const since = new Date(
      String(row.last_done ?? row.created_at)
    ).getTime();
    if (!Number.isFinite(since) || now - since < windowMs) continue;

    if (row.absent_notified_at != null) {
      const notified = new Date(String(row.absent_notified_at)).getTime();
      if (Number.isFinite(notified) && now - notified < windowMs) continue;
    }

    const body = everTrained
      ? "עברו כמה ימים מהאימון האחרון. הטבעות מחכות."
      : "התוכנית שלך מחכה. החלק הקשה הוא להתחיל.";

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
