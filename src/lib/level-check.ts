/**
 * בדיקת סיום רמה: ארבעת התרגילים הראשונים בתוכנית והסרטונים שצורפו להם.
 *
 * מחליף את בדיקת הפתיחה. שם הבדיקה ישבה אחרי האימון הראשון, וכאן היא
 * יושבת אחרי 24 האימונים, כחלק מבקשת המעבר לרמה הבאה. הסרטון אמור להראות
 * איפה המתאמן נמצא בסוף הרמה, ולכן הצילום נפתח רק כשהתוכנית הושלמה.
 *
 * מקור אחד לשאלה "אילו ארבעה תרגילים". שלושה מקומות שואלים אותה, המסך,
 * הרישום והשליחה, ושלוש גרסאות של אותו כלל נגמרות במסך שמראה תרגיל אחד
 * ובשרת שדורש אחר.
 */
import { del, list } from "@vercel/blob";
import db from "./db";

/** כמה תרגילים צריך לצלם כדי לשלוח בקשת מעבר. */
export const REQUIRED_LEVEL_EXERCISES = 4;

/**
 * הקידומת של כל קליפ ב-Blob.
 *
 * המסך מעלה אל `level-check/<assignmentId>/...`, גם אסימון ההעלאה וגם
 * הרישום דורשים אותה. ככה כתובת שהתקבלה מהדפדפן לא יכולה להצביע על קובץ
 * אחר באחסון, וזה חשוב כי בסוף התהליך אנחנו מוחקים את מה שרשום.
 */
export const LEVEL_CHECK_BLOB_PREFIX = "level-check";

export type LevelCheckExercise = {
  exerciseId: string;
  name: string;
  videoUrl: string | null;
  /** איתי סימן שאת התרגיל הזה צריך לצלם מחדש, והקליפ עוד לא הוחלף. */
  needsRedo: boolean;
};

export type LevelCheckState = {
  assignmentId: string;
  /** כמה אימונים הושלמו בריצה הזאת, וכמה צריך. */
  completed: number;
  target: number;
  /** התוכנית הושלמה, ולכן מותר לצלם ולשלוח בקשה. */
  finished: boolean;
  exercises: LevelCheckExercise[];
  /** התוכנית הושלמה, יש ארבעה סרטונים, ואף אחד לא מחכה לצילום מחדש. */
  ready: boolean;
};

/**
 * ארבעת התרגילים הראשונים בתוכנית, לפי סדר התוכנית עצמה.
 *
 * שלב, אחר כך מיקום האימון בתוך השלב, ואחר כך מיקום התרגיל בתוך האימון.
 * זה שונה מהבדיקה הישנה, שבחרה לפי מה שנרשם ראשון בפועל: כאן הרשימה ידועה
 * מהיום הראשון, זהה לכל המתאמנים באותה תוכנית, ולא מושפעת משום דבר
 * שהמתאמן עשה או לא עשה.
 *
 * החימום מוחרג. הוא קבוע בכל אימון ולא נבחר לתוכנית, ובלי ההחרגה הוא היה
 * תופס את ארבעת המקומות הראשונים בכל תוכנית.
 */
const FIRST_EXERCISES_SQL = `
  SELECT wi.exercise_id, e.name,
         MIN(w.phase * 1000000 + w.position * 1000 + wi.position) AS ord
    FROM workout_items wi
    JOIN workouts w ON w.id = wi.workout_id
    JOIN exercises e ON e.id = wi.exercise_id
   WHERE w.program_id = ? AND e.category <> 'warmup'
   GROUP BY wi.exercise_id, e.name
   ORDER BY ord, wi.exercise_id
   LIMIT ${REQUIRED_LEVEL_EXERCISES}
`;

/**
 * המצב המלא לשיוך הפעיל, או null אם אין שיוך פעיל לתוכנית הזאת.
 */
export async function getLevelCheckState(
  traineeId: string,
  programId: string
): Promise<LevelCheckState | null> {
  const assignment = await db.execute({
    sql: `SELECT a.id, a.target_sessions,
                 (SELECT COUNT(*) FROM completions c
                   WHERE c.trainee_id = a.trainee_id
                     AND c.program_id = a.program_id
                     AND c.completed_at >= a.assigned_at) AS completed
            FROM assignments a
           WHERE a.trainee_id = ? AND a.program_id = ? AND a.status = 'active'`,
    args: [traineeId, programId],
  });
  const row = assignment.rows[0];
  if (!row) return null;

  const assignmentId = String(row.id);
  const [firstExercises, videos] = await db.batch(
    [
      { sql: FIRST_EXERCISES_SQL, args: [programId] },
      {
        sql: `SELECT exercise_id, url, redo_requested_at
                FROM level_check_videos WHERE assignment_id = ?`,
        args: [assignmentId],
      },
    ],
    "read"
  );

  const byExercise = new Map(
    videos.rows.map((v) => [
      String(v.exercise_id),
      { url: String(v.url), needsRedo: Boolean(v.redo_requested_at) },
    ])
  );
  const exercises = firstExercises.rows.map((e) => {
    const clip = byExercise.get(String(e.exercise_id));
    return {
      exerciseId: String(e.exercise_id),
      name: String(e.name),
      videoUrl: clip?.url ?? null,
      needsRedo: clip?.needsRedo ?? false,
    };
  });

  const completed = Number(row.completed ?? 0);
  const target = Number(row.target_sessions ?? 24);
  const finished = completed >= target;

  return {
    assignmentId,
    completed,
    target,
    finished,
    exercises,
    ready:
      finished &&
      exercises.length === REQUIRED_LEVEL_EXERCISES &&
      exercises.every((e) => e.videoUrl !== null && !e.needsRedo),
  };
}

