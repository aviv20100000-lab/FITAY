/**
 * רישום והסרה של סרטון בדיקת פתיחה.
 *
 * הקובץ כבר ב-Blob בשלב הזה. המסלול הזה רק קושר אותו לתרגיל, או מנתק
 * ומוחק. כל החלפה מוחקת את הקובץ הישן, אחרת כל צילום חוזר משאיר עוד עותק
 * שאף מסך לא מציג ואף אחד לא מנקה.
 */
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import {
  canUploadInitialCheck,
  getInitialCheckState,
  INITIAL_CHECK_BLOB_PREFIX,
  type InitialCheckState,
} from "@/lib/initial-check";

export const preferredRegion = "fra1";

/**
 * כתובת שהתקבלה מהדפדפן היא קלט, לא עובדה.
 *
 * בלי הבדיקה הזאת מתאמן יכול לרשום כתובת של קובץ אחר באותו אחסון, למשל
 * סרטון הדגמה מהספרייה של איתי, ואז האישור בסוף התהליך היה מוחק אותו.
 * הקידומת נקבעת בהעלאה מהמסך, ולכן אפשר לדרוש אותה כאן.
 */
function isOwnClipUrl(raw: string, assignmentId: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return false;
  return parsed.pathname.startsWith(
    `/${INITIAL_CHECK_BLOB_PREFIX}/${assignmentId}/`
  );
}

type LoadResult =
  | { error: NextResponse; user: null; state: null }
  | { error: null; user: { id: string }; state: InitialCheckState };

function loadFailure(message: string, status: number): LoadResult {
  return {
    error: NextResponse.json({ error: message }, { status }),
    user: null,
    state: null,
  };
}

async function loadEditableState(programId: string): Promise<LoadResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") return loadFailure("אין הרשאה", 403);
  if (!programId) return loadFailure("חסרה תוכנית", 400);

  await initDb();
  const state = await getInitialCheckState(user.id, programId);
  if (!state) return loadFailure("התוכנית לא נמצאה", 404);
  if (!canUploadInitialCheck(state.status)) {
    return loadFailure("אי אפשר להחליף סרטונים בשלב הזה", 409);
  }
  return { error: null, user, state };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const programId = String(body?.programId ?? "");
  const exerciseId = String(body?.exerciseId ?? "");
  const url = String(body?.url ?? "");
  const size = Number(body?.size ?? 0);

  const loaded = await loadEditableState(programId);
  if (loaded.error) return loaded.error;
  const { user, state } = loaded;

  // רק אחד מארבעת התרגילים שהמסך מציג. אחרת אפשר למלא את המכסה בקליפים
  // של תרגילים שלא נבדקים, והשער היה נפתח בלי שאיתי ראה את מה שצריך.
  if (!state.exercises.some((e) => e.exerciseId === exerciseId)) {
    return NextResponse.json(
      { error: "התרגיל הזה לא בבדיקת הפתיחה" },
      { status: 400 }
    );
  }
  if (!isOwnClipUrl(url, state.assignmentId)) {
    return NextResponse.json({ error: "כתובת הסרטון לא תקינה" }, { status: 400 });
  }

  const existing = await db.execute({
    sql: "SELECT id, url FROM initial_check_videos WHERE assignment_id = ? AND exercise_id = ?",
    args: [state.assignmentId, exerciseId],
  });
  const previousUrl = existing.rows[0] ? String(existing.rows[0].url) : null;

  const now = new Date().toISOString();
  if (existing.rows[0]) {
    await db.execute({
      // ההחלפה היא מה שסוגר את הדרישה לצלם מחדש. אין צעד נפרד שמסמן
      // "תיקנתי", כי צעד כזה אפשר ללחוץ בלי לצלם כלום.
      sql: `UPDATE initial_check_videos
               SET url = ?, size = ?, uploaded_at = ?, redo_requested_at = NULL
             WHERE id = ?`,
      args: [url, size || null, now, String(existing.rows[0].id)],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO initial_check_videos
              (id, assignment_id, exercise_id, url, size, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [uuidv4(), state.assignmentId, exerciseId, url, size || null, now],
    });
  }

  // המחיקה של הקודם אחרי שהחדש כבר רשום. הסדר ההפוך מסכן במצב שבו הישן
  // נמחק והכתיבה נופלת, והמתאמן נשאר בלי סרטון בלי לדעת.
  if (previousUrl && previousUrl !== url) {
    try {
      await del(previousUrl);
    } catch {
      // הקובץ היתום ייאסף בניקוי היומי. אין סיבה להכשיל את ההעלאה בגללו.
    }
  }

  return NextResponse.json({
    ok: true,
    state: await getInitialCheckState(user.id, programId),
  });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const programId = String(body?.programId ?? "");
  const exerciseId = String(body?.exerciseId ?? "");

  const loaded = await loadEditableState(programId);
  if (loaded.error) return loaded.error;
  const { user, state } = loaded;

  const existing = await db.execute({
    sql: "SELECT id, url FROM initial_check_videos WHERE assignment_id = ? AND exercise_id = ?",
    args: [state.assignmentId, exerciseId],
  });
  if (!existing.rows[0]) {
    return NextResponse.json({ error: "אין סרטון להסיר" }, { status: 404 });
  }

  await db.execute({
    sql: "DELETE FROM initial_check_videos WHERE id = ?",
    args: [String(existing.rows[0].id)],
  });
  try {
    await del(String(existing.rows[0].url));
  } catch {
    // כנ"ל: הניקוי היומי יטפל.
  }

  return NextResponse.json({
    ok: true,
    state: await getInitialCheckState(user.id, programId),
  });
}
