import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import ProgramEditor from "./ProgramEditor";

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [progRes, workoutsRes, itemsRes, exercisesRes] = await Promise.all([
    db.execute({ sql: "SELECT * FROM programs WHERE id = ?", args: [id] }),
    db.execute({
      sql: "SELECT * FROM workouts WHERE program_id = ? ORDER BY phase, position",
      args: [id],
    }),
    db.execute({
      sql: `SELECT i.*, e.name AS exercise_name, e.type AS exercise_type
              FROM workout_items i
              JOIN exercises e ON e.id = i.exercise_id
             WHERE i.workout_id IN (SELECT id FROM workouts WHERE program_id = ?)
             ORDER BY i.position`,
      args: [id],
    }),
    // תרגילי החימום לא נבחרים לתוכנית — הם מוצגים אוטומטית בתחילת כל אימון.
    db.execute(
      "SELECT id, name, type, category FROM exercises WHERE category <> 'warmup' ORDER BY position"
    ),
  ]);

  const program = progRes.rows[0];
  if (!program) notFound();

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-7 pb-10">
        <Link
          href="/coach/programs"
          className="mb-6 inline-block text-sm"
          style={{ color: "var(--dim)" }}
        >
          ← כל התוכניות
        </Link>

        <p className="mb-1 text-[11px] font-bold wood-text" style={{ letterSpacing: ".14em" }}>
          רמה {String(program.level)}
          {Number(program.is_template) === 1 && " · תבנית"}
        </p>
        <h1 className="mb-7 text-3xl font-bold tracking-tight">
          {String(program.title)}
        </h1>

        <ProgramEditor
          programId={id}
          workouts={workoutsRes.rows.map((w) => ({
            id: String(w.id),
            title: String(w.title),
            phase: Number(w.phase),
          }))}
          items={itemsRes.rows.map((i) => ({
            id: String(i.id),
            workoutId: String(i.workout_id),
            name: String(i.exercise_name),
            sets: Number(i.sets),
            reps: i.reps == null ? null : Number(i.reps),
            seconds: i.seconds == null ? null : Number(i.seconds),
            rest: Number(i.rest),
            ringHeight: i.ring_height == null ? null : String(i.ring_height),
            bodyAngle: i.body_angle == null ? null : String(i.body_angle),
          }))}
          exercises={exercisesRes.rows.map((e) => ({
            id: String(e.id),
            name: String(e.name),
            type: String(e.type),
          }))}
        />
      </div>
    </main>
  );
}
