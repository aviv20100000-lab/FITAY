import { randomUUID } from "crypto";
import db from "@/lib/db";
import type { Advice, ProgressionMode } from "@/lib/types";

/**
 * ההתקדמות בטווח — המנגנון שמחליף את נוהל הצבירה.
 *
 * לכל תרגיל יש טווח עבודה: תחתית (target_min) ותקרה (reps או seconds).
 * מתאמן שעבר את התקרה בכל הסטים מקבל הנחיה להקשות את התרגיל — להנמיך
 * את הטבעות או להגדיל את השיפוע — ולהתחיל שוב מהתחתית. כל הקשיה כזאת
 * מעלה את דרגת הקושי (difficulty_step), וההשוואה לפעם הקודמת נעשית רק
 * בתוך אותה דרגה.
 *
 * הכל רץ בשרת בסיום אימון, בלי מגע של המאמן. המאמן קובע את הטווח פעם
 * אחת בתוכנית, ומשם הסולם מטפס לבד. תרגילי amrap נשארים מחוץ למנגנון:
 * זמן קצוב עם מקסימום חזרות הוא כבר מדידה בפני עצמה.
 */

/** כמה אימונים רצופים בלי שיפור לפני שמציעים לרדת לתחתית הטווח. */
const STALL_SESSIONS = 2;

/**
 * כמה אימונים רצופים בלי שינוי ידני אחד לפני שהמאמן מקבל על זה סימן.
 *
 * ארבעה הם יותר משבוע אימונים מלא. עם ברירת מחדל של יעד, מתאמן ישר וחזק
 * יכול לעבור אימון שלם בלי לגעת כי באמת עמד בכל היעדים, וזה קורה. שבוע
 * שלם, בכל סט של כל תרגיל, בלי אף כישלון ובלי אף פעם שיצא לו יותר, כבר
 * אינו סביר. זה מפריד בין שבוע מוצלח לדפוס.
 *
 * המספר ממתין לכוונון של איתי אחרי שיראה את זה עובד.
 */
export const UNTOUCHED_STREAK = 4;

/**
 * תחתית טווח העבודה. כשהמאמן לא קבע תחתית, ברירת המחדל היא 60 אחוז
 * מהתקרה — היעד שהיה בתוכנית נשאר התקרה, והתחתית נגזרת ממנו. מחושב
 * בזמן קריאה בכוונה: ערך שממולא במיגרציה היה הופך לשני מקורות אמת.
 */
export function rangeFloor(item: {
  targetMin: number | null;
  reps: number | null;
  seconds: number | null;
}): number | null {
  if (item.targetMin != null) return item.targetMin;
  const ceiling = item.reps ?? item.seconds;
  if (ceiling == null) return null;
  return Math.max(1, Math.round(ceiling * 0.6));
}

/**
 * אימון התאוששות: אחרי כל 12 אימונים שהושלמו באים שני אימונים מוקלים,
 * והם נספרים בתוך יעד האימונים של התוכנית. אותם תרגילים, חצי מהסטים.
 */
export function isRecoverySession(completed: number): boolean {
  return completed >= 12 && completed % 12 <= 1;
}

/** מספר הסטים באימון התאוששות. 4 הופכים ל-2, 3 הופכים ל-2. */
export function recoverySets(sets: number): number {
  return Math.max(1, Math.ceil(sets / 2));
}

type ItemMeta = {
  id: string;
  exerciseId: string;
  type: "reps" | "hold" | "amrap";
  /** ציר ההתקדמות. 'reps' ו-'time' לא מקשים מנח ולא מייצרים אירועי הישג. */
  progression: ProgressionMode;
  /** רמות מנח קיימות כשמוגדר סרטון לרמה 2 או 3. */
  hasStanceLevels: boolean;
  unilateral: boolean;
  sets: number;
  reps: number | null;
  seconds: number | null;
};

type LoggedRow = {
  workoutItemId: string;
  setNumber: number;
  reps: number | null;
  seconds: number | null;
  side: "weak" | "strong" | null;
  banded: boolean;
  /** אושר בלי שהמתאמן נגע במספר שהוצע לו. */
  untouched: boolean;
};

