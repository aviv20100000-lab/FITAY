import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import { sendToCoach } from "@/lib/push";
import {
  getInitialCheckState,
  REQUIRED_INITIAL_EXERCISES,
} from "@/lib/initial-check";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const programId = String(body?.programId ?? "");
  if (!programId) {
    return NextResponse.json({ error: "חסרה תוכנית" }, { status: 400 });
  }

  await initDb();
  const state = await getInitialCheckState(user.id, programId);
  if (!state) {
    return NextResponse.json({ error: "התוכנית לא נמצאה" }, { status: 404 });
  }

  const title = await db.execute({
    sql: "SELECT title FROM programs WHERE id = ?",
    args: [programId],
  });
  const programTitle = String(title.rows[0]?.title ?? "התוכנית");

  if (state.exercises.length < REQUIRED_INITIAL_EXERCISES) {
    return NextResponse.json(
      { error: "אפשר לדווח אחרי שתסיים את האימון הראשון" },
      { status: 409 }
    );
  }
  // שליחה מותרת מהמצב ההתחלתי וגם אחרי החזרה לביצוע חוזר. כל מצב אחר
  // אומר שהדיווח כבר אצל איתי או שהוא כבר החליט.
  const resending = state.status === "returned";
  if (state.status !== "not_ready" && !resending) {
    return NextResponse.json({ error: "הדיווח כבר נשלח" }, { status: 409 });
  }
  if (!state.ready) {
    const missing = state.exercises.filter((e) => !e.videoUrl).length;
    return NextResponse.json(
      { error: `חסרים ${missing} סרטונים כדי לשלוח` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE assignments
             SET initial_check_status = 'pending',
                 initial_check_reported_at = ?,
                 initial_check_note = ''
           WHERE id = ? AND initial_check_status = ?`,
    args: [now, state.assignmentId, state.status],
  });
  // המצב השתנה בין הקריאה לכתיבה, למשל שתי לחיצות ששלחו במקביל.
  if (!result.rowsAffected) {
    return NextResponse.json({ error: "הדיווח כבר נשלח" }, { status: 409 });
  }

  after(async () => {
    try {
      await sendToCoach({
        title: resending
          ? `${user.name} שלח סרטונים מתוקנים`
          : `${user.name} מחכה לאישור פתיחה`,
        body: resending
          ? `הביצוע החוזר ב-${programTitle} מוכן לצפייה.`
          : `האימון הראשון ב-${programTitle} עבר בסדר, והסרטונים מחכים לך.`,
        url: "/coach",
        tag: `initial-check-${user.id}`,
      });
    } catch {}
  });

  return NextResponse.json({ ok: true });
}
