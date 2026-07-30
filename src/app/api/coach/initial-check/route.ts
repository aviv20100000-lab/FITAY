import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import { sendToUser } from "@/lib/push";

export async function POST(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const traineeId = String(body?.traineeId ?? "");
  const programId = String(body?.programId ?? "");
  if (!traineeId || !programId) {
    return NextResponse.json({ error: "חסרים פרטים" }, { status: 400 });
  }

  await initDb();
  const result = await db.execute({
    sql: `UPDATE assignments
             SET initial_check_status = 'approved', initial_check_decided_at = ?
           WHERE trainee_id = ? AND program_id = ?
             AND status = 'active' AND initial_check_status = 'pending'`,
    args: [new Date().toISOString(), traineeId, programId],
  });
  if (!result.rowsAffected) {
    return NextResponse.json({ error: "הבקשה כבר טופלה" }, { status: 409 });
  }

  after(async () => {
    try {
      await sendToUser(traineeId, {
        title: "אפשר להמשיך בתוכנית",
        body: "FITAY אישר את בדיקת הפתיחה.",
        url: "/client",
        tag: "initial-check-approved",
      });
    } catch {}
  });

  return NextResponse.json({ ok: true });
}
