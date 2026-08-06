import { redirect, notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import ProgramEditor from "./ProgramEditor";
import { programLevelName } from "@/lib/program-levels";

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [progRes, workoutsRes, itemsRes, exercisesRes, assignedRes] = await Promise.all([
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
    db.execute({
      sql: "SELECT COUNT(*) AS n FROM assignments WHERE program_id = ? AND status = 'active'",
      args: [id],
    }),
  ]);

  const program = progRes.rows[0];
  if (!program) notFound();
  const assigned = Number(assignedRes.rows[0].n);

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
        <BackLink href="/coach/programs" className="mb-6">
          חזרה לכל התוכניות
        </BackLink>

        <header className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-extrabold"
              style={{
                background: "rgba(180,133,79,.18)",
                border: "1px solid rgba(224,190,147,.3)",
                color: "var(--wood-1)",
              }}
            >
              {programLevelName(Number(program.level))}
            </span>
            {Number(program.is_template) === 1 && (
              <span
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{
                  background: "rgba(255,255,255,.055)",
                  border: "1px solid var(--line)",
                  color: "var(--dim)",
                }}
              >
                תבנית
              </span>
            )}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
            {String(program.title)}
          </h1>
          {String(program.description ?? "").trim() && (
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
              {String(program.description)}
            </p>
          )}
        </header>

        <div className="mb-6 grid grid-cols-3 gap-2">
          <ProgramStat value={workoutsRes.rows.length} label="אימונים" />
          <ProgramStat value={24} label="אימונים במסלול" />
          <ProgramStat value={assigned} label="מתאמנים" />
        </div>

        <ProgramEditor
          program={{
            id,
            title: String(program.title),
            description: String(program.description ?? ""),
            level: Number(program.level),
            weeks: Number(program.weeks),
            isTemplate: Number(program.is_template) === 1,
            assigned,
          }}
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
            targetMin: i.target_min == null ? null : Number(i.target_min),
            rest: Number(i.rest),
            ringHeight: i.ring_height == null ? null : String(i.ring_height),
            bodyAngle: i.body_angle == null ? null : String(i.body_angle),
            notes: String(i.notes ?? ""),
            isHold: i.exercise_type === "hold" || i.exercise_type === "amrap",
            // amrap נשאר מחוץ למנגנון הטווח, ולכן אין לו שדה תחתית.
            isAmrap: i.exercise_type === "amrap",
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

function ProgramStat({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="rounded-2xl px-2 py-3 text-center"
      style={{
        background: "rgba(255,255,255,.045)",
        border: "1px solid var(--line)",
      }}
    >
      <b className="block text-lg font-extrabold wood-text">{value}</b>
      <span className="text-xs" style={{ color: "var(--dim)" }}>
        {label}
      </span>
    </div>
  );
}
