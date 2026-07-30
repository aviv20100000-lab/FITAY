/**
 * שליחת התראות דחיפה.
 *
 * שלוש ההתראות שקיימות היום:
 *   • לאיתי, כשמתאמן מסיים אימון.
 *   • לאיתי, כשמתאמן מדווח כאב גבוה.
 *   • למתאמן, כשהוא לא התאמן כמה ימים.
 *
 * שים לב לגבי אייפון: דחיפה עובדת רק אחרי "הוספה למסך הבית". בספארי
 * רגיל הכפתור לא יוצע בכלל, וזה מגבלה של iOS ולא באג אצלנו.
 */
import webpush from "web-push";
import db from "./db";

export type PushPayload = {
  title: string;
  body: string;
  /** לאן לקחת את מי שלוחץ על ההתראה. */
  url: string;
  /** התראות עם אותו tag דורסות זו את זו במקום להיערם. */
  tag?: string;
};

let configured = false;

/** מחזיר false כשהמזהים חסרים, כדי שהאפליקציה תמשיך לעבוד בלי התראות. */
function configure() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:aviv20100000@gmail.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

/**
 * שולח לכל המכשירים של משתמש אחד.
 *
 * מנוי שהדפדפן כבר פסל (404/410) נמחק מהמסד. בלי הניקוי הזה הטבלה
 * מתמלאת במכשירים מתים וכל שליחה נעשית איטית יותר.
 */
export async function sendToUser(userId: string, payload: PushPayload) {
  if (!configure()) return { sent: 0, removed: 0 };

  const subs = await db.execute({
    sql: "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
    args: [userId],
  });
  if (!subs.rows.length) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.rows.map(async (row) => {
      const endpoint = String(row.endpoint);
      try {
        await webpush.sendNotification(
          {
            endpoint,
            keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
          },
          body,
          { TTL: 24 * 60 * 60 }
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(endpoint);
      }
    })
  );

  for (const endpoint of dead) {
    await db
      .execute({
        sql: "DELETE FROM push_subscriptions WHERE endpoint = ?",
        args: [endpoint],
      })
      .catch(() => {});
  }

  return { sent, removed: dead.length };
}

/** שולח לאיתי. יש מאמן אחד, ולכן מחפשים לפי תפקיד ולא לפי מזהה. */
export async function sendToCoach(payload: PushPayload) {
  const coach = await db.execute(
    "SELECT id FROM users WHERE role = 'coach' AND active = 1"
  );
  let sent = 0;
  for (const row of coach.rows) {
    const res = await sendToUser(String(row.id), payload);
    sent += res.sent;
  }
  return { sent };
}
