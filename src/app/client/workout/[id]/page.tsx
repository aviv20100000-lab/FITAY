import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import { getMethodContent } from "@/lib/method-content";
import {
  getProgressStates,
  isRecoverySession,
  rangeFloor,
  recoverySets,
} from "@/lib/progression";
import type { LastPerformance, ProgressionMode, Side } from "@/lib/types";
import WorkoutRunner, { type WarmupItem } from "./WorkoutRunner";

/** שלושת צירי ההתקדמות. ערך לא מוכר במסד נקרא כמנח. */
const PROGRESSIONS = new Set(["stance", "reps", "time"]);

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  /*
   * המסך הזה קורא מ-progression_events, שהיא טבלה חדשה. מתאמן שכבר
   * מחובר לא עובר דרך login, שהוא אחד המקומות הבודדים שמריצים את
   * המיגרציה, ולכן הוא יכול היה להגיע לכאן לפני שהטבלה קיימת. הקריאה
   * נשמרת בזיכרון התהליך ועולה שאילתה אחת בפעם הראשונה בלבד.
   */
  await initDb();

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

  const [itemsRes, lastRes, states, method, pendingRes, declinedRes, warmupRes, seenRes] =
    await Promise.all([
    db.execute({
      // סרטון ספציפי לפריט גובר על סרטון התרגיל — כך FITAY יכולים להראות
      // וריאציה אחרת למתאמן מסוים בלי לשנות את הספרייה.
      sql: `SELECT i.*, e.name, e.description, e.technique, e.tips, e.tempo,
                   e.muscles, e.type, e.progression, e.unilateral, e.band_allowed,
                   COALESCE(i.video_file, e.video_file) AS effective_video,
                   -- תת-שאילתה ולא JOIN. ל-videos.url אין UNIQUE, ורישום
                   -- סרטון עושה בדיקה ואז הוספה בשתי פעולות נפרדות, כך
                   -- ששתי העלאות של אותה כתובת יכולות ליצור שתי שורות.
                   -- ב-JOIN זה היה מכפיל את התרגיל במסך האימון.
                   (SELECT v.poster_url FROM videos v
                     WHERE v.url = COALESCE(i.video_file, e.video_file)
                     LIMIT 1) AS effective_poster,
                   e.stance_video_level_2,
                   (SELECT v.poster_url FROM videos v
                     WHERE v.url = e.stance_video_level_2
                     LIMIT 1) AS stance_poster_level_2,
                   e.stance_video_level_3,
                   (SELECT v.poster_url FROM videos v
                     WHERE v.url = e.stance_video_level_3
                     LIMIT 1) AS stance_poster_level_3,
                   -- ההדגמה עם הגומייה יושבת על התרגיל בלבד. אין לה דריסה
                   -- ברמת הפריט, ולכן גם אין כאן COALESCE.
                   e.band_video_file,
                   (SELECT v.poster_url FROM videos v
                     WHERE v.url = e.band_video_file
                     LIMIT 1) AS band_poster
              FROM workout_items i
              JOIN exercises e ON e.id = i.exercise_id
             WHERE i.workout_id = ?
             ORDER BY i.position`,
      args: [id],
    }),
    // הביצוע האחרון בכל תרגיל. לא מוצג למתאמן באמצע האימון, אלא מזין
    // את היעד שממולא מראש ואת ההשוואה במסך הסיום. רק אימונים מלאים
    // (לא התאוששות), רק באותה דרגת קושי, ורק מהריצה הנוכחית: שיוך חוזר
    // של אותה תוכנית מתחיל השוואות מאפס, אחרת היו נכנסים לחישוב מספרים
    // מריצה של לפני חודשים.
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
    /*
     * מה שאיתי כתב כשלא אישר הקשיה.
     *
     * מוצג עד האימון הבא בתרגיל הזה ולא לנצח: ההערה אומרת מה לעשות
     * עכשיו, וברגע שהמתאמן ביצע אימון נוסף היא כבר לא מה שקורה עכשיו.
     * לכן ההשוואה היא בין מועד ההחלטה למועד הרישום האחרון.
     */
    db.execute({
      sql: `SELECT pe.workout_item_id, pe.coach_note
              FROM progression_events pe
             WHERE pe.assignment_id = ? AND pe.status = 'declined'
               AND pe.coach_note <> ''
               AND pe.decided_at = (
                     SELECT MAX(p2.decided_at) FROM progression_events p2
                      WHERE p2.assignment_id = pe.assignment_id
                        AND p2.workout_item_id = pe.workout_item_id
                        AND p2.status = 'declined')
               AND pe.decided_at > COALESCE((
                     SELECT MAX(sl.logged_at) FROM set_logs sl
                      WHERE sl.workout_item_id = pe.workout_item_id
                        AND sl.trainee_id = ?), '')`,
      args: [assignmentId, user.id],
    }),
    /*
     * תרגילי החימום מהמסד ולא מהקובץ.
     *
     * התוכן שאיתי עורך בספרייה — שם, תיאור, הדגשים והסרטון — נשמר
     * ב-exercises, ועד עכשיו מסך החימום נבנה מ-WARMUPS שבקוד, ולכן שום
     * תיקון שלו לא הגיע למתאמן. הקובץ נשאר רק כגיבוי לשורה חסרה.
     */
    db.execute(
      `SELECT wp.exercise_id, wp.sets, wp.reps, wp.seconds,
              e.name, e.description, e.technique, e.video_file,
              (SELECT v.poster_url FROM videos v
                WHERE v.url = e.video_file
                LIMIT 1) AS poster_url
         FROM warmup_plan wp
         JOIN exercises e ON e.id = wp.exercise_id
        ORDER BY wp.position`
    ),
    /*
     * תרגילים שהמתאמן כבר עשה בתוכנית אחרת.
     *
     * ההשוואה לפעם הקודמת מוגבלת לריצה הנוכחית, ולכן תרגיל שממשיך
     * מהשלב הראשון לשני נראה למסך כתרגיל חדש והיה מתחיל שוב מתחתית
     * הטווח. איתי הכריע (13 באוגוסט 2026) שתרגיל שנמצא בשתי התוכניות
     * ממשיך ממקסימום הטווח: המתאמן כבר עשה אותו לאורך שלב שלם.
     *
     * program_id <> הוא לב השאילתה ולא פרט.
     * שיוך חוזר של אותה תוכנית מתחיל השוואות מאפס בכוונה, וזה נשאר
     * נכון: מי שחוזר על השלב הראשון מטפס בו מחדש. רק מעבר לתוכנית
     * אחרת נחשב המשך.
     */
    db.execute({
      sql: `SELECT DISTINCT sl.exercise_id
              FROM set_logs sl
              JOIN workouts w ON w.id = sl.workout_id
             WHERE sl.trainee_id = ?
               AND sl.logged_at < ?
               AND w.program_id <> ?`,
      args: [user.id, String(workout.assigned_at), String(workout.program_id)],
    }),
  ]);

  const seenBefore = new Set(
    seenRes.rows.map((row) => String(row.exercise_id))
  );

  const awaitingApproval = new Set(
    pendingRes.rows.map((row) => String(row.workout_item_id))
  );

  const coachDecisions = new Map(
    declinedRes.rows.map((row) => [
      String(row.workout_item_id),
      String(row.coach_note ?? ""),
    ])
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

  /*
   * החימום מגיע כולו מהמסד: גם מי בפנים ובאיזה סדר, וגם השם, ההדגשים
   * והסרטון. אין כאן נפילה חזרה לרשימה שבקוד — רשימה ריקה פירושה שאיתי
   * הוציא את כל תרגילי החימום, וזו החלטה שלו ולא תקלה שצריך לתקן.
   */
  const warmup: WarmupItem[] = warmupRes.rows.map((row) => ({
    id: String(row.exercise_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    // technique נשמר כ-JSON. שורה פגומה לא תפיל את המסך שפותח כל אימון.
    technique: (() => {
      try {
        const parsed = JSON.parse(String(row.technique || "[]"));
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })(),
    videoFile: row.video_file == null ? null : String(row.video_file),
    posterUrl: row.poster_url == null ? null : String(row.poster_url),
    sets: Number(row.sets),
    reps: row.reps == null ? undefined : Number(row.reps),
    seconds: row.seconds == null ? undefined : Number(row.seconds),
  }));

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
        // ציר ההתקדמות. ערך לא מוכר נקרא כמנח, כמו ברירת המחדל במסד.
        const progression = PROGRESSIONS.has(String(i.progression ?? ""))
          ? (String(i.progression) as ProgressionMode)
          : "stance";
        const reps = i.reps == null ? null : Number(i.reps);
        const seconds = i.seconds == null ? null : Number(i.seconds);
        const state = states.get(String(i.id));
        const level1Video = i.effective_video == null ? null : String(i.effective_video);
        const level1Poster = i.effective_poster == null ? null : String(i.effective_poster);
        const level2Video = i.stance_video_level_2 == null ? null : String(i.stance_video_level_2);
        const level2Poster = i.stance_poster_level_2 == null ? null : String(i.stance_poster_level_2);
        const level3Video = i.stance_video_level_3 == null ? null : String(i.stance_video_level_3);
        const level3Poster = i.stance_poster_level_3 == null ? null : String(i.stance_poster_level_3);
        /*
         * כמה רמות מנח יש לתרגיל: לפי הסרטונים שקיימים בפועל.
         *
         * החלטה של איתי מ-13 באוגוסט 2026. קודם כל תרגיל עם סרטון לרמה 2
         * הכריז "מנח X מתוך 3", גם כשלרמה 3 לא היה סרטון. מתאמן כזה היה
         * מטפס לרמה השלישית ורואה בה את ההדגמה של השנייה, כלומר המסך
         * הבטיח יותר ממה שקיים.
         */
        const stanceLevelCount = level3Video != null ? 3 : level2Video != null ? 2 : 1;
        const hasStanceLevels = stanceLevelCount > 1;
        const stanceLevel = Math.min(
          stanceLevelCount,
          (state?.difficultyStep ?? 0) + 1
        );
        const videoFile = hasStanceLevels
          ? stanceLevel >= 3
            ? level3Video ?? level2Video ?? level1Video
            : stanceLevel >= 2
              ? level2Video ?? level1Video
              : level1Video
          : level1Video;
        const posterUrl = hasStanceLevels
          ? stanceLevel >= 3 && level3Video
            ? level3Poster
            : stanceLevel >= 2 && level2Video
              ? level2Poster
              : level1Poster
          : level1Poster;
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
          progression,
          hasStanceLevels,
          stanceLevelCount,
          unilateral: Number(i.unilateral) === 1,
          /*
           * גומייה לא קיימת בתרגילי מנח.
           *
           * החלטה של איתי מ-13 באוגוסט 2026. בתרגיל שמתקדם במנח ההקלה
           * היא הגבהת הטבעות או שינוי זווית הגוף, ולא גומייה, ושתי דרכי
           * הקלה על אותו תרגיל היו הופכות את ההשוואה בין אימונים לחסרת
           * משמעות. בפועל אין היום אף תרגיל מנח שסומן לגומייה, כך שזו
           * נעילה של מצב קיים ולא שינוי התנהגות.
           */
          bandAllowed:
            Number(i.band_allowed ?? 0) === 1 && progression !== "stance",
          // באימון התאוששות מבצעים חצי מהסטים. החזרות נשארות כמו בתוכנית.
          sets: recovery ? recoverySets(Number(i.sets)) : Number(i.sets),
          reps,
          seconds,
          /*
           * האם איתי באמת קבע טווח לתרגיל הזה, או שהתחתית היא ברירת
           * המחדל המחושבת. הטווח מוצג למתאמן רק כשהוא נקבע, כדי שלא
           * יופיע לו במסך מספר שאיש לא כתב.
           */
          rangeSet: i.target_min != null,
          /*
           * התרגיל כבר בוצע בריצה קודמת, כלומר המתאמן מגיע אליו עם
           * ניסיון שההשוואה של הריצה הזאת לא רואה.
           */
          seenBefore: seenBefore.has(String(i.exercise_id)),
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
          coachDecision: coachDecisions.get(String(i.id)) ?? "",
          difficultyStep: state?.difficultyStep ?? 0,
          ceilingStreak: state?.ceilingStreak ?? 0,
          rest: Number(i.rest),
          ringHeight: i.ring_height == null ? null : String(i.ring_height),
          bodyAngle: i.body_angle == null ? null : String(i.body_angle),
          coachNote: String(i.notes ?? ""),
          videoFile,
          posterUrl,
          bandVideoFile:
            hasStanceLevels && stanceLevel >= 2
              ? null
              : i.band_video_file == null
                ? null
                : String(i.band_video_file),
          bandPosterUrl:
            hasStanceLevels && stanceLevel >= 2
              ? null
              : i.band_poster == null
                ? null
                : String(i.band_poster),
          last: lastByItem.get(String(i.id)) ?? null,
        };
      })}
    />
  );
}
