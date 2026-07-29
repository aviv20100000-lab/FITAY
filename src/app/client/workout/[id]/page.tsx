import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import WorkoutRunner from "./WorkoutRunner";

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

  const itemsRes = await db.execute({
    sql: `SELECT i.*, e.name, e.description, e.technique, e.tips, e.tempo, e.muscles, e.type
            FROM workout_items i
            JOIN exercises e ON e.id = i.exercise_id
           WHERE i.workout_id = ?
           ORDER BY i.position`,
    args: [id],
  });

  return (
    <WorkoutRunner
      programId={String(workout.program_id)}
      workoutId={String(workout.id)}
      workoutTitle={String(workout.title)}
      programTitle={String(workout.program_title)}
      rehabMode={user.rehabMode}
      items={itemsRes.rows.map((i) => ({
        id: String(i.id),
        name: String(i.name),
        description: String(i.description ?? ""),
        technique: JSON.parse(String(i.technique || "[]")) as string[],
        tips: JSON.parse(String(i.tips || "[]")) as string[],
        tempo: String(i.tempo ?? ""),
        muscles: String(i.muscles ?? ""),
        sets: Number(i.sets),
        reps: i.reps == null ? null : Number(i.reps),
        seconds: i.seconds == null ? null : Number(i.seconds),
        rest: Number(i.rest),
        ringHeight: i.ring_height == null ? null : String(i.ring_height),
        bodyAngle: i.body_angle == null ? null : String(i.body_angle),
        videoFile: i.video_file == null ? null : String(i.video_file),
      }))}
    />
  );
}