/**
 * מה קרה לתרגיל בסיום האימון, כדי שהמסך יוכל לומר את האמת.
 *
 * 'harder' ו-'drop-band' הן הקשיה שבוצעה מיד. המסך חייב לקבל את זה מהשרת:
 * קודם הוא חישב לבד מי עלה דרגה, כלומר הבטיח למתאמן מה שהשרת עוד לא החליט.
 */
export type ProgressionOutcome = "harder" | "drop-band";

export type ProgressState = {
  difficultyStep: number;
  advice: Advice;
  stallCount: number;
  ceilingStreak: number;
};

/** מצב ההתקדמות של כל תרגילי הריצה, ממופה לפי workout_item_id. */
export async function getProgressStates(
  assignmentId: string
): Promise<Map<string, ProgressState>> {
  const res = await db.execute({
    sql: `SELECT workout_item_id, difficulty_step, advice, stall_count, ceiling_streak
            FROM item_progress WHERE assignment_id = ?`,
    args: [assignmentId],
  });
  return new Map(
    res.rows.map((r) => [
      String(r.workout_item_id),
      {
        difficultyStep: Number(r.difficulty_step),
        advice: String(r.advice) as Advice,
        stallCount: Number(r.stall_count),
        ceilingStreak: Number(r.ceiling_streak),
      },
    ])
  );
}

/**
 * הערכת ההתקדמות אחרי אימון שנשמר. מחזירה את פקודות העדכון של
 * item_progress, כדי שהקורא יריץ אותן באותו batch עם שאר הכתיבות.
 *
 * הכללים, לפי הסדר:
 *   עבר את התקרה בכל הסטים בלי גומייה  — דרגה למעלה, הנחיה להקשות.
 *   עבר את התקרה בכל הסטים עם גומייה  — דרגה למעלה, הנחיה לוותר עליה.
 *   שני אימונים רצופים בלי שיפור       — הנחיה לרדת לתחתית ולטפס מחדש.
 *   אימון רע בודד                       — לא קורה כלום. יום כזה יש לכולם.
 *
 * שתי השורות הראשונות חלות על תרגילי מנח בלבד. תרגיל שמתקדם בחזרות או
 * בזמן נבדק רק לתקיעות, בלי תקרה, בלי עליית דרגה ובלי אירוע הישג.
 *
 * בתרגיל חד־צדדי נמדד הצד החלש בלבד — הוא שקובע אם יש התקדמות אמיתית.
 */
