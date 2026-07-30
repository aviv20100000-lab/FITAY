import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function isCoach() {
  const user = await getSessionUser();
  return !!user && user.role === "coach";
}

/**
 * שיוך תוכנית למתאמן.
 *
 * כל שיוך פותח ריצה חדשה. אם כבר יש ריצה פעילה על אותה תוכנית היא
 * מתאפסת במקום להיפתח פעם שנייה, וזה מה שהאינדקס הייחודי החלקי אוכף.
 * ריצות שהסתיימו לא נוגעים בהן, ולכן ההיסטוריה נשמרת.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const traineeId = String(body.traineeId ?? "");
  const programId = String(body.programId ?? "");
  if (!traineeId || !programId) {
    return NextResponse.json({ error: "חסר מתאמן או תוכנית" }, { status: 400 });
  }

  await initDb();
  await db.execute({
    sql: `INSERT INTO assignments (id, trainee_id, program_id, assigned_at)
          VALUES (?,?,?,?)
          ON CONFLICT(trainee_id, program_id) WHERE status = 'active' DO UPDATE SET
            assigned_at = excluded.assigned_at,
            sessions_per_week = NULL,
            target_sessions = 24,
            initial_check_status = 'not_ready',
            initial_check_reported_at = NULL,
            initial_check_decided_at = NULL,
            completed_at = NULL`,
    args: [randomUUID(), traineeId, programId, new Date().toISOString()],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  const url = new URL(request.url);
  const traineeId = url.searchParams.get("traineeId");
  const programId = url.searchParams.get("programId");
  if (!traineeId || !programId) {
    return NextResponse.json({ error: "חסרים פרטים" }, { status: 400 });
  }

  // רק הריצה הפעילה יורדת. ריצות שהמתאמן כבר סיים נשארות בהיסטוריה שלו.
  await initDb();
  await db.execute({
    sql: "DELETE FROM assignments WHERE trainee_id = ? AND program_id = ? AND status = 'active'",
    args: [traineeId, programId],
  });
  return NextResponse.json({ ok: true });
}
