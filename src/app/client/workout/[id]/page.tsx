import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import { WARMUPS, WARMUP_PLAN } from "@/lib/exercises-data";
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
    sql: `SELECT w.id, w.title, w.phase, w.program_id, p.title AS program_title
            FROM workouts w
            JOIN programs p ON p.id = w.program_id
            JOIN assignments a ON a.program_id = p.id AND a.trainee_id = ?
           WHERE w.id = ?`,
    args: [user.id, id],
  });
  const workout = workoutRes.rows[0];
  if (!workout) notFound();

  const [itemsRes, lastRes] = await Promise.all([
    db.execute({
      sql: `SELECT i.*, e.name, e.description, e.technique, e.tips, e.tempo,
                   e.muscles, e.type, e.unilateral
              FROM workout_items i
              JOIN exercises e ON e.id = i.exercise_id
             WHERE i.workout_id = ?
             ORDER BY i.position`,
      args: [id],
    }),
    // הביצוע האחרון בכל תרגיל של האימון — הבסיס לנוהל הצבירה.
    // תת-השאילתה בוחרת את מועד האימון האחרון שבו התרגיל הזה בוצע.
    db.execute({
      sql: `SELECT workout_item_id, set_number, reps, seconds, side, logged_at
              FROM set_logs sl
             WHERE sl.trainee_id = ? AND sl.workout_id = ?
               AND sl.logged_at = (
                     SELECT MAX(logged_at) FROM set_logs s2
                      WHERE s2.trainee_id = sl.trainee_id
                        AND s2.workout_item_id = sl.workout_item_id
                   )
             ORDER BY sl.workout_item_id, sl.set_number`,
      args: [user.id, id],
    }),
  ]);

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
    };
    const reps = row.reps == null ? null : Number(row.reps);
    const seconds = row.seconds == null ? null : Number(row.seconds);
    entry.sets.push({ reps, seconds, side });
    entry.total += reps ?? seconds ?? 0;
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
      rehabMode={user.rehabMode}
      warmup={warmup}
      items={itemsRes.rows.map((i) => ({
        id: String(i.id),
        exerciseId: String(i.exercise_id),
        name: String(i.name),
        description: String(i.description ?? ""),
        technique: JSON.parse(String(i.technique || "[]")) as string[],
        tips: JSON.parse(String(i.tips || "[]")) as string[],
        tempo: String(i.tempo ?? ""),
        muscles: String(i.muscles ?? ""),
        type: String(i.type) as "reps" | "hold" | "amrap",
        unilateral: Number(i.unilateral) === 1,
        sets: Number(i.sets),
        reps: i.reps == null ? null : Number(i.reps),
        seconds: i.seconds == null ? null : Number(i.seconds),
        rest: Number(i.rest),
        ringHeight: i.ring_height == null ? null : String(i.ring_height),
        bodyAngle: i.body_angle == null ? null : String(i.body_angle),
        videoFile: i.video_file == null ? null : String(i.video_file),
        last: lastByItem.get(String(i.id)) ?? null,
      }))}
    />
  );
}
