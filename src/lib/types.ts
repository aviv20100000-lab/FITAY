export type Role = "coach" | "trainee";
export type ExerciseKind = "strength" | "rehab";
export type ExerciseType = "reps" | "hold" | "amrap";

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
  /** 1 או 2 — כל רמה מחולקת לשני שלבים, מינימום 4 שבועות כל אחד. */
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
  /** גובה הטבעת. null = איתי לא קבע, המתאמן בוחר מה שנוח ועדיין מועיל. */
  ringHeight: string | null;
  bodyAngle: string | null;
  videoFile: string | null;
  notes: string;
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
