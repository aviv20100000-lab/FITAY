/**
 * המתאמן מבקש לעבור לרמה הבאה.
 *
 * לפי FITAY: מסיימים רמה, שולחים בקשה, והמאמן מאשר. המטרה היא
 * שלא ירוצו קדימה לפני שהם יציבים ברמה הנוכחית, ולכן המעבר לא אוטומטי.
 */
import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToCoach } from "@/lib/push";
import {
  getLevelCheckState,
  REQUIRED_LEVEL_EXERCISES,
} from "@/lib/level-check";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const programId = String(body?.programId ?? "");
  const note = String(body?.note ?? "").trim().slice(0, 500);
  if (!programId) {
    return NextResponse.json({ error: "חסרה תוכנית" }, { status: 400 });
  }

  await initDb();

  // רק תוכנית שמשויכת לו. אחרת אפשר לבקש מעבר על תוכנית של מישהו אחר.
  //
  // התנאי על אישור הפתיחה ירד ב-7 באוגוסט 2026 יחד עם בדיקת הפתיחה עצמה.
  // הבדיקה עברה לכאן: ארבעה סרטונים מצורפים לבקשה, ואיתי צופה בהם כשהוא
  // מחליט על המעבר.
  const state = await getLevelCheckState(user.id, programId);
  if (!state) {
    return NextResponse.json({ error: "התוכנית לא משויכת לך" }, { status: 403 });
  }
  if (!state.finished) {
    return NextResponse.json(
      { error: `נשארו עוד ${state.target - state.completed} אימונים` },
      { status: 409 }
    );
  }
  if (state.exercises.length < REQUIRED_LEVEL_EXERCISES) {
    return NextResponse.json(
      { error: "אין מספיק תרגילים בתוכנית לבדיקה" },
      { status: 409 }
    );
  }
  if (!state.ready) {
    const missing = state.exercises.filter(
      (e) => !e.videoUrl || e.needsRedo
    ).length;
    return NextResponse.json(
      { error: `חסרים ${missing} סרטונים כדי לשלוח` },
      { status: 409 }
    );
  }

  const open = await db.execute({
    sql: `SELECT 1 FROM level_requests
           WHERE trainee_id = ? AND from_program_id = ? AND status = 'pending'`,
    args: [user.id, programId],
  });
  if (open.rows.length) {
    return NextResponse.json(
      { error: "הבקשה כבר נשלחה וממתינה לבדיקה ב-FITAY" },
      { status: 409 }
    );
  }

  await db.execute({
    // coach_note מתאפס בכל בקשה חדשה, אחרת המתאמן ימשיך לראות הערה על
    // תיקון שהוא כבר ביצע.
    sql: `INSERT INTO level_requests
            (id,trainee_id,from_program_id,status,note,coach_note,requested_at)
          VALUES (?,?,?,'pending',?,'',?)`,
    args: [randomUUID(), user.id, programId, note, new Date().toISOString()],
  });

  // ההתראה רצה אחרי התשובה. המתאמן לא צריך לחכות לה, ואם היא נכשלת
  // הבקשה עדיין נרשמה ומאמן FITAY יראה אותה במסך.
  after(async () => {
    try {
      const program = await db.execute({
        sql: "SELECT title FROM programs WHERE id = ?",
        args: [programId],
      });
      await sendToCoach({
        title: `${user.name} מבקש לעבור רמה`,
        body: `סיים את ${String(program.rows[0]?.title ?? "התוכנית")}`,
        url: "/coach",
        tag: `level-${user.id}`,
      });
    } catch {
      // התראה שלא נשלחה לא הופכת בקשה שנרשמה לכישלון.
    }
  });

  return NextResponse.json({ ok: true });
}
