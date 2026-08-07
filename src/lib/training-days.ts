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

/**
 * כמה ימים אחורה וקדימה נשלפים.
 *
 * החלון רחב כדי שהלוח החודשי יוכל לדפדף בין חודשים בלי לפנות לשרת בכל
 * החלפה. אלה מחרוזות קצרות, וגם ארבעה חודשים מהם הם כמה קילובייטים.
 */
const WINDOW_BACK_DAYS = 40;
const WINDOW_FORWARD_DAYS = 130;

/** לשורה בכרטיס המתאמן אצל המאמן מספיק השבוע, ואין טעם למשוך יותר. */
const COACH_WINDOW_DAYS = 10;

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
 * החלון של המתאמן: מספיק רחב כדי שהלוח החודשי ידפדף בלי סבב רשת נוסף.
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
          isoDaysAgo(WINDOW_BACK_DAYS).slice(0, 10),
          isoDaysAgo(-WINDOW_FORWARD_DAYS).slice(0, 10),
        ],
      },
      {
        sql: `SELECT completed_at FROM completions
               WHERE trainee_id = ? AND completed_at >= ?
               ORDER BY completed_at`,
        args: [traineeId, isoDaysAgo(WINDOW_BACK_DAYS)],
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
          isoDaysAgo(COACH_WINDOW_DAYS).slice(0, 10),
          isoDaysAgo(-COACH_WINDOW_DAYS).slice(0, 10),
        ],
      },
      {
        sql: `SELECT trainee_id, completed_at FROM completions
               WHERE completed_at >= ? ORDER BY completed_at`,
        args: [isoDaysAgo(COACH_WINDOW_DAYS)],
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
 * בלי גבול אפשר למלא את הטבלה בשנים קדימה בלחיצה אחת בלולאה. הגבול תואם
 * את החלון שנשלף למסך: אין טעם לאפשר שמירה של תאריך שהלוח לא מציג.
 */
export function isDayInRange(day: string) {
  const target = new Date(`${day}T00:00:00Z`).getTime();
  const now = Date.now();
  return (
    target >= now - WINDOW_BACK_DAYS * 86_400_000 &&
    target <= now + WINDOW_FORWARD_DAYS * 86_400_000
  );
}

/** YYYY-MM בלבד. */
export function isValidMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/**
 * שמירת חודש שלם: מה שנשלח הוא הרשימה המלאה של אותו חודש.
 *
 * החלפה ולא הוספה, בכוונה. הלוח החודשי מחזיק את הסימונים אצלו עד שלוחצים
 * שמור, ולכן השמירה חייבת לבטא גם הסרה. אם היינו רק מוסיפים, יום שהמתאמן
 * ביטל היה נשאר במסד ומופיע לו שוב ברענון.
 *
 * רק חודשים שהמתאמן באמת נגע בהם נשלחים, כדי שדפדוף בלבד לא ימחק כלום.
 */
export async function replaceTrainingMonths(
  traineeId: string,
  months: string[],
  days: string[]
) {
  const statements: { sql: string; args: (string | number)[] }[] = [];

  for (const month of months) {
    statements.push({
      sql: `DELETE FROM training_days
             WHERE trainee_id = ? AND day >= ? AND day <= ?`,
      args: [traineeId, `${month}-01`, `${month}-31`],
    });
  }
  for (const day of days) {
    // רק ימים ששייכים לחודשים שנשלחו. אחרת אפשר לכתוב לכל תאריך תוך כדי
    // שמירה של חודש אחר.
    if (!months.includes(day.slice(0, 7))) continue;
    statements.push({
      sql: `INSERT INTO training_days (trainee_id, day) VALUES (?, ?)
            ON CONFLICT(trainee_id, day) DO NOTHING`,
      args: [traineeId, day],
    });
  }

  if (statements.length) await db.batch(statements, "write");
}
