import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import AssignPrograms from "./AssignPrograms";

export default async function TraineePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [traineeRes, programsRes, assignedRes, recentRes] = await Promise.all([
    db.execute({ sql: "SELECT * FROM users WHERE id = ? AND role='trainee'", args: [id] }),
    db.execute("SELECT id, title, level, is_template FROM programs ORDER BY is_template DESC, level"),
    db.execute({ sql: "SELECT program_id FROM assignments WHERE trainee_id = ?", args: [id] }),
    db.execute({
      sql: `SELECT c.completed_at, c.pain_level, c.mood, w.title
              FROM completions c LEFT JOIN workouts w ON w.id = c.workout_id
             WHERE c.trainee_id = ?
             ORDER BY c.completed_at DESC LIMIT 10`,
      args: [id],
    }),
  ]);

  const trainee = traineeRes.rows[0];
  if (!trainee) notFound();

  const assignedIds = assignedRes.rows.map((r) => String(r.program_id));
  const inRehab = Number(trainee.rehab_mode) === 1;

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
        <Link href="/coach" className="mb-6 inline-block text-sm" style={{ color: "var(--dim)" }}>
          ← חזרה
        </Link>

        <div className="mb-7 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{String(trainee.name)}</h1>
          {inRehab && (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: "rgba(107,143,181,.16)",
                border: "1px solid rgba(107,143,181,.4)",
                color: "var(--rehab)",
              }}
            >
              שיקום
            </span>
          )}
        </div>

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
              <div
                key={i}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
