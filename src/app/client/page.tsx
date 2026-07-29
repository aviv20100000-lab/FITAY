import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import LogoutButton from "@/components/LogoutButton";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

export default async function ClientHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  const [programs, workouts, done] = await Promise.all([
    db.execute({
      sql: `SELECT p.id, p.title, p.level, p.weeks
              FROM assignments a JOIN programs p ON p.id = a.program_id
             WHERE a.trainee_id = ?
             ORDER BY a.assigned_at`,
      args: [user.id],
    }),
    db.execute({
      sql: `SELECT w.id, w.title, w.phase, w.program_id,
                   (SELECT COUNT(*) FROM workout_items i WHERE i.workout_id = w.id) AS items
              FROM workouts w
             WHERE w.program_id IN (SELECT program_id FROM assignments WHERE trainee_id = ?)
             ORDER BY w.phase, w.position`,
      args: [user.id],
    }),
    db.execute({
      sql: "SELECT COUNT(*) c FROM completions WHERE trainee_id = ?",
      args: [user.id],
    }),
  ]);

  const doneCount = Number(done.rows[0].c);

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
        <header className="mb-8 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fitay.svg" alt="FITAY" className="w-28" />
          <div className="flex items-center gap-2">
            {user.rehabMode && (
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  background: "rgba(107,143,181,.16)",
                  border: "1px solid rgba(107,143,181,.4)",
                  color: "var(--rehab)",
                }}
              >
                מצב שיקום
              </span>
            )}
            <LogoutButton />
          </div>
        </header>

        <p className="text-sm" style={{ color: "var(--dim)" }}>
          {greeting()}
        </p>
        <h1 className="mb-7 text-3xl font-bold tracking-tight">{user.name}</h1>

        <div className="mb-6 grid grid-cols-2 gap-2.5">
          <div className="glass rounded-3xl px-3 py-4 text-center">
            <b className="block text-2xl font-extrabold wood-text">{doneCount}</b>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              אימונים שהושלמו
            </span>
          </div>
          <div className="glass rounded-3xl px-3 py-4 text-center">
            <b className="block text-2xl font-extrabold">{programs.rows.length}</b>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              תוכניות פעילות
            </span>
          </div>
        </div>

        {programs.rows.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-12 text-center">
            <p className="mb-2 text-lg font-semibold">עוד אין לך תוכנית</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              איתי יבנה לך תוכנית ותראה אותה כאן.
            </p>
          </div>
        ) : (
          programs.rows.map((p) => {
            const mine = workouts.rows.filter(
              (w) => String(w.program_id) === String(p.id)
            );
            const phases = [1, 2]
              .map((phase) => ({
                phase,
                rows: mine.filter((w) => Number(w.phase) === phase),
              }))
              .filter((g) => g.rows.length > 0);

            return (
              <section key={String(p.id)} className="mb-7">
                <p
                  className="mb-1 text-[11px] font-bold wood-text"
                  style={{ letterSpacing: ".14em" }}
                >
                  רמה {String(p.level)} · {String(p.weeks)} שבועות
                </p>
                <h2 className="mb-4 text-xl font-bold">{String(p.title)}</h2>

                {mine.length === 0 ? (
                  <p
                    className="glass rounded-3xl px-6 py-8 text-center text-sm"
                    style={{ color: "var(--dim)" }}
                  >
                    אין עדיין אימונים בתוכנית
                  </p>
                ) : (
                  phases.map((g) => (
                    <div key={g.phase} className="mb-5">
                      {/* המתאמן רואה את כל התוכנית מראש — כולל לאן הוא הולך */}
                      <div className="mb-2.5 flex items-baseline justify-between">
                        <p className="font-bold" style={{ color: "var(--wood-1)" }}>
                          שלב {g.phase}
                        </p>
                        <p className="text-xs" style={{ color: "var(--faint)" }}>
                          שבועות {g.phase === 1 ? "1-4" : "5-8"} · 3 אימונים בשבוע
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {g.rows.map((w) => (
                          <Link
                            key={String(w.id)}
                            href={`/client/workout/${w.id}`}
                            className="glass flex items-center gap-3 rounded-3xl p-5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-lg font-bold">
                                {String(w.title)}
                              </p>
                              <p className="text-sm" style={{ color: "var(--dim)" }}>
                                {String(w.items)} תרגילים · חימום כלול
                              </p>
                            </div>
                            <span
                              className="shrink-0 text-2xl"
                              style={{ color: "var(--wood-2)" }}
                            >
                              ←
                            </span>
                          </Link>
                        ))}
                      </div>

                      {/* שבוע התאוששות אחרי כל שלב — לא אופציונלי לפי החוברת */}
                      <div
                        className="mt-2.5 rounded-3xl px-5 py-4"
                        style={{
                          background: "rgba(107,143,181,.10)",
                          border: "1px dashed rgba(107,143,181,.4)",
                        }}
                      >
                        <p className="text-sm font-bold" style={{ color: "var(--rehab)" }}>
                          שבוע התאוששות
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--dim)" }}>
                          אותן חזרות, פחות סטים. 4 סטים הופכים ל-3, ו-3 הופכים ל-2.
                          גם אם אתה מרגיש רענן — עושים אותו.
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </section>
            );
          })
        )}

        <Link
          href="/method"
          className="glass mt-2 flex items-center gap-3 rounded-3xl p-5"
        >
          <div className="min-w-0 flex-1">
            <p className="font-bold">השיטה</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              ארבעת החוקים, הקצב, נוהל הצבירה — החוברת של איתי
            </p>
          </div>
          <span className="shrink-0 text-2xl" style={{ color: "var(--wood-2)" }}>
            ←
          </span>
        </Link>
      </div>
    </main>
  );
}