export async function evaluateProgression(options: {
  assignmentId: string;
  /** תחילת הריצה. סטים מריצה קודמת של אותה תוכנית לא נכנסים להשוואה. */
  assignedAt: string;
  traineeId: string;
  workoutId: string;
  loggedAt: string;
  items: ItemMeta[];
  rows: LoggedRow[];
  states: Map<string, ProgressState>;
}) {
  const {
    assignmentId,
    assignedAt,
    traineeId,
    workoutId,
    loggedAt,
    items,
    rows,
    states,
  } = options;

  // Defense in depth: the API returns a Hebrew 400 before reaching here, but
  // every future caller of the progression entry point must obey the same
  // program boundaries. Weak/strong rows are the two legal halves of one
  // unilateral set, so uniqueness includes the side.
  const configuredItems = new Map(items.map((item) => [item.id, item]));
  const submitted = new Set<string>();
  for (const row of rows) {
    const item = configuredItems.get(row.workoutItemId);
    const key = `${row.workoutItemId}:${row.setNumber}:${row.side ?? "none"}`;
    if (
      item == null ||
      !Number.isInteger(row.setNumber) ||
      row.setNumber < 1 ||
      row.setNumber > item.sets ||
      (item.unilateral ? row.side == null : row.side != null) ||
      submitted.has(key)
    ) {
      throw new Error("Invalid submitted sets");
    }
    submitted.add(key);
  }

  // הסך של כל אימון קודם בריצה הזאת, לפי תרגיל ודרגה. נדרש רק לבדיקת
  // התקיעות, ולכן אימוני התאוששות והצד החזק לא נספרים.
  const history = await db.execute({
    sql: `SELECT workout_item_id, difficulty_step, logged_at,
                 SUM(COALESCE(reps, seconds)) AS total
            FROM set_logs
           WHERE trainee_id = ? AND workout_id = ? AND recovery = 0
             AND (side IS NULL OR side = 'weak')
             AND logged_at >= ? AND logged_at < ?
           GROUP BY workout_item_id, logged_at, difficulty_step
          HAVING SUM(CASE WHEN untouched = 0 THEN 1 ELSE 0 END) > 0
           ORDER BY logged_at DESC`,
    args: [traineeId, workoutId, assignedAt, loggedAt],
  });

  const previousTotal = (itemId: string, step: number): number | null => {
    for (const row of history.rows) {
      if (String(row.workout_item_id) !== itemId) continue;
      if (Number(row.difficulty_step) !== step) continue;
      return Number(row.total);
    }
    return null;
  };

  const statements: { sql: string; args: (string | number)[] }[] = [];
  const events: {
    item: ItemMeta;
    kind: "harder" | "drop-band";
    fromStep: number;
  }[] = [];
  const outcomes: Record<string, ProgressionOutcome> = {};

  for (const item of items) {
    if (item.type === "amrap") continue;
    const ceiling = item.type === "hold" ? item.seconds : item.reps;
    if (ceiling == null) continue;

    const mine = rows.filter(
      (row) => row.workoutItemId === item.id && row.side !== "strong"
    );
    if (mine.length === 0) continue;

    const state = states.get(item.id) ?? {
      difficultyStep: 0,
      advice: "" as Advice,
      stallCount: 0,
      ceilingStreak: 0,
    };

    const values = mine.map((row) =>
      item.type === "hold" ? row.seconds ?? 0 : row.reps ?? 0
    );
    const allSetsDone =
      new Set(mine.map((row) => row.setNumber)).size >= item.sets;
    const allAtCeiling = allSetsDone && values.every((v) => v >= ceiling);
    const allBanded = mine.every((row) => row.banded);
    const anyBanded = mine.some((row) => row.banded);

    /*
     * השער של רמות המנח: מספיק סט אחד כלשהו שמגיע לתקרה. אביב סגר את
     * זה במפורש — בדרך כלל זה יהיה הסט הראשון כשהוא טרי, אבל 10 בסט
     * השני או השלישי שווים בדיוק אותו דבר. סט עם גומייה לא נחשב:
     * עשר בעזרתה אינן אותו הישג.
     */
    const rowValue = (row: (typeof mine)[number]) =>
      item.type === "hold" ? row.seconds ?? 0 : row.reps ?? 0;
    const ceilingRows = mine.filter((row) => rowValue(row) >= ceiling);
    const anyCleanCeiling = ceilingRows.some((row) => !row.banded);
    const onlyBandedCeiling = ceilingRows.length > 0 && !anyCleanCeiling;

    /*
     * הראיה שמפרידה בין רישום אמיתי לחותמת גומי.
     *
     * מספיקה עריכה אחת באותו תרגיל באותו אימון. דרישה של רוב הסטים הייתה
     * מענישה את המקרה הישר והנפוץ: מתאמן שפשוט עמד בכל היעדים מאשר בלי
     * לגעת, ובצדק, והתור של איתי היה מתמלא במי שאין בו שום דבר חשוד.
     */
    const anyEdited = mine.some((row) => !row.untouched);

    /*
     * מסלול ההקשיה שייך לתרגילי מנח בלבד.
     *
     * בתרגיל שמתקדם בחזרות או בזמן התוספת עצמה היא ההתקדמות, ואין מנח
     * להקשות: המספר בתוכנית הוא נקודת פתיחה ולא תקרה. לכן אין כאן עליית
     * דרגה ואין אירוע הישג — הישג כזה היה מבטיח למתאמן הקשיה שלא קרתה.
     * בדיקת התקיעות משותפת לשלושת הצירים, ועובדת בדיוק כמו קודם: דרגת
     * הקושי של תרגיל כזה פשוט נשארת אפס לתמיד.
     */
    const hardens = item.progression === "stance";
    const leveledStance = hardens && item.hasStanceLevels;
    const atFinalStanceLevel = leveledStance && state.difficultyStep >= 2;

    let next: ProgressState;
    if (atFinalStanceLevel && anyCleanCeiling) {
      // רמה 3 היא סוף הסולם. הישג חוזר בתקרה אינו יוצר אירוע או הנחיה.
      next = { ...state, advice: "", stallCount: 0, ceilingStreak: 0 };
    } else if (leveledStance && onlyBandedCeiling) {
      /*
       * תקרה בעזרת גומייה לא מקדמת את סולם המנחים: עשר עם גומייה אינן
       * אותו הישג כמו עשר בלעדיה. הרמה נשארת, הרצף מתאפס, וההנחיה
       * הבאה היא להיפרד מהגומייה — בלי אירוע הישג, כדי שההנחיה תוכל
       * לחזור בלי לזייף "עלית דרגה".
       */
      next = {
        ...state,
        advice: "drop-band",
        stallCount: 0,
        ceilingStreak: 0,
      };
    } else if (leveledStance && anyCleanCeiling) {
      const ceilingStreak = state.ceilingStreak + 1;
      if (ceilingStreak >= 2) {
        next = {
          difficultyStep: state.difficultyStep + 1,
          advice: "harder",
          stallCount: 0,
          ceilingStreak: 0,
        };
        events.push({ item, kind: "harder", fromStep: state.difficultyStep });
        outcomes[item.id] = "harder";
      } else {
        next = { ...state, advice: "", stallCount: 0, ceilingStreak };
      }
    } else if (!leveledStance && hardens && allAtCeiling && (!anyBanded || allBanded)) {
      // התקרה הושגה בכל הסטים: הדרגה הבאה היא אותו תרגיל, בלי גומייה אם הייתה.
      const kind = anyBanded ? "drop-band" : "harder";
      next = {
        difficultyStep: state.difficultyStep + 1,
        advice: kind,
        stallCount: 0,
        ceilingStreak: 0,
      };
      events.push({ item, kind, fromStep: state.difficultyStep });
      outcomes[item.id] = kind;
    } else if (!leveledStance && hardens && allAtCeiling) {
      // חלק מהסטים עם גומייה וחלק בלי — אין הישג אחיד להשוות אליו.
      next = { ...state, advice: "" };
    } else if (!anyEdited) {
      /*
       * אימון שכולו חותמות גומי אינו עדות לתקיעות. קודם מתאמן כזה קיבל
       * סך זהה בכל אימון, נספר תקוע תמיד, וקיבל עצה לרדת לתחתית הטווח
       * בזמן שהוא כבר ישב עליה. מונה התקיעות נשאר כמו שהיה, כדי שרצף
       * תקיעה אמיתי לא יימחק בגלל אימון שאין בו מידע.
       */
      next = { ...state, advice: "", ceilingStreak: leveledStance ? 0 : state.ceilingStreak };
    } else {
      const total = values.reduce((sum, v) => sum + v, 0);
      const previous = previousTotal(item.id, state.difficultyStep);
      const stalled = previous != null && total <= previous;
      const stallCount = stalled ? state.stallCount + 1 : 0;
      next =
        stallCount >= STALL_SESSIONS
          ? { difficultyStep: state.difficultyStep, advice: "easier", stallCount: 0, ceilingStreak: leveledStance ? 0 : state.ceilingStreak }
          : { difficultyStep: state.difficultyStep, advice: "", stallCount, ceilingStreak: leveledStance ? 0 : state.ceilingStreak };
    }

    statements.push({
      sql: `INSERT INTO item_progress
              (assignment_id, workout_item_id, difficulty_step, advice, stall_count, ceiling_streak, updated_at)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(assignment_id, workout_item_id) DO UPDATE SET
              difficulty_step = excluded.difficulty_step,
              advice = excluded.advice,
              stall_count = excluded.stall_count,
              ceiling_streak = excluded.ceiling_streak,
              updated_at = excluded.updated_at`,
      args: [
        assignmentId,
        item.id,
        next.difficultyStep,
        next.advice,
        next.stallCount,
        next.ceilingStreak,
        loggedAt,
      ],
    });
  }

  /*
   * כל הקשיה נרשמת כאירוע עם תאריך, כדי שיהיה ממה לבנות את אוסף ההישגים
   * של המתאמן.
   */
  for (const event of events) {
    statements.push({
      sql: `INSERT INTO progression_events
              (id, assignment_id, trainee_id, workout_item_id, exercise_id,
               kind, from_step, to_step, status, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [
        randomUUID(),
        assignmentId,
        traineeId,
        event.item.id,
        event.item.exerciseId,
        event.kind,
        event.fromStep,
        event.fromStep + 1,
        "earned",
        loggedAt,
      ],
    });
  }

  return { statements, outcomes };
}
