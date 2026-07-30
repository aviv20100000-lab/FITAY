/**
 * התראת בדיקה למי שמחובר.
 *
 * דחיפה נשברת בשקט: ההרשאה נראית מאושרת, המנוי נראה קיים, ואף התראה לא
 * מגיעה. הדרך היחידה לדעת היא לשלוח אחת ולראות. הכפתור בהגדרות ההתראות
 * קורא לכאן.
 */
import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToUser } from "@/lib/push";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  await initDb();

  const res = await sendToUser(user.id, {
    title: "ההתראות עובדות",
    body: "זו התראת בדיקה. אפשר להתעלם ממנה.",
    url: user.role === "coach" ? "/coach" : "/client",
    tag: "test",
  });

  if (res.sent === 0) {
    return NextResponse.json(
      { error: "לא נמצא מכשיר רשום. נסה לכבות ולהדליק את ההתראות." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, sent: res.sent });
}
