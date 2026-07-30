import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser } from "@/lib/auth";

/**
 * מנפיק אסימון העלאה חד-פעמי לדפדפן.
 *
 * הקובץ עולה ישירות מהטלפון אל Vercel Blob ולא עובר דרך השרת שלנו —
 * אחרת כל סרטון מעל ~4.5MB היה נחסם על ידי מגבלת גוף הבקשה, וקליפ
 * מהאייפון הוא בקלות 30MB.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "video/mp4",
          "video/quicktime",
          "video/webm",
          "video/x-m4v",
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 300 * 1024 * 1024,
      }),
      // הרישום למסד נעשה מהדפדפן אחרי ההעלאה. הקריאה החוזרת הזו לא
      // מגיעה בכלל בפיתוח מקומי, ולכן אי אפשר להסתמך עליה.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "ההעלאה נכשלה";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
