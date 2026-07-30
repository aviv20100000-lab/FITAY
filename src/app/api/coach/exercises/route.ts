import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * שיוך סרטון לתרגיל. הסרטונים יושבים ב-Vercel Blob, ולכן נשמרת כאן
 * כתובת מלאה. ריק = מנתק את הסרטון מהתרגיל.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function PATCH(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const exerciseId = String(body.exerciseId ?? "");
  if (!exerciseId) {
    return NextResponse.json({ error: "חסר מזהה תרגיל" }, { status: 400 });
  }

  const raw = body.videoFile == null ? "" : String(body.videoFile).trim();
  const videoFile = raw === "" ? null : raw;

  await initDb();

  // רק כתובת שכבר בקטלוג מתקבלת — אחרת אפשר להזריק לינק חיצוני כלשהו.
  if (videoFile) {
    const known = await db.execute({
      sql: "SELECT 1 FROM videos WHERE url = ?",
      args: [videoFile],
    });
    if (!known.rows.length) {
      return NextResponse.json({ error: "הסרטון לא בקטלוג" }, { status: 400 });
    }
  }

  const res = await db.execute({
    sql: "UPDATE exercises SET video_file = ? WHERE id = ?",
    args: [videoFile, exerciseId],
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ error: "התרגיל לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
