import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import { WARMUPS, WARMUP_PLAN } from "@/lib/exercises-data";
import { getMethodContent } from "@/lib/method-content";
import {
  getProgressStates,
  isRecoverySession,
  rangeFloor,
  recoverySets,
} from "@/lib/progression";
import type { LastPerformance, Side } from "@/lib/types";
import WorkoutRunner, { type WarmupItem } from "./WorkoutRunner";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  // האימון נטען רק אם התוכנית שלו משויכת למתאמן הזה.
  const workoutRes = await db.execute({
    sql: `SELECT w.id, w.title, w.phase, w.program_id, p.title AS program_title,
                 a.id AS assignment_id, a.assigned_at,
                 a.sessions_per_week, a.initial_check_status, a.target_sessions,
                 (SELECT COUNT(*) FROM completions c
                   WHERE c.trainee_id = a.trainee_id
                     AND c.program_id = a.program_id
                     AND c.completed_at >= a.assigned_at) AS completed
            FROM workouts w
            JOIN programs p ON p.id = w.program_id
            JOIN assignments a ON a.program_id = p.id AND a.trainee_id = ?
           WHERE w.id = ? AND a.status = 'active'`,
    args: [user.id, id],
  });
  const workout = workoutRes.rows[0];
  if (!workout) notFound();
  if (workout.sessions_per_week == null) redirect("/client");
  if (String(workout.initial_check_status) === "pending") redirect("/client");
  if (Number(workout.completed) >= Number(workout.target_sessions)) redirect("/client");

  const assignmentId = String(workout.assignment_id);
  // אימון התאוששות: אחרי כל 12 אימונים באים שניים מוקלים. נקבע לפי
  // הספירה בשרת, באותה נוסחה שמסך הבית וה-API משתמשים בה.
  const recovery = isRecoverySession(Number(workout.completed));

  const [itemsRes, lastRes, states, method, pendingRes] = await Promise.all([
    db.execute({
      // סרטון ספציפי לפריט גובר על סרטון התרגיל — כך FITAY יכולים להראות
      // וריאציה אחרת למתאמן מסוים בלי לשנות את הספרייה.
      sql: `SELECT i.*, e.name, e.description, e.technique, e.tips, e.tempo,
                   e.muscles, e.type, e.unilateral, e.band_allowed,
                   COALESCE(i.video_file, e.video_file) AS effective_video,
                   -- תת-שאילתה ולא JOIN. ל-videos.url אין UNIQUE, ורישום
                   -- סרטון עושה בדיקה ואז הוספה בשתי פעולות נפרדות, כך
                   -- ששתי העלאות של אותה כתובת יכולות ליצור שתי שורות.
                   -- ב-JOIN זה היה מכפיל את התרגיל במסך האימון.
                   (SELECT v.poster_url FROM videos v
                     WHERE v.url = COALESCE(i.video_file, e.video_file)
                     LIMIT 1) AS effective_poster
              FROM workout_items i
              JOIN exercises e ON e.id = i.exercise_id
             WHERE i.workout_id = ?
             ORDER BY i.position`,
      args: [id],
    }),
    // הביצוע האחרון בכל תרגיל — מה שמוצג כ"פעם שעברה". רק אימונים
    // מלאים (לא התאוששות), רק באותה דרגת קושי, ורק מהריצה הנוכחית:
    // שיוך חוזר של אותה תוכנית מתחיל השוואות מאפס, אחרת המסך היה מציג
    // מספרים מריצה של לפני חודשים.
    db.execute({
      sql: `SELECT sl.workout_item_id, sl.set_number, sl.reps, sl.seconds,
                   sl.side, sl.banded, sl.band_level, sl.logged_at
              FROM set_logs sl
              LEFT JOIN item_progress ip
                ON ip.assignment_id = ? AND ip.workout_item_id = sl.workout_item_id
             WHERE sl.trainee_id = ? AND sl.workout_id = ? AND sl.recovery = 0
               AND sl.logged_at >= ?
               AND sl.difficulty_step = COALESCE(ip.difficulty_step, 0)
               AND sl.logged_at = (
                     SELECT MAX(logged_at) FROM set_logs s2
                      WHERE s2.trainee_id = sl.trainee_id
                        AND s2.workout_item_id = sl.workout_item_id
                        AND s2.recovery = 0
                        AND s2.logged_at >= ?
                        AND s2.difficulty_step = COALESCE(ip.difficulty_step, 0)
                   )
             ORDER BY sl.workout_item_id, sl.set_number`,
      args: [
        assignmentId,
        user.id,
        id,
        String(workout.assigned_at),
        String(workout.assigned_at),
      ],
    }),
    getProgressStates(assignmentId),
    // ארבעת הכללים למסך החימום. אותו טקסט בדיוק שבמדריך.
    getMethodContent(),
    // הקשיות שממתינות להחלטה של איתי. נשלף כאן ולא נשמר ב-item_progress,
    // כי advice מוגבל באילוץ CHECK ובנייה מחדש של הטבלה בשביל מצב אחד
    // היא מחיר גבוה מדי על מידע שממילא חי בטבלת האירועים.
    db.execute({
      sql: `SELECT workout_item_id FROM progression_events
             WHERE assignment_id = ? AND status = 'pending'`,
      args: [assignmentId],
    }),
  ]);

  const awaitingApproval = new Set(
    pendingRes.rows.map((row) => String(row.workout_item_id))
  );

  // קיבוץ הסטים האחרונים לפי תרגיל. הצד החזק לא נספר פעמיים —
  // בתרגיל חד־צדדי מציגים את הצד החלש, כי הוא זה שקובע את ההתקדמות.
  const lastByItem = new Map<string, LastPerformance>();
  for (const row of lastRes.rows) {
    const key = String(row.workout_item_id);
    const side = row.side == null ? null : (String(row.side) as Side);
    if (side === "strong") continue;
    const entry = lastByItem.get(key) ?? {
      loggedAt: String(row.logged_at),
      sets: [],
      total: 0,
      anyBanded: false,
    };
    const reps = row.reps == null ? null : Number(row.reps);
    const seconds = row.seconds == null ? null : Number(row.seconds);
    const banded = Number(row.banded ?? 0) === 1;
    // סט שנרשם לפני ההפרדה לשלוש גומיות מגיע בלי רמה, ואז מציגים אותו
    // כ"עם גומייה" בלי לנחש איזו.
    const rawLevel = row.band_level == null ? null : String(row.band_level);
    const bandLevel =
      rawLevel === "easy" || rawLevel === "medium" || rawLevel === "hard"
        ? rawLevel
        : null;
    entry.sets.push({ reps, seconds, side, banded, bandLevel });
    entry.total += reps ?? seconds ?? 0;
    if (banded) entry.anyBanded = true;
    lastByItem.set(key, entry);
  }

  const warmup: WarmupItem[] = WARMUP_PLAN.flatMap((plan) => {
    const ex = WARMUPS.find((w) => w.id === plan.id);
    if (!ex) return [];
    return [
      {
        id: ex.id,
        name: ex.name,
        description: ex.description,
        technique: ex.technique,
        sets: plan.sets,
        reps: plan.reps,
        seconds: plan.seconds,
      },
    ];
  });

  return (
    <WorkoutRunner
      programId={String(workout.program_id)}
      workoutId={String(workout.id)}
      workoutTitle={String(workout.title)}
      programTitle={String(workout.program_title)}
      phase={Number(workout.phase)}
      recovery={recovery}
      warmup={warmup}
      ruleTitles={method.rules.map((rule) => rule.title)}
      items={itemsRes.rows.map((i) => {
        const type = String(i.type) as "reps" | "hold" | "amrap";
        const reps = i.reps == null ? null : Number(i.reps);
        const seconds = i.seconds == null ? null : Number(i.seconds);
        const state = states.get(String(i.id));
        return {
          id: String(i.id),
          exerciseId: String(i.exercise_id),
          name: String(i.name),
          description: String(i.description ?? ""),
          technique: JSON.parse(String(i.technique || "[]")) as string[],
          tips: JSON.parse(String(i.tips || "[]")) as string[],
          tempo: String(i.tempo ?? ""),
          muscles: String(i.muscles ?? ""),
          type,
          unilateral: Number(i.unilateral) === 1,
          bandAllowed: Number(i.band_allowed ?? 0) === 1,
          // באימון התאוששות מבצעים חצי מהסטים. החזרות נשארות כמו בתוכנית.
          sets: recovery ? recoverySets(Number(i.sets)) : Number(i.sets),
          reps,
          seconds,
          // תחתית טווח העבודה. amrap נשאר מחוץ למנגנון הטווח.
          floor:
            type === "amrap"
              ? null
              : rangeFloor({
                  targetMin: i.target_min == null ? null : Number(i.target_min),
                  reps,
                  seconds,
                }),
          advice: state?.advice ?? "",
          awaitingApproval: awaitingApproval.has(String(i.id)),
          difficultyStep: state?.difficultyStep ?? 0,
          rest: Number(i.rest),
          ringHeight: i.ring_height == null ? null : String(i.ring_height),
          bodyAngle: i.body_angle == null ? null : String(i.body_angle),
          coachNote: String(i.notes ?? ""),
          videoFile: i.effective_video == null ? null : String(i.effective_video),
          posterUrl: i.effective_poster == null ? null : String(i.effective_poster),
          last: lastByItem.get(String(i.id)) ?? null,
        };
      })}
    />
  );
}