/**
 * האם המתאמן רשאי להעלות או להחליף סרטון עכשיו.
 *
 * רק אחרי שהתוכנית הושלמה, וכל עוד אין בקשה שממתינה להחלטה. החלפת קליפ
 * מתחת לידיים של איתי בזמן שהוא צופה היא בדיוק מה שלא צריך לקרות.
 */
export function canUploadLevelCheck(
  state: LevelCheckState,
  hasPendingRequest: boolean
) {
  return state.finished && !hasPendingRequest;
}

/**
 * מוחק את כל הסרטונים של שיוך, גם מהאחסון וגם מהקטלוג.
 *
 * הסדר חשוב: קודם הקובץ ורק אז השורה. הפוך מזה, הכתובת אבדה ואין יותר דרך
 * להגיע ל-blob, והוא נשאר תופס מקום לנצח. שורה שהמחיקה שלה נכשלה נשארת
 * במקומה ותיאסף בהרצה הבאה של הניקוי.
 */
export async function discardLevelCheckVideos(assignmentId: string) {
  const rows = await db.execute({
    sql: "SELECT id, url FROM level_check_videos WHERE assignment_id = ?",
    args: [assignmentId],
  });

  let removed = 0;
  for (const row of rows.rows) {
    try {
      await del(String(row.url));
    } catch {
      continue;
    }
    await db.execute({
      sql: "DELETE FROM level_check_videos WHERE id = ?",
      args: [String(row.id)],
    });
    removed += 1;
  }
  return removed;
}

/** קליפ שהתחיל להיות מועלה ולא הגיע לבקשה נחשב נטוש אחרי שבועיים. */
const ABANDONED_AFTER_DAYS = 14;
/** העלאה שרצה ברגע זה ועדיין לא נרשמה לא אמורה להימחק מתחת לידיים. */
const UNREGISTERED_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * איסוף קליפים שאיש כבר לא יגיע אליהם.
 *
 * ארבעה מקורות: אישור שהמחיקה שלו נכשלה, שיוך שכבר לא פעיל, מתאמן שהעלה
 * שניים מארבעה ונטש, וקובץ שהועלה ל-Blob ומעולם לא נרשם למסד. האחרון הוא
 * המקרה שסריקה שעוברת רק על שורות לעולם לא מגיעה אליו, ובלעדיו ההבטחה
 * שהסרטונים נמחקים פשוט לא נכונה.
 */
export async function sweepLevelCheckVideos() {
  const orphans = await db.execute({
    sql: `SELECT DISTINCT v.assignment_id
            FROM level_check_videos v
            LEFT JOIN assignments a ON a.id = v.assignment_id
           WHERE a.id IS NULL
              OR a.status <> 'active'
              OR v.uploaded_at < ?`,
    args: [
      new Date(Date.now() - ABANDONED_AFTER_DAYS * 86_400_000).toISOString(),
    ],
  });

  let removed = 0;
  for (const row of orphans.rows) {
    removed += await discardLevelCheckVideos(String(row.assignment_id));
  }

  return {
    assignments: orphans.rows.length,
    removed,
    unregistered: await sweepUnregisteredClips(),
  };
}

async function sweepUnregisteredClips() {
  const { blobs } = await list({ prefix: `${LEVEL_CHECK_BLOB_PREFIX}/` });
  if (blobs.length === 0) return 0;

  const known = await db.execute("SELECT url FROM level_check_videos");
  const registered = new Set(known.rows.map((r) => String(r.url)));
  const cutoff = Date.now() - UNREGISTERED_GRACE_MS;

  let removed = 0;
  for (const blob of blobs) {
    if (registered.has(blob.url)) continue;
    if (new Date(blob.uploadedAt).getTime() > cutoff) continue;
    try {
      await del(blob.url);
      removed += 1;
    } catch {
      // ננסה שוב מחר.
    }
  }
  return removed;
}
