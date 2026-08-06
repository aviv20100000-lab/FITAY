import db from "@/lib/db";
import type { Advice } from "@/lib/types";

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
  type: "reps" | "hold" | "amrap";
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
};

export type ProgressState = {
  difficultyStep: number;
  advice: Advice;
  stallCount: number;
};

/** מצב ההתקדמות של כל תרגילי הריצה, ממופה לפי workout_item_id. */
export async function getProgressStates(
  assignmentId: string
): Promise<Map<string, ProgressState>> {
  const res = await db.execute({
    sql: `SELECT workout_item_id, difficulty_step, advice, stall_count
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
    };

    const values = mine.map((row) =>
      item.type === "hold" ? row.seconds ?? 0 : row.reps ?? 0
    );
    const allSetsDone =
      new Set(mine.map((row) => row.setNumber)).size >= item.sets;
    const allAtCeiling = allSetsDone && values.every((v) => v >= ceiling);
    const allBanded = mine.every((row) => row.banded);
    const anyBanded = mine.some((row) => row.banded);

    let next: ProgressState;
    if (allAtCeiling && !anyBanded) {
      next = { difficultyStep: state.difficultyStep + 1, advice: "harder", stallCount: 0 };
    } else if (allAtCeiling && allBanded) {
      // התקרה הושגה, אבל בעזרת גומייה. הדרגה הבאה היא אותו תרגיל בלעדיה.
      next = { difficultyStep: state.difficultyStep + 1, advice: "drop-band", stallCount: 0 };
    } else if (allAtCeiling) {
      // חלק מהסטים עם גומייה וחלק בלי — אין הישג אחיד להשוות אליו.
      next = { ...state, advice: "" };
    } else {
      const total = values.reduce((sum, v) => sum + v, 0);
      const previous = previousTotal(item.id, state.difficultyStep);
      const stalled = previous != null && total <= previous;
      const stallCount = stalled ? state.stallCount + 1 : 0;
      next =
        stallCount >= STALL_SESSIONS
          ? { difficultyStep: state.difficultyStep, advice: "easier", stallCount: 0 }
          : { difficultyStep: state.difficultyStep, advice: "", stallCount };
    }

    statements.push({
      sql: `INSERT INTO item_progress
              (assignment_id, workout_item_id, difficulty_step, advice, stall_count, updated_at)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(assignment_id, workout_item_id) DO UPDATE SET
              difficulty_step = excluded.difficulty_step,
              advice = excluded.advice,
              stall_count = excluded.stall_count,
              updated_at = excluded.updated_at`,
      args: [
        assignmentId,
        item.id,
        next.difficultyStep,
        next.advice,
        next.stallCount,
        loggedAt,
      ],
    });
  }

  return statements;
}
