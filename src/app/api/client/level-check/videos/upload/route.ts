import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import {
  canUploadLevelCheck,
  getLevelCheckState,
  LEVEL_CHECK_BLOB_PREFIX,
} from "@/lib/level-check";

/**
 * מנפיק אסימון העלאה חד-פעמי למתאמן, לסרטוני בדיקת סיום הרמה.
 *
 * מסלול נפרד מזה של המאמן ולא הרפיה של הבדיקה שם. ספריית ההדגמות לא
 * אמורה להיפתח למתאמנים בשביל הפיצ'ר הזה.
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
 * בטלפון, והתקרה היא בלם מפני העלאה חוזרת של קבצי ענק.
 */
const MAX_CLIP_BYTES = 120 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const programId = String(
    new URL(request.url).searchParams.get("programId") ?? ""
  );
  if (!programId) {
    return NextResponse.json({ error: "חסרה תוכנית" }, { status: 400 });
  }

  await initDb();
  const state = await getLevelCheckState(user.id, programId);
  if (!state) {
    return NextResponse.json({ error: "התוכנית לא נמצאה" }, { status: 404 });
  }

  const pending = await db.execute({
    sql: `SELECT 1 FROM level_requests
           WHERE trainee_id = ? AND from_program_id = ? AND status = 'pending'`,
    args: [user.id, programId],
  });
  // אין טעם להנפיק אסימון לפני שהתוכנית הושלמה או בזמן שהבקשה אצל איתי.
  // בלי הבדיקה אפשר להעלות קבצים שאף מסך לא יציג ואף אחד לא ימחק.
  if (!canUploadLevelCheck(state, pending.rows.length > 0)) {
    return NextResponse.json(
      {
        error: state.finished
          ? "הבקשה כבר נשלחה, אי אפשר להחליף סרטונים עכשיו"
          : `אפשר לצלם אחרי שתשלים את כל ${state.target} האימונים`,
      },
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
        // אסימון ולכתוב לכל מקום באחסון, כולל על ספריית ההדגמות.
        const allowed = `${LEVEL_CHECK_BLOB_PREFIX}/${state.assignmentId}/`;
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
