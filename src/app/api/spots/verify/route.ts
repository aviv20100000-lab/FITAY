/**
 * אישור מתח לטבעות, והסתרה של מתח שאינו רלוונטי. לאיתי בלבד.
 *
 * זאת ההבטחה היחידה במסך שמישהו עומד מאחוריה. נקודה שיובאה מ-OSM אומרת
 * רק שיש שם מתקן כושר, ומתח בגובה מטר וחצי בגן שעשועים הוא לא מקום
 * לתלות בו טבעות. לכן התג הירוק לא יכול להגיע ממקור אוטומטי.
 */
import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "חסר מתח" }, { status: 400 });
  }

  await initDb();

  // הסתרה ולא מחיקה: מתח שפורק חייב להישאר במסד, אחרת הסנכרון הבא
  // יביא אותו שוב מ-OSM כאילו כלום.
  if (typeof body?.hidden === "boolean") {
    await db.execute({
      sql: "UPDATE spots SET hidden = ? WHERE id = ?",
      args: [body.hidden ? 1 : 0, id],
    });
    return NextResponse.json({ ok: true });
  }

  const ringsOk = body?.ringsOk === true;
  await db.execute({
    sql: `UPDATE spots
             SET rings_ok = ?, verified_at = ?, verified_by = ?
           WHERE id = ?`,
    args: [ringsOk ? 1 : 0, new Date().toISOString(), user.id, id],
  });

  return NextResponse.json({ ok: true });
}
