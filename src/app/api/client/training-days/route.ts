/**
 * שמירת ימי האימון שהמתאמן סימן לעצמו.
 *
 * שמירה של חודשים שלמים ולא של יום בודד. הלוח החודשי מחזיק את הסימונים
 * אצלו עד שלוחצים שמור, ולכן הבקשה מתארת מצב סופי ולא פעולה.
 *
 * תזכורת אישית בלבד. לא חוסמת אימון, לא פותחת אימון, ולא משנה את בחירת
 * האימון הבא.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb } from "@/lib/db";
import {
  isDayInRange,
  isValidDay,
  isValidMonth,
  replaceTrainingMonths,
} from "@/lib/training-days";

export const preferredRegion = "fra1";

/** תקרה שמונעת בקשה שמנסה לכתוב שנה שלמה בבת אחת. */
const MAX_MONTHS = 6;
const MAX_DAYS = 200;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const months = Array.isArray(body?.months)
    ? body.months.map((m: unknown) => String(m))
    : [];
  const days = Array.isArray(body?.days)
    ? body.days.map((d: unknown) => String(d))
    : [];

  if (months.length === 0) {
    return NextResponse.json({ error: "אין מה לשמור" }, { status: 400 });
  }
  if (months.length > MAX_MONTHS || days.length > MAX_DAYS) {
    return NextResponse.json({ error: "יותר מדי ימים" }, { status: 400 });
  }

  // הכל מגיע מהדפדפן, כי "היום" נקבע לפי השעון של המתאמן ולא של השרת.
  // לכן זה קלט שצריך לאמת, ולא עובדה.
  if (!months.every(isValidMonth)) {
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
  if (!days.every((day: string) => isValidDay(day) && isDayInRange(day))) {
    return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });
  }

  await initDb();
  await replaceTrainingMonths(user.id, months, days);

  return NextResponse.json({ ok: true });
}
