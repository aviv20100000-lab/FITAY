/**
 * הרשמה וביטול של מכשיר להתראות.
 *
 * הדפדפן מנפיק endpoint ייחודי לכל מכשיר, ואנחנו שומרים אותו לצד שני
 * מפתחות ההצפנה. שורה לכל מכשיר, כך שטלפון ומחשב חיים במקביל.
 */
import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type IncomingSubscription = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as IncomingSubscription | null;
  const endpoint = String(body?.endpoint ?? "");
  const p256dh = String(body?.keys?.p256dh ?? "");
  const auth = String(body?.keys?.auth ?? "");

  // הגבלות אורך. הדפדפן שולח את זה, אבל המסלול פתוח לכל מי שמחובר,
  // ובלי התקרות אפשר לתקוע מחרוזות ענק בטבלה.
  if (!endpoint.startsWith("https://") || endpoint.length > 2048) {
    return NextResponse.json({ error: "כתובת מכשיר לא תקינה" }, { status: 400 });
  }
  if (p256dh.length < 20 || p256dh.length > 500) {
    return NextResponse.json({ error: "מפתח הצפנה לא תקין" }, { status: 400 });
  }
  if (auth.length < 16 || auth.length > 500) {
    return NextResponse.json({ error: "מפתח אימות לא תקין" }, { status: 400 });
  }

  await initDb();

  // אותו מכשיר יכול להירשם שוב אחרי שהמנוי התחדש, ואז צריך לעדכן את
  // המפתחות ואת הבעלים במקום ליצור שורה נוספת.
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint,user_id,p256dh,auth,created_at)
          VALUES (?,?,?,?,?)
          ON CONFLICT(endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            p256dh  = excluded.p256dh,
            auth    = excluded.auth`,
    args: [endpoint, user.id, p256dh, auth, new Date().toISOString()],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? "");
  if (!endpoint) return NextResponse.json({ error: "חסר מזהה מכשיר" }, { status: 400 });

  await initDb();
  await db.execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
    args: [endpoint, user.id],
  });

  return NextResponse.json({ ok: true });
}
