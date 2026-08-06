/**
 * בדיקת הפתיחה: ארבעת התרגילים הראשונים והסרטונים שצורפו להם.
 *
 * הקובץ הזה קיים כדי שיהיה מקור אחד לשאלה "אילו ארבעה תרגילים". שלושה
 * מקומות שואלים אותה — מסך המתאמן, רישום הסרטון, ושליחת הדיווח — ושלוש
 * גרסאות של אותו כלל היו נגמרות במסך שמראה תרגיל אחד ובשרת שדורש אחר.
 */
import { del, list } from "@vercel/blob";
import db from "./db";

/** כמה תרגילים צריך לצלם. זה גם הסף הקיים לפתיחת הדיווח. */
export const REQUIRED_INITIAL_EXERCISES = 4;

/**
 * הקידומת של כל קליפ בדיקת פתיחה ב-Blob.
 *
 * המסך מעלה אל `initial-check/<assignmentId>/...`, והשרת דורש את הקידומת
 * הזאת ברישום. ככה כתובת שהתקבלה מהדפדפן לא יכולה להצביע על קובץ אחר
 * באותו אחסון, וזה חשוב כי בסוף התהליך אנחנו מוחקים את מה שרשום.
 */
export const INITIAL_CHECK_BLOB_PREFIX = "initial-check";

export type InitialCheckExercise = {
  exerciseId: string;
  name: string;
  videoUrl: string | null;
};

export type InitialCheckState = {
  assignmentId: string;
  status: string;
  note: string;
  /**
   * ארבעת התרגילים הראשונים בריצה, לפי סדר הרישום. קצר מארבעה כל עוד
   * המתאמן לא סיים את האימון הראשון, כי סטים נכתבים למסד רק בסיום אימון.
   */
  exercises: InitialCheckExercise[];
  /** ארבעה תרגילים, ולכל אחד סרטון. רק אז אפשר לשלוח. */
  ready: boolean;
};

/**
 * ארבעת התרגילים השונים הראשונים בריצה, לפי מתי נרשם הסט הראשון בכל אחד.
 *
 * החלון הוא assigned_at ואילך, בדיוק כמו בשאר השאילתות על ריצה: שיוך חוזר
 * פותח ריצה חדשה, וסטים של ריצה קודמת לא שייכים לכאן.
 *
 * הרשימה יציבה. היא נגזרת מסטים שכבר נרשמו, ולכן תרגיל חמישי שייכנס מחר
 * לא מזיז אותה ולא מבטל סרטון שכבר צולם.
 */
const FIRST_EXERCISES_SQL = `
  SELECT sl.exercise_id, e.name, MIN(sl.logged_at) AS first_log
    FROM set_logs sl
    JOIN workouts w ON w.id = sl.workout_id
    JOIN exercises e ON e.id = sl.exercise_id
   WHERE sl.trainee_id = ? AND w.program_id = ? AND sl.logged_at >= ?
   GROUP BY sl.exercise_id, e.name
   ORDER BY first_log, sl.exercise_id
   LIMIT ${REQUIRED_INITIAL_EXERCISES}
`;

/**
 * המצב המלא של בדיקת הפתיחה לשיוך הפעיל, או null אם אין שיוך פעיל כזה.
 */
export async function getInitialCheckState(
  traineeId: string,
  programId: string
): Promise<InitialCheckState | null> {
  const assignment = await db.execute({
    sql: `SELECT id, assigned_at, initial_check_status, initial_check_note
            FROM assignments
           WHERE trainee_id = ? AND program_id = ? AND status = 'active'`,
    args: [traineeId, programId],
  });
  const row = assignment.rows[0];
  if (!row) return null;

  const assignmentId = String(row.id);
  const [firstExercises, videos] = await db.batch(
    [
      {
        sql: FIRST_EXERCISES_SQL,
        args: [traineeId, programId, String(row.assigned_at)],
      },
      {
        sql: "SELECT exercise_id, url FROM initial_check_videos WHERE assignment_id = ?",
        args: [assignmentId],
      },
    ],
    "read"
  );

  const byExercise = new Map(
    videos.rows.map((v) => [String(v.exercise_id), String(v.url)])
  );
  const exercises = firstExercises.rows.map((e) => ({
    exerciseId: String(e.exercise_id),
    name: String(e.name),
    videoUrl: byExercise.get(String(e.exercise_id)) ?? null,
  }));

  return {
    assignmentId,
    status: String(row.initial_check_status ?? "not_ready"),
    note: String(row.initial_check_note ?? ""),
    exercises,
    ready:
      exercises.length === REQUIRED_INITIAL_EXERCISES &&
      exercises.every((e) => e.videoUrl !== null),
  };
}

