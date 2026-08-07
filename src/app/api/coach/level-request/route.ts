/**
 * המאמן מכריע בבקשת מעבר רמה.
 *
 * אישור עושה שני דברים: מסמן את הבקשה, ומשייך את התוכנית הבאה שהמאמן
 * בחר. התוכנית הישנה לא מנותקת, כדי שההיסטוריה והמעקב יישארו.
 */
import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToUser } from "@/lib/push";
import { discardLevelCheckVideos } from "@/lib/level-check";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const requestId = String(body?.requestId ?? "");
  const approve = body?.approve === true;
  const nextProgramId = String(body?.nextProgramId ?? "");

  if (!requestId) {
    return NextResponse.json({ error: "חסרה בקשה" }, { status: 400 });
  }
  if (approve && !nextProgramId) {
    return NextResponse.json({ error: "בחר לאיזו תוכנית להעביר" }, { status: 400 });
  }

  await initDb();

  const found = await db.execute({
      sql: `SELECT r.trainee_id, r.from_program_id, r.status, u.name
            FROM level_requests r JOIN users u ON u.id = r.trainee_id
           WHERE r.id = ?`,
    args: [requestId],
  });
  const row = found.rows[0];
  if (!row) return NextResponse.json({ error: "הבקשה לא נמצאה" }, { status: 404 });
  if (String(row.status) !== "pending") {
    return NextResponse.json({ error: "הבקשה כבר טופלה" }, { status: 409 });
  }

  const traineeId = String(row.trainee_id);
  const now = new Date().toISOString();

  // המזהה נקרא לפני ההכרעה, כי אישור סוגר את הריצה ואחרי זה אי אפשר
  // לאתר אותה באותם תנאים. בלעדיו אין דרך למחוק את הסרטונים.
  const assignment = await db.execute({
    sql: `SELECT id FROM assignments
           WHERE trainee_id = ? AND program_id = ? AND status = 'active'`,
    args: [traineeId, String(row.from_program_id)],
  });
  const assignmentId = assignment.rows[0] ? String(assignment.rows[0].id) : null;

  /*
   * התוכנית הבאה נבדקת לפני שהבקשה מסומנת, ולא אחריה.
   *
   * קודם הבקשה סומנה 'approved' ורק אז נבדק שהתוכנית קיימת, ולכן מזהה
   * שגוי השאיר בקשה מאושרת בלי שיוך חדש — והיא כבר לא 'pending', כלומר
   * אי אפשר להכריע בה שוב והמתאמן נתקע בלי תוכנית.
   */
  let nextTitle = "";
  if (approve) {
    const program = await db.execute({
      sql: "SELECT title FROM programs WHERE id = ?",
      args: [nextProgramId],
    });
    if (!program.rows.length) {
      return NextResponse.json({ error: "התוכנית לא נמצאה" }, { status: 404 });
    }
    nextTitle = String(program.rows[0].title);
  }

  await db.execute({
    sql: "UPDATE level_requests SET status = ?, decided_at = ? WHERE id = ?",
    args: [approve ? "approved" : "declined", now, requestId],
  });

  if (approve) {
    // הסדר חשוב: קודם סוגרים את הריצה הנוכחית ורק אחר כך פותחים את הבאה.
    // ככה גם מעבר לאותה תוכנית פותח ריצה חדשה במקום לדרוס את הקודמת.
    await db.batch([
      {
        sql: `UPDATE assignments
                 SET status = 'completed', completed_at = ?
               WHERE trainee_id = ? AND program_id = ? AND status = 'active'`,
        args: [now, traineeId, String(row.from_program_id)],
      },
      {
        sql: `INSERT INTO assignments
                (id, trainee_id, program_id, assigned_at, target_sessions, status, initial_check_status)
              VALUES (?,?,?,?,24,'active','not_ready')
              ON CONFLICT(trainee_id, program_id) WHERE status = 'active' DO UPDATE SET
                assigned_at = excluded.assigned_at,
                sessions_per_week = NULL,
                target_sessions = 24,
                initial_check_status = 'not_ready',
                initial_check_reported_at = NULL,
                initial_check_decided_at = NULL,
                completed_at = NULL`,
        args: [randomUUID(), traineeId, nextProgramId, now],
      },
    ]);

    after(async () => {
      try {
        await sendToUser(traineeId, {
          title: "אושר לך מעבר רמה",
          body: nextTitle,
          url: "/client",
          tag: "level-approved",
        });
      } catch {
        // ההודעה במסך קיימת גם בלי ההתראה.
      }
    });
  } else {
    after(async () => {
      try {
        await sendToUser(traineeId, {
          title: "הבקשה נבדקה ב-FITAY",
          body: "ממשיכים בינתיים בתוכנית הנוכחית.",
          url: "/client",
          tag: "level-declined",
        });
      } catch {
        // אותו דבר.
      }
    });
  }

  /*
   * שתי ההכרעות סופיות, ולכן שתיהן מוחקות את הסרטונים. רק החזרה לביצוע
   * חוזר משאירה אותם, כי שם המתאמן אמור להחליף חלק מהם.
   *
   * אחרי התשובה ולא לפניה: ההכרעה לא צריכה לחכות לארבע מחיקות ברשת, וכשל
   * במחיקה לא אמור להשאיר את המתאמן תקוע. מה שנשאר נאסף בניקוי היומי.
   */
  if (assignmentId) {
    after(async () => {
      try {
        await discardLevelCheckVideos(assignmentId);
      } catch {}
    });
  }

  return NextResponse.json({ ok: true });
}
