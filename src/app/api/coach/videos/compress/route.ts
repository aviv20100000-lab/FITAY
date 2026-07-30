/**
 * ניסיון דחיסה חוזר, ביוזמת המאמן.
 *
 * הדחיסה רצה מיד אחרי ההעלאה, ואם היא נכשלה יש משימה יומית שאוספת.
 * יום זה הרבה זמן לחכות כשעומדים מול המסך, ולכן יש גם כפתור.
 */
import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { compressVideo } from "@/lib/video-compress";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url = String(body?.url ?? "");
  if (!url) return NextResponse.json({ error: "חסר סרטון" }, { status: 400 });

  await initDb();

  const found = await db.execute({
    sql: "SELECT id FROM videos WHERE url = ?",
    args: [url],
  });
  const id = found.rows[0]?.id;
  if (!id) {
    return NextResponse.json({ error: "הסרטון לא נמצא" }, { status: 404 });
  }

  // מאפסים את מונה הניסיונות. הלחיצה היא בקשה מפורשת לנסות שוב, ואין
  // סיבה שתקרת הניסיונות האוטומטית תחסום אותה.
  await db.execute({
    sql: `UPDATE videos SET compress_state = 'pending', compress_attempts = 0,
          compress_error = '' WHERE id = ?`,
    args: [String(id)],
  });

  const outcome = await compressVideo(String(id));

  if (outcome.status === "failed") {
    return NextResponse.json({ error: outcome.reason }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: outcome.status });
}
