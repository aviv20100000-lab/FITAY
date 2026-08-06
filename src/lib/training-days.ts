/**
 * ימי אימון שהמתאמן מסמן לעצמו.
 *
 * זו תזכורת אישית ולא לוח זמנים של התוכנית. במסך הבית יש הערה מפורשת
 * שהאימון הבא נבחר לפי מי שבוצע הכי מעט פעמים, "ככה הרוטציה מתקדמת לבד
 * בלי לנהל לוח שנה". לכן היום המסומן אומר *מתי* בלבד, ואף פעם לא נקשר
 * אליו אימון מסוים: שיוך כזה היה יוצר תשובה שנייה לשאלה מה עושים היום,
 * והיא הייתה מתחרה בתג "הבא בתור".
 *
 * הסימון לא חוסם כלום, לא פותח כלום, ולא משפיע על מה שנפתח למתאמן.
 */
import db from "./db";

/** כמה ימים אחורה וקדימה נשלפים, כדי שהמסך יוכל להרכיב שבוע שלם לבד. */
const WINDOW_DAYS = 10;

export type TrainingDayWindow = {
  /** ימים שהמתאמן סימן, בפורמט YYYY-MM-DD לפי השעון שלו. */
  planned: string[];
  /**
   * חותמות הזמן של אימונים שבוצעו.
   *
   * מוחזר כ-ISO גולמי ולא כתאריך, בכוונה. ההמרה לתאריך חייבת לקרות בצד
   * הלקוח: השרת יושב באזור זמן אחר, והמרה אצלו הייתה מסמנת את היום הלא
   * נכון למתאמן שמתאמן בערב.
   */
  completedAt: string[];
};

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * חלון של כשלושה שבועות סביב היום, לשני סוגי הסימון.
 */
export async function getTrainingDayWindow(
  traineeId: string
): Promise<TrainingDayWindow> {
  const [planned, completions] = await db.batch(
    [
      {
        sql: `SELECT day FROM training_days
               WHERE trainee_id = ? AND day >= ? AND day <= ?
               ORDER BY day`,
        args: [
          traineeId,
          isoDaysAgo(WINDOW_DAYS).slice(0, 10),
          isoDaysAgo(-WINDOW_DAYS).slice(0, 10),
        ],
      },
      {
        sql: `SELECT completed_at FROM completions
               WHERE trainee_id = ? AND completed_at >= ?
               ORDER BY completed_at`,
        args: [traineeId, isoDaysAgo(WINDOW_DAYS)],
      },
    ],
    "read"
  );

  return {
    planned: planned.rows.map((r) => String(r.day)),
    completedAt: completions.rows.map((r) => String(r.completed_at)),
  };
}

export type CoachTrainingDays = {
  planned: Map<string, string[]>;
  completedAt: Map<string, string[]>;
};

/**
 * אותו חלון, לכל המתאמנים בבת אחת.
 *
 * שתי שאילתות ולא אחת לכל מתאמן, כי זה רץ בכל טעינה של מסך הבית של המאמן.
 */
export async function getCoachTrainingDays(): Promise<CoachTrainingDays> {
  const [planned, completions] = await db.batch(
    [
      {
        sql: `SELECT trainee_id, day FROM training_days
               WHERE day >= ? AND day <= ? ORDER BY day`,
        args: [
          isoDaysAgo(WINDOW_DAYS).slice(0, 10),
          isoDaysAgo(-WINDOW_DAYS).slice(0, 10),
        ],
      },
      {
        sql: `SELECT trainee_id, completed_at FROM completions
               WHERE completed_at >= ? ORDER BY completed_at`,
        args: [isoDaysAgo(WINDOW_DAYS)],
      },
    ],
    "read"
  );

  const group = (
    rows: Awaited<ReturnType<typeof db.execute>>["rows"],
    column: string
  ) => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const key = String(row.trainee_id);
      const list = map.get(key) ?? [];
      list.push(String(row[column]));
      map.set(key, list);
    }
    return map;
  };

  return {
    planned: group(planned.rows, "day"),
    completedAt: group(completions.rows, "completed_at"),
  };
}

/** YYYY-MM-DD בלבד. כל דבר אחר הוא קלט שלא בא מהמסך שלנו. */
export function isValidDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

/**
 * חלון הסימון המותר.
 *
 * בלי גבול אפשר למלא את הטבלה בשנים קדימה בלחיצה אחת בלולאה. חודש לכל
 * כיוון מכסה בנוחות שבוע שמוצג במסך וגם דפדוף סביר.
 */
export function isDayInRange(day: string) {
  const target = new Date(`${day}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.abs(target - now) <= 40 * 86_400_000;
}

export async function setTrainingDay(
  traineeId: string,
  day: string,
  planned: boolean
) {
  if (planned) {
    await db.execute({
      // לחיצה כפולה על אותו יום לא אמורה ליצור שתי שורות ולא להיכשל.
      sql: `INSERT INTO training_days (trainee_id, day) VALUES (?, ?)
            ON CONFLICT(trainee_id, day) DO NOTHING`,
      args: [traineeId, day],
    });
  } else {
    await db.execute({
      sql: "DELETE FROM training_days WHERE trainee_id = ? AND day = ?",
      args: [traineeId, day],
    });
  }
}
