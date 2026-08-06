/**
 * סימון וביטול של יום אימון מתוכנן.
 *
 * תזכורת אישית של המתאמן. לא חוסמת אימון, לא פותחת אימון, ולא משנה את
 * בחירת האימון הבא.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb } from "@/lib/db";
import {
  isDayInRange,
  isValidDay,
  setTrainingDay,
} from "@/lib/training-days";

export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const day = String(body?.day ?? "");
  const planned = body?.planned === true;

  // התאריך מגיע מהדפדפן, כי "היום" נקבע לפי השעון של המתאמן ולא של השרת.
  // לכן הוא קלט שצריך לאמת, ולא עובדה.
  if (!isValidDay(day)) {
    return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });
  }
  if (!isDayInRange(day)) {
    return NextResponse.json(
      { error: "אפשר לסמן רק ימים קרובים" },
      { status: 400 }
    );
  }

  await initDb();
  await setTrainingDay(user.id, day, planned);

  return NextResponse.json({ ok: true });
}
