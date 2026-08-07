import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const programId = String(body?.programId ?? "");
  const sessionsPerWeek = Number(body?.sessionsPerWeek);
  // 2, 3 או 4. אותה רשימה בדיוק שהאילוץ במסד מכיר, ובדיוק מה שמוצג במסך.
  if (!programId || ![2, 3, 4].includes(sessionsPerWeek)) {
    return NextResponse.json(
      { error: "צריך לבחור 2, 3 או 4 אימונים בשבוע" },
      { status: 400 }
    );
  }

  await initDb();
  const result = await db.execute({
    sql: `UPDATE assignments
             SET sessions_per_week = ?
           WHERE trainee_id = ? AND program_id = ? AND status = 'active'`,
    args: [sessionsPerWeek, user.id, programId],
  });
  if (!result.rowsAffected) {
    return NextResponse.json({ error: "התוכנית לא נמצאה" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
