import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { presignPut } from "@/lib/r2";

/**
 * מסלול אבחון זמני לתקלת ההעלאות מ-9 באוגוסט 2026.
 *
 * ההעלאות מהדפדפן נכשלות בפרודקשן בזמן שאותה חתימה בדיוק עובדת מקומית,
 * והמשתנים בוורסל מוגדרים רגישים ואי אפשר לקרוא אותם מבחוץ. המסלול הזה
 * עונה על השאלה היחידה שנשארה: האם הסביבה שהשרת באמת רץ איתה מסוגלת
 * לחתום ולהעלות. הוא מדווח נוכחות ואורכים בלבד, אף פעם לא ערכים.
 *
 * למחוק אחרי שהתקלה נסגרת.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const lengths = {
    R2_ENDPOINT: (process.env.R2_ENDPOINT ?? "").trim().length,
    R2_ACCESS_KEY_ID: (process.env.R2_ACCESS_KEY_ID ?? "").trim().length,
    R2_SECRET_ACCESS_KEY: (process.env.R2_SECRET_ACCESS_KEY ?? "").trim().length,
    R2_BUCKET: (process.env.R2_BUCKET ?? "").trim().length,
    R2_PUBLIC_URL: (process.env.R2_PUBLIC_URL ?? "").trim().length,
  };

  let put: string;
  try {
    const url = await presignPut("videos/r2-diagnostic.txt", "video/mp4", 120);
    const res = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "video/mp4" },
      body: "diagnostic",
    });
    put = `status ${res.status}`;
    if (!res.ok) {
      const body = await res.text();
      const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1];
      if (code) put += ` (${code})`;
    }
  } catch (e) {
    put = `threw: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({ lengths, put });
}
