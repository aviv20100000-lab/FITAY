/**
 * רשת ביטחון לדחיסה.
 *
 * הדחיסה עצמה רצה מיד אחרי ההעלאה, בתוך אותה הפעלה של השרת. אם ההפעלה
 * נחתכה באמצע, או שהקליפ היה ארוך מהתקרה, השורה נשארת ב-pending או
 * ב-failed. המסלול הזה אוסף אותן ומנסה שוב.
 *
 * מופעל אוטומטית לפי vercel.json. אין פה שום צעד ידני.
 */
import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { compressVideo, pendingVideoIds } from "@/lib/video-compress";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export const maxDuration = 60;

export async function GET(request: Request) {
  // ב-Vercel ה-cron מגיע עם CRON_SECRET בכותרת. בלי הבדיקה כל אחד ברשת
  // היה יכול להפעיל תור דחיסה ולשרוף זמן חישוב.
  //
  // בפרודקשן חסר סוד הוא שגיאת הגדרה ולא היתר פתוח, ולכן חוסמים. בפיתוח
  // מקומי אין cron בכלל, ושם מותר להריץ ידנית.
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

  // אחד בכל הרצה. הדחיסה כבדה, ושתיים במקביל מסכנות את התקרה של הפונקציה.
  const ids = await pendingVideoIds(1);
  const results: { id: string; status: string }[] = [];

  for (const id of ids) {
    const outcome = await compressVideo(id);
    results.push({ id, status: outcome.status });
  }

  return NextResponse.json({ processed: results.length, results });
}