/**
 * מוחק את כל סרטוני בדיקת הפתיחה של שיוך, גם מהאחסון וגם מהקטלוג.
 *
 * הסדר חשוב: קודם מוחקים את הקובץ ורק אז את השורה. הפוך מזה, הכתובת אבדה
 * ואין יותר דרך להגיע ל-blob, והוא נשאר תופס מקום לנצח. שורה שהמחיקה שלה
 * נכשלה נשארת במקומה ותיאסף בהרצה הבאה של הניקוי.
 *
 * מחזיר כמה קבצים נמחקו בפועל.
 */
export async function discardInitialCheckVideos(assignmentId: string) {
  const rows = await db.execute({
    sql: "SELECT id, url FROM initial_check_videos WHERE assignment_id = ?",
    args: [assignmentId],
  });

  let removed = 0;
  for (const row of rows.rows) {
    try {
      await del(String(row.url));
    } catch {
      // הקובץ אולי כבר לא קיים, אבל אולי האחסון פשוט לא זמין עכשיו.
      // בשני המקרים משאירים את השורה ומנסים שוב בהרצה הבאה.
      continue;
    }
    await db.execute({
      sql: "DELETE FROM initial_check_videos WHERE id = ?",
      args: [String(row.id)],
    });
    removed += 1;
  }
  return removed;
}

/** קליפ שהתחיל להיות מועלה ולא הגיע לדיווח נחשב נטוש אחרי שבועיים. */
const ABANDONED_AFTER_DAYS = 14;

/**
 * איסוף קליפים שאיש כבר לא יגיע אליהם.
 *
 * שלושה מקורות: אישור שהמחיקה שלו נכשלה, שיוך שכבר לא פעיל, ומתאמן
 * שהעלה שניים מארבעה ונטש. בלי הסריקה הזאת האחסון צובר קבצים שאף מסך לא
 * מציג ואף אחד לא סופר.
 */
export async function sweepInitialCheckVideos() {
  const orphans = await db.execute({
    sql: `SELECT DISTINCT v.assignment_id
            FROM initial_check_videos v
            LEFT JOIN assignments a ON a.id = v.assignment_id
           WHERE a.id IS NULL
              OR a.status <> 'active'
              OR a.initial_check_status = 'approved'
              OR (a.initial_check_status = 'not_ready' AND v.uploaded_at < ?)`,
    args: [
      new Date(
        Date.now() - ABANDONED_AFTER_DAYS * 86_400_000
      ).toISOString(),
    ],
  });

  let removed = 0;
  for (const row of orphans.rows) {
    removed += await discardInitialCheckVideos(String(row.assignment_id));
  }

  return {
    assignments: orphans.rows.length,
    removed,
    unregistered: await sweepUnregisteredClips(),
  };
}

/**
 * קליפ שהועלה ל-Blob אבל אף פעם לא נרשם למסד.
 *
 * זה קורה כשההעלאה הצליחה והרישום נפל, או כשהמתאמן סגר את האפליקציה בין
 * שני השלבים. לקובץ כזה אין שורה, ולכן שום מסך לא מציג אותו ושום מחיקה
 * לא מגיעה אליו. בלי הסריקה הזאת ההבטחה "הסרטונים נמחקים" פשוט לא נכונה
 * במקרה הזה.
 *
 * חלון החסד הוא יום. העלאה שרצה ברגע זה ועדיין לא נרשמה לא אמורה להימחק
 * מתחת לידיים של המתאמן.
 */
const UNREGISTERED_GRACE_MS = 24 * 60 * 60 * 1000;

async function sweepUnregisteredClips() {
  const { blobs } = await list({ prefix: `${INITIAL_CHECK_BLOB_PREFIX}/` });
  if (blobs.length === 0) return 0;

  const known = await db.execute("SELECT url FROM initial_check_videos");
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

/**
 * האם המתאמן רשאי להעלות או להחליף סרטון עכשיו.
 *
 * רק לפני השליחה או אחרי החזרה. ברגע שהדיווח ממתין להחלטה, החלפת קליפ
 * מתחת לידיים של איתי היא בדיוק מה שלא צריך לקרות.
 */
export function canUploadInitialCheck(status: string) {
  return status === "not_ready" || status === "returned";
}
