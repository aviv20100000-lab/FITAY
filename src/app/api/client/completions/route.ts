import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToCoach } from "@/lib/push";
import {
  evaluateProgression,
  getProgressStates,
  isRecoverySession,
  type ProgressionOutcome,
} from "@/lib/progression";
import type { ProgressionMode } from "@/lib/types";

/** מעל זה מאמן FITAY מקבל התראה נפרדת ומיד, ולא רק שורה בכרטיס. */
const PAIN_ALERT_FROM = 5;

/** שלושת צירי ההתקדמות. ערך לא מוכר במסד נקרא כמנח. */
const PROGRESSIONS = new Set(["stance", "reps", "time"]);

/** שלוש הגומיות של איתי. כל ערך אחר נדחה ונרשם כגומייה בלי רמה. */
const BAND_LEVELS = new Set(["easy", "medium", "hard"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function originalSuccess(traineeId: string, idempotencyKey: string) {
  const completion = await db.execute({
    sql: `SELECT id, completed_at FROM completions
           WHERE trainee_id = ? AND idempotency_key = ?`,
    args: [traineeId, idempotencyKey],
  });
  if (!completion.rows.length) return null;

  const events = await db.execute({
    sql: `SELECT workout_item_id, kind FROM progression_events
           WHERE trainee_id = ? AND created_at = ? AND status = 'earned'`,
    args: [traineeId, String(completion.rows[0].completed_at)],
  });
  const progression = Object.fromEntries(
    events.rows.map((row) => [String(row.workout_item_id), String(row.kind)])
  );
  return {
    response: { ok: true, progression },
  };
}

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

/** סיום אימון. דיווח כאב אופציונלי וזמין לכל מתאמן. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const programId = String(body.programId ?? "");
  const workoutId = String(body.workoutId ?? "");
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (!programId || !workoutId || !UUID_PATTERN.test(idempotencyKey)) {
    return NextResponse.json({ error: "חסרים פרטי אימון" }, { status: 400 });
  }

  await initDb();

  const existing = await originalSuccess(user.id, idempotencyKey);
  if (existing) return NextResponse.json(existing.response);

  // אימות שהתוכנית באמת משויכת לו — אחרת אפשר לרשום אימונים על תוכניות של אחרים.
  const allowed = await db.execute({
    sql: `SELECT a.id AS assignment_id, a.assigned_at, a.sessions_per_week, a.target_sessions,
                 (SELECT COUNT(*) FROM completions c
                   WHERE c.trainee_id = a.trainee_id
                     AND c.program_id = a.program_id
                     AND c.completed_at >= a.assigned_at) AS completed
            FROM assignments a
           WHERE a.trainee_id = ? AND a.program_id = ? AND a.status = 'active'`,
    args: [user.id, programId],
  });
  if (!allowed.rows.length) {
    return NextResponse.json({ error: "התוכנית לא משויכת לך" }, { status: 403 });
  }
  if (allowed.rows[0].sessions_per_week == null) {
    return NextResponse.json(
      { error: "צריך לבחור קודם קצב אימונים" },
      { status: 409 }
    );
  }
  // כאן ישבה חסימה על בדיקת הפתיחה. היא ירדה ב-7 באוגוסט 2026 יחד עם
  // הבדיקה עצמה, ואין יותר שער באמצע התוכנית.
  if (Number(allowed.rows[0].completed) >= Number(allowed.rows[0].target_sessions)) {
    return NextResponse.json(
      { error: "סיימת את 24 האימונים. עכשיו ממתינים לאישור מעבר." },
      { status: 409 }
    );
  }

  // דיווח כאב פתוח לכל מתאמן. קודם הוא נשמר רק למי שסומן במצב שיקום,
  // כלומר מתאמן שנפצע באמצע תוכנית לא היה לו איפה לדווח. עדיין לא חובה:
  // מי שלא בחר מספר, לא נשמר לו כלום.
  const rawPain = body.painLevel;
  let painLevel: number | null = null;
  if (rawPain != null && rawPain !== "") {
    const n = Number(rawPain);
    if (Number.isFinite(n) && n >= 0 && n <= 10) painLevel = Math.round(n);
  }

  const durationSec =
    body.durationSec == null ? null : Math.max(0, Math.round(Number(body.durationSec)));

  // כל הרישומים של האימון הזה חולקים את אותה חותמת זמן — ככה שולפים
  // אחר כך את "הפעם הקודמת" כיחידה אחת.
  const at = new Date().toISOString();
  const completionId = randomUUID();
  const statements = [{
    sql: `INSERT INTO completions
            (id,trainee_id,program_id,workout_id,completed_at,duration_sec,mood,pain_level,notes,idempotency_key)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      completionId, user.id, programId, workoutId, at,
      Number.isFinite(durationSec as number) ? durationSec : null,
      body.mood ? String(body.mood) : null,
      painLevel,
      String(body.notes ?? ""),
      idempotencyKey,
    ],
  }];

  // ── הסטים שבוצעו בפועל ──────────────────────────────────────────────
  // נשמרים רק פריטים ששייכים באמת לאימון הזה, כדי שלא יירשמו סטים
  // על תרגילים של אימון אחר.
  const assignmentId = String(allowed.rows[0].assignment_id);
  // האם זה אימון התאוששות נקבע כאן, לפי הספירה בשרת, ולא לפי מה שהלקוח
  // שלח — אחרת אפשר לסמן כל אימון כהתאוששות ולהתחמק מההשוואות.
  const recovery = isRecoverySession(Number(allowed.rows[0].completed));
  const raw = Array.isArray(body.setLogs) ? body.setLogs : [];
  const workout = await db.execute({
    sql: "SELECT id FROM workouts WHERE id = ? AND program_id = ?",
    args: [workoutId, programId],
  });
  if (!workout.rows.length) {
    return NextResponse.json({ error: "האימון לא שייך לתוכנית" }, { status: 400 });
  }
  /*
   * מה המנגנון החליט על כל תרגיל. חוזר ללקוח כדי שמסך הסיום יאמר את מה
   * שבאמת נשמר. קודם הלקוח חישב את זה בעצמו והציג "עלית דרגה" לפני
   * שהשרת בכלל הריץ את ההערכה, כלומר הבטיח הבטחה שלא תמיד התקיימה.
   */
  let progression: Record<string, ProgressionOutcome> = {};
  if (raw.length) {
    const [itemsRes, states] = await Promise.all([
      db.execute({
        sql: `SELECT i.id, i.exercise_id, i.sets, i.reps, i.seconds, e.type, e.unilateral,
                     e.progression, e.stance_video_level_2, e.stance_video_level_3
                FROM workout_items i JOIN exercises e ON e.id = i.exercise_id
               WHERE i.workout_id = ?`,
        args: [workoutId],
      }),
      getProgressStates(assignmentId),
    ]);
    const validItems = new Map(
      itemsRes.rows.map((r) => [
        String(r.id),
        {
          exerciseId: String(r.exercise_id),
          sets: Number(r.sets),
          unilateral: Number(r.unilateral) === 1,
        },
      ])
    );

    const num = (v: unknown) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };

    const parsed: {
      workoutItemId: string;
      setNumber: number;
      reps: number | null;
      seconds: number | null;
      side: "weak" | "strong" | null;
      banded: boolean;
      untouched: boolean;
    }[] = [];
    const submittedPairs = new Map<string, Set<string>>();
    for (const entry of raw) {
      const itemId = String(entry?.workoutItemId ?? "");
      const itemMeta = validItems.get(itemId);
      if (!itemMeta) {
        return NextResponse.json({ error: "נשלח סט שלא שייך לאימון" }, { status: 400 });
      }
      const exerciseId = itemMeta.exerciseId;

      const setNumber = Number(entry?.setNumber);
      if (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > itemMeta.sets) {
        return NextResponse.json({ error: "מספר הסט לא מתאים לתוכנית" }, { status: 400 });
      }

      const reps = num(entry?.reps);
      const seconds = num(entry?.seconds);
      if (reps == null && seconds == null) {
        return NextResponse.json({ error: "נתוני הסט אינם תקינים" }, { status: 400 });
      }

      const side = entry?.side === "weak" || entry?.side === "strong" ? entry.side : null;
      const pairKey = `${itemId}:${setNumber}`;
      const pairSides = submittedPairs.get(pairKey) ?? new Set<string>();
      const sideKey = side ?? "none";
      if (
        pairSides.has(sideKey) ||
        (!itemMeta.unilateral && pairSides.size > 0) ||
        (!itemMeta.unilateral && side != null) ||
        (itemMeta.unilateral && side == null)
      ) {
        return NextResponse.json({ error: "אותו סט נשלח יותר מפעם אחת" }, { status: 400 });
      }
      pairSides.add(sideKey);
      submittedPairs.set(pairKey, pairSides);
      // האם הסט בוצע בעזרת גומייה, ואיזו מהשלוש. זה מה שמאפשר להשוואה
      // לפעם הקודמת להישאר כנה, כי סט עם גומייה אינו אותו הישג כמו סט
      // בלעדיה, וגומייה קלה אינה אותו הישג כמו קשה.
      //
      // הרמה נגזרת מהקלט ולא מתקבלת כמו שהיא: ערך לא מוכר הופך לסט עם
      // גומייה בלי רמה, וזה בדיוק המצב של סטים ישנים מלפני ההפרדה.
      const bandLevel = BAND_LEVELS.has(String(entry?.bandLevel ?? ""))
        ? String(entry.bandLevel)
        : null;
      const banded = entry?.banded === true || bandLevel != null ? 1 : 0;

      // הסט נרשם עם הדרגה הנוכחית של התרגיל. הדרגה עולה רק בהערכה
      // שאחרי הרישום, כך שהסטים של האימון הזה שייכים לדרגה שבה בוצעו.
      // המצב ממופתח לפי התרגיל מאז שהסולם עבר להיות שלו, לא של הפריט.
      const step = states.get(exerciseId)?.difficultyStep ?? 0;

      // האם המתאמן אישר את המספר שהוצע לו בלי לגעת בו. רק true מפורש
      // נחשב אישור עיוור: לקוח ישן ששולח בלי השדה הזה נרשם כמי שנגע,
      // וזה הצד המקל, כמו ברירת המחדל של העמודה במסד.
      const untouched = entry?.untouched === true;

      parsed.push({
        workoutItemId: itemId,
        setNumber,
        reps,
        seconds,
        side,
        banded: banded === 1,
        untouched,
      });
      statements.push({
        sql: `INSERT INTO set_logs
                (id,trainee_id,workout_id,workout_item_id,exercise_id,set_number,reps,seconds,side,banded,band_level,difficulty_step,recovery,untouched,logged_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          randomUUID(), user.id, workoutId, itemId, exerciseId,
          setNumber, reps, seconds, side, banded, bandLevel, step,
          recovery ? 1 : 0, untouched ? 1 : 0, at,
        ],
      });
    }

    // אימון התאוששות לא נכנס להערכה: חצי סטים הם לא עדות לתקיעות
    // ולא סיבה להקשות.
    if (!recovery && parsed.length) {
      const progressUpdates = await evaluateProgression({
        assignmentId,
        // גבול הריצה: בשיוך חוזר של אותה תוכנית, הסטים של הריצה הקודמת
        // לא נחשבים "הפעם הקודמת".
        assignedAt: String(allowed.rows[0].assigned_at),
        traineeId: user.id,
        workoutId,
        loggedAt: at,
        items: itemsRes.rows.map((r) => ({
          id: String(r.id),
          exerciseId: String(r.exercise_id),
          type: String(r.type) as "reps" | "hold" | "amrap",
          // שורה ישנה בלי ערך נחשבת מנח, כמו ברירת המחדל של העמודה במסד.
          progression: PROGRESSIONS.has(String(r.progression ?? ""))
            ? (String(r.progression) as ProgressionMode)
            : "stance",
          hasStanceLevels:
            r.stance_video_level_2 != null || r.stance_video_level_3 != null,
          unilateral: Number(r.unilateral) === 1,
          sets: Number(r.sets),
          reps: r.reps == null ? null : Number(r.reps),
          seconds: r.seconds == null ? null : Number(r.seconds),
        })),
        rows: parsed,
        states,
      });
      statements.push(...progressUpdates.statements);
      progression = progressUpdates.outcomes;
    }
  }

  try {
    await db.batch(statements, "write");
  } catch (error) {
    const duplicate = await originalSuccess(user.id, idempotencyKey);
    if (duplicate) return NextResponse.json(duplicate.response);
    throw error;
  }

  // ── התראה למאמן FITAY ────────────────────────────────────────────────
  // רצה אחרי שהתשובה נשלחה. המתאמן סיים אימון והוא לא צריך לחכות
  // שהתראה תיסגר, ובטח לא שההעברה תיכשל ותפיל לו את הסיום.
  after(async () => {
    try {
      const workout = await db.execute({
        sql: "SELECT title FROM workouts WHERE id = ?",
        args: [workoutId],
      });
      const workoutTitle = String(workout.rows[0]?.title ?? "אימון");

      await sendToCoach({
        title: `${user.name} סיים אימון`,
        body: workoutTitle,
        url: `/coach/completions/${completionId}`,
        // tag לפי מתאמן: שני אימונים באותו יום לא ייערמו לשתי התראות.
        tag: `done-${user.id}`,
      });

      if (painLevel != null && painLevel >= PAIN_ALERT_FROM) {
        await sendToCoach({
          title: `${user.name} דיווח כאב ${painLevel}`,
          body: `אחרי ${workoutTitle}. פתח את הדיווח לפרטים.`,
          url: `/coach/completions/${completionId}`,
          tag: `pain-${user.id}`,
        });
      }
    } catch {
      // התראה שלא נשלחה לא הופכת אימון שהושלם לכישלון.
    }
  });

  return NextResponse.json({ ok: true, progression });
}
