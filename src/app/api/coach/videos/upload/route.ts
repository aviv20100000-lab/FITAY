import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { contentTypeFor, presignPut, publicUrl, uniqueKey } from "@/lib/r2";

/**
 * מנפיק כתובת חתומה להעלאה ישירה ל-R2.
 *
 * הקובץ עולה מהטלפון אל האחסון ולא עובר דרך השרת שלנו — אחרת כל סרטון
 * מעל ארבעה וחצי מגה היה נחסם על ידי מגבלת גוף הבקשה, וקליפ מהאייפון
 * הוא בקלות שלושים.
 *
 * החתימה כוללת את המפתח ואת סוג התוכן, ולכן הדפדפן לא יכול לכתוב לשום
 * מקום אחר בדלי ולא להעלות קובץ מסוג אחר.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

const ALLOWED = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

/** אותה תקרה שהייתה על אסימון ההעלאה הקודם. */
const MAX_BYTES = 300 * 1024 * 1024;

export async function POST(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const filename = String(body?.filename ?? "").trim();
  const size = Number(body?.size ?? 0);
  if (!filename) {
    return NextResponse.json({ error: "חסר שם קובץ" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json(
      { error: `הקובץ גדול מהמותר, עד ${Math.round(MAX_BYTES / 1024 / 1024)}MB` },
      { status: 400 }
    );
  }

  // סוג התוכן נקבע כאן ולא נלקח מהדפדפן, כי הוא נחתם יחד עם הכתובת.
  const contentType = contentTypeFor(filename);
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json({ error: "אפשר להעלות סרטונים בלבד" }, { status: 400 });
  }

  const key = uniqueKey("videos", filename);
  try {
    const uploadUrl = await presignPut(key, contentType);
    return NextResponse.json({
      uploadUrl,
      contentType,
      url: publicUrl(key),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "ההעלאה נכשלה";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
