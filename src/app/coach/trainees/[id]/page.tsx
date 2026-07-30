import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import AssignPrograms from "./AssignPrograms";
import EditTrainee from "./EditTrainee";
import DeleteTrainee from "@/components/DeleteTrainee";

export default async function TraineePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [traineeRes, programsRes, assignedRes, recentRes, progressRes, countsRes] = await Promise.all([
    db.execute({ sql: "SELECT * FROM users WHERE id = ? AND role='trainee'", args: [id] }),
    db.execute("SELECT id, title, level, is_template FROM programs ORDER BY is_template DESC, level"),
    db.execute({ sql: "SELECT program_id FROM assignments WHERE trainee_id = ?", args: [id] }),
    db.execute({
      sql: `SELECT c.id, c.completed_at, c.pain_level, c.mood, c.notes, w.title
              FROM completions c LEFT JOIN workouts w ON w.id = c.workout_id
             WHERE c.trainee_id = ?
             ORDER BY c.completed_at DESC LIMIT 10`,
      args: [id],
    }),
    // הצבירה: סך העבודה בכל תרגיל, אימון אחר אימון. בתרגיל חד־צדדי
    // נספר רק הצד החלש — הוא זה שקובע אם יש התקדמות אמיתית.
    db.execute({
      sql: `SELECT e.name, e.type, sl.logged_at,
                   SUM(COALESCE(sl.reps, sl.seconds)) AS total,
                   COUNT(*) AS sets
              FROM set_logs sl JOIN exercises e ON e.id = sl.exercise_id
             WHERE sl.trainee_id = ? AND (sl.side IS NULL OR sl.side = 'weak')
             GROUP BY sl.exercise_id, sl.logged_at
             ORDER BY e.name, sl.logged_at`,
      args: [id],
    }),
    // מה בדיוק יימחק אם ימחקו את המתאמן. מוצג לפני הפעולה, במספרים אמיתיים.
    db.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM completions WHERE trainee_id = ?) AS completions,
              (SELECT COUNT(*) FROM set_logs   WHERE trainee_id = ?) AS sets`,
      args: [id, id],
    }),
  ]);

  const trainee = traineeRes.rows[0];
  if (!trainee) notFound();

  // חמשת המדידות האחרונות בכל תרגיל, לפי סדר כרונולוגי.
  const progress = new Map<string, { unit: string; points: number[] }>();
  for (const r of progressRes.rows) {
    const name = String(r.name);
    const entry = progress.get(name) ?? {
      unit: String(r.type) === "hold" ? "שנ׳" : "חזרות",
      points: [],
    };
    entry.points.push(Number(r.total));
    progress.set(name, entry);
  }

  const assignedIds = assignedRes.rows.map((r) => String(r.program_id));

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
        <Link href="/coach" className="mb-6 inline-block text-sm" style={{ color: "var(--dim)" }}>
          ← חזרה
        </Link>

        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{String(trainee.name)}</h1>
          {Number(trainee.active) !== 1 && (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: "rgba(229,72,77,.14)",
                border: "1px solid rgba(229,72,77,.36)",
                color: "#ffb4b6",
              }}
            >
              מושבת
            </span>
          )}
        </div>
        <p className="mb-6 text-sm" dir="ltr" style={{ color: "var(--dim)", textAlign: "right" }}>
          {String(trainee.phone)}
        </p>
        {String(trainee.notes ?? "").trim() && (
          <p
            className="mb-6 rounded-2xl px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid var(--line)",
              color: "var(--dim)",
            }}
          >
            {String(trainee.notes)}
          </p>
        )}

        <EditTrainee
          traineeId={id}
          phone={String(trainee.phone)}
          name={String(trainee.name)}
          active={Number(trainee.active) === 1}
          notes={String(trainee.notes ?? "")}
        />

        <AssignPrograms
          traineeId={id}
          assignedIds={assignedIds}
          programs={programsRes.rows.map((p) => ({
            id: String(p.id),
            title: String(p.title),
            level: Number(p.level),
            isTemplate: Number(p.is_template) === 1,
          }))}
        />

        {progress.size > 0 && (
          <>
            <h2 className="mt-8 mb-1 text-lg font-bold">צבירה</h2>
            <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
              סך העבודה בכל תרגיל, אימון אחר אימון. עולה = מתקדם.
            </p>
            <div className="glass rounded-3xl p-2">
              {[...progress.entries()].map(([name, data], i) => {
                const points = data.points.slice(-5);
                const first = points[0];
                const last = points[points.length - 1];
                const rising = points.length > 1 && last > first;
                return (
                  <div
                    key={name}
                    className="px-3.5 py-3"
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-semibold">{name}</p>
                      <p
                        className="shrink-0 text-xs font-bold"
                        style={{ color: rising ? "var(--wood-1)" : "var(--faint)" }}
                      >
                        {rising ? `+${last - first}` : "—"}
                      </p>
                    </div>
                    <p
                      className="mt-0.5 text-sm tabular-nums"
                      style={{ color: "var(--dim)" }}
                      dir="ltr"
                    >
                      {points.join("  →  ")} {data.unit}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <h2 className="mt-8 mb-3 text-lg font-bold">אימונים אחרונים</h2>
        {recentRes.rows.length === 0 ? (
          <p
            className="glass rounded-3xl px-6 py-8 text-center text-sm"
            style={{ color: "var(--dim)" }}
          >
            עוד לא השלים אימונים
          </p>
        ) : (
          <div className="glass rounded-3xl p-2">
            {recentRes.rows.map((c, i) => (
              <Link
                key={i}
                href={`/coach/completions/${String(c.id)}`}
                className="flex items-center gap-3 px-3 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {c.title ? String(c.title) : "אימון"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>
                    {new Date(String(c.completed_at)).toLocaleDateString("he-IL")}
                    {c.mood ? ` · ${c.mood}` : ""}
                    {String(c.notes ?? "").trim() && " · יש הערה"}
                  </p>
                </div>
                {c.pain_level != null && (
                  <span
                    className="shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-bold"
                    style={{
                      background:
                        Number(c.pain_level) >= 5
                          ? "rgba(229,72,77,.18)"
                          : "rgba(107,143,181,.16)",
                      border: `1px solid ${
                        Number(c.pain_level) >= 5
                          ? "rgba(229,72,77,.45)"
                          : "rgba(107,143,181,.4)"
                      }`,
                      color: Number(c.pain_level) >= 5 ? "#ffb4b6" : "var(--rehab)",
                    }}
                    title="דיווח כאב"
                  >
                    כאב {String(c.pain_level)}
                  </span>
                )}
                <span className="shrink-0 text-lg" style={{ color: "var(--faint)" }}>
                  ‹
                </span>
              </Link>
            ))}
          </div>
        )}
        <DeleteTrainee
          traineeId={id}
          traineeName={String(trainee.name)}
          completions={Number(countsRes.rows[0]?.completions ?? 0)}
          loggedSets={Number(countsRes.rows[0]?.sets ?? 0)}
        />
      </div>
    </main>
  );
}
