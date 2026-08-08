export type Role = "coach" | "trainee";
export type ExerciseKind = "strength" | "rehab";
export type ExerciseType = "reps" | "hold" | "amrap";
/**
 * ציר ההתקדמות של התרגיל, נפרד מציר המדידה.
 *
 * 'stance' — מטפסים בטווח עד התקרה, ואז מקשים את המנח ומתחילים מהתחתית.
 * 'reps'   — התוספת עצמה היא ההתקדמות: חזרה נוספת, בלי תקרה ובלי הקשיה.
 * 'time'   — אותו דבר בשניות.
 */
export type ProgressionMode = "stance" | "reps" | "time";

export interface User {
  id: string;
  name: string;
  phone: string;
  role: Role;
  active: boolean;
  /** מצב שיקום — מתג לכל מתאמן. פותח דיווח כאב ותרגילי שיקום. */
  rehabMode: boolean;
  notes: string;
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  kind: ExerciseKind;
  type: ExerciseType;
  /** איך התרגיל מתקדם. חסר = 'stance', כמו ברירת המחדל של העמודה במסד. */
  progression?: ProgressionMode;
  tempo: string;
  muscles: string;
  description: string;
  technique: string[];
  tips: string[];
  videoFile: string | null;
  /** תרגיל חד־צדדי — לפי החוברת מתחילים תמיד מהצד החלש. */
  unilateral: boolean;
}

export interface Program {
  id: string;
  title: string;
  description: string;
  /** 1..3 — שלוש הרמות מהחוברת. כל רמה משתמשת בתרגילים אחרים. */
  level: number;
  weeks: number;
  isTemplate: boolean;
  templateId: string | null;
  createdAt: string;
}

export interface Workout {
  id: string;
  programId: string;
  title: string;
  /** 1 או 2 — כל רמה מחולקת לשני שלבים, חצי מ-24 האימונים כל אחד. */
  phase: number;
  position: number;
}

export interface WorkoutItem {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: number;
  sets: number;
  reps: number | null;
  seconds: number | null;
  rest: number;
  /** גובה הטבעת. null = לא נקבע ב-FITAY, והמתאמן בוחר מה שנוח ועדיין מועיל. */
  ringHeight: string | null;
  bodyAngle: string | null;
  videoFile: string | null;
  notes: string;
}

/** צד בתרגיל חד־צדדי. לפי החוברת מתחילים תמיד מהחלש. */
export type Side = "weak" | "strong";

/**
 * ההנחיה שהמנגנון נותן לתרגיל לקראת האימון הבא.
 * 'harder' — עבר את התקרה בכל הסטים. להקשות ולהתחיל מתחתית הטווח.
 * 'drop-band' — עבר את התקרה עם גומייה. לנסות בלי.
 * 'easier' — שני אימונים בלי התקדמות. לרדת לתחתית הטווח ולטפס מחדש.
 */
export type Advice = "" | "harder" | "drop-band" | "easier";

/** סט בודד שבוצע בפועל. הבסיס להשוואה לפעם הקודמת. */
export interface SetLog {
  id: string;
  traineeId: string;
  workoutId: string;
  workoutItemId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  seconds: number | null;
  side: Side | null;
  /**
   * המתאמן אישר את המספר שהאפליקציה הציעה בלי לשנות אותו.
   *
   * נספר רק שינוי ערך בפועל. פתיחת מקלדת או מיקוד בשדה אינם נגיעה, אחרת
   * הדגל היה נדלק אצל כולם ומפסיק להבדיל בין שום דבר.
   */
  untouched: boolean;
  loggedAt: string;
}

/**
 * מה המתאמן עשה בתרגיל הזה בפעם הקודמת — מוצג לו במסך האימון.
 *
 * banded נשמר לכל סט בנפרד, כי אפשר להתחיל סט עם גומייה ולסיים בלעדיה.
 * anyBanded מסכם אם הפעם הקודמת נעזרה בגומייה בכלל, וזה מה שמוצג
 * ליד המספר. בלי זה המתאמן היה משווה את עצמו להישג אחר לגמרי.
 */
/**
 * שלוש הגומיות של איתי, מהקלה לקשה. הרמה נשמרת עם כל סט, כי עשר חזרות
 * עם גומייה קלה ועשר עם קשה הן שני הישגים שונים.
 */
export type BandLevel = "easy" | "medium" | "hard";

export interface LastPerformance {
  loggedAt: string;
  sets: {
    reps: number | null;
    seconds: number | null;
    side: Side | null;
    banded: boolean;
    bandLevel: BandLevel | null;
  }[];
  total: number;
  anyBanded: boolean;
}

export interface Completion {
  id: string;
  traineeId: string;
  programId: string;
  workoutId: string;
  completedAt: string;
  durationSec: number | null;
  mood: string | null;
  /** 0..10 — נרשם רק כשהמתאמן במצב שיקום. */
  painLevel: number | null;
  notes: string;
}
