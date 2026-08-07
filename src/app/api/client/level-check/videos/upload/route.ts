import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import {
  canUploadLevelCheck,
  getLevelCheckState,
  LEVEL_CHECK_PREFIX,
} from "@/lib/level-check";
import { contentTypeFor, presignPut, publicUrl } from "@/lib/r2";

/**
 * מנפיק כתובת חתומה למתאמן, לסרטוני בדיקת סיום הרמה.
 *
 * מסלול נפרד מזה של המאמן ולא הרפיה של הבדיקה שם. ספריית ההדגמות לא
 * אמורה להיפתח למתאמנים בשביל הפיצ'ר הזה.
 *
 * הקובץ עולה מהטלפון ישירות ל-R2 ולא דרך השרת, אחרת מגבלת גוף הבקשה
 * הייתה חוסמת כל קליפ מעל ארבעה וחצי מגה.
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

const ALLOWED = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

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

  const body = await request.json().catch(() => null);
  const filename = String(body?.filename ?? "").trim();
  const exerciseId = String(body?.exerciseId ?? "").trim();
  const size = Number(body?.size ?? 0);

  if (!filename || !exerciseId) {
    return NextResponse.json({ error: "חסרים פרטי הקובץ" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_CLIP_BYTES) {
    return NextResponse.json(
      {
        error: `הקליפ גדול מהמותר, עד ${Math.round(MAX_CLIP_BYTES / 1024 / 1024)}MB`,
      },
      { status: 400 }
    );
  }

  // רק תרגיל שבאמת נמצא ברשימת הארבעה של השיוך הזה.
  if (!state.exercises.some((e) => e.exerciseId === exerciseId)) {
    return NextResponse.json({ error: "התרגיל לא בבדיקה הזאת" }, { status: 400 });
  }

  const contentType = contentTypeFor(filename);
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json({ error: "אפשר להעלות סרטונים בלבד" }, { status: 400 });
  }

  /*
   * המפתח נבנה בשרת ולא מתקבל מהדפדפן. קודם הדפדפן שלח נתיב והשרת בדק
   * שהוא מתחיל בקידומת הנכונה; עכשיו אין מה לבדוק, כי אין דרך לבקש
   * מפתח אחר. מתאמן לא יכול לקבל חתימה שכותבת על ספריית ההדגמות.
   *
   * הסיומת נגזרת מסוג התוכן שכבר אושר, ולכן שם קובץ מוזר לא נכנס למפתח.
   */
  const extension = contentType === "video/quicktime"
    ? ".mov"
    : contentType === "video/webm"
      ? ".webm"
      : ".mp4";
  const key = `${LEVEL_CHECK_PREFIX}/${state.assignmentId}/${exerciseId}-${randomUUID().slice(0, 8)}${extension}`;

  try {
    const uploadUrl = await presignPut(key, contentType);
    return NextResponse.json({ uploadUrl, contentType, url: publicUrl(key) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "ההעלאה נכשלה";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
