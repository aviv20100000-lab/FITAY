import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser } from "@/lib/auth";
import { initDb } from "@/lib/db";
import {
  canUploadInitialCheck,
  getInitialCheckState,
  INITIAL_CHECK_BLOB_PREFIX,
} from "@/lib/initial-check";

/**
 * מנפיק אסימון העלאה חד-פעמי למתאמן, לסרטוני בדיקת הפתיחה.
 *
 * מסלול נפרד מזה של המאמן ולא הרפיה של הבדיקה שם. שם ההרשאה היא coach,
 * וספריית ההדגמות לא אמורה להיפתח למתאמנים בשביל הפיצ'ר הזה.
 *
 * הקובץ עולה מהטלפון ישירות ל-Blob ולא דרך השרת, אחרת מגבלת גוף הבקשה
 * הייתה חוסמת כל קליפ מעל ~4.5MB.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

/**
 * תקרה נמוכה מזו של ספריית ההדגמות.
 *
 * שם מדובר בסרטון הדגמה ערוך שאיתי מעלה מהמחשב. כאן זה סט אחד מצולם
 * בטלפון, והתקרה היא בלם מפני העלאה חוזרת של קבצי ענק. קליפ שנחסם מחזיר
 * שגיאה מיידית במקום לבלוע רוחב פס של מתאמן ברשת סלולרית.
 */
const MAX_CLIP_BYTES = 120 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const url = new URL(request.url);
  const programId = String(url.searchParams.get("programId") ?? "");
  if (!programId) {
    return NextResponse.json({ error: "חסרה תוכנית" }, { status: 400 });
  }

  await initDb();
  const state = await getInitialCheckState(user.id, programId);
  if (!state) {
    return NextResponse.json({ error: "התוכנית לא נמצאה" }, { status: 404 });
  }
  // אין טעם להנפיק אסימון כשהדיווח כבר ממתין להחלטה או אושר. בלי הבדיקה
  // הזאת אפשר להעלות קבצים שאף מסך לא יציג ואף אחד לא ימחק.
  if (!canUploadInitialCheck(state.status)) {
    return NextResponse.json(
      { error: "אי אפשר להחליף סרטונים בשלב הזה" },
      { status: 409 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // האסימון מונפק רק לנתיב של השיוך הזה. בלי זה מתאמן יכול לבקש
        // אסימון ולכתוב לכל מקום באחסון, כולל על ספריית ההדגמות של איתי.
        const allowed = `${INITIAL_CHECK_BLOB_PREFIX}/${state.assignmentId}/`;
        if (!pathname.startsWith(allowed)) {
          throw new Error("נתיב העלאה לא תקין");
        }
        return {
          allowedContentTypes: [
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "video/x-m4v",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_CLIP_BYTES,
        };
      },
      // הרישום למסד נעשה מהדפדפן אחרי ההעלאה. הקריאה החוזרת הזו לא מגיעה
      // בכלל בפיתוח מקומי, ולכן אי אפשר להסתמך עליה.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "ההעלאה נכשלה";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
