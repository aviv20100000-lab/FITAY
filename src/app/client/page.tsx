import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import PushToggle from "@/components/PushToggle";
import LevelRequest from "@/components/LevelRequest";

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

  const [programs, workouts, done, perWorkout, openRequests] = await Promise.all([
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
    // כמה פעמים בוצע כל אימון ומתי לאחרונה — כדי לדעת מה הבא בתור.
    db.execute({
      sql: `SELECT workout_id, COUNT(*) AS times, MAX(completed_at) AS last
              FROM completions WHERE trainee_id = ?
             GROUP BY workout_id`,
      args: [user.id],
    }),
    // בקשות מעבר רמה שעדיין ממתינות, כדי לא להציע לבקש פעמיים.
    db.execute({
      sql: "SELECT from_program_id FROM level_requests WHERE trainee_id = ? AND status = ?",
      args: [user.id, "pending"],
    }),
  ]);

  const pendingLevel = new Set(
    openRequests.rows.map((r) => String(r.from_program_id))
  );

  const doneCount = Number(done.rows[0].c);

  const history = new Map(
    perWorkout.rows.map((r) => [
      String(r.workout_id),
      { times: Number(r.times), last: String(r.last) },
    ])
  );

  /**
   * האימון הבא: זה שבוצע הכי מעט פעמים, ובשוויון — הראשון בסדר התוכנית.
   * ככה הרוטציה מתקדמת לבד בלי לנהל לוח שנה.
   */
  const nextWorkoutId = workouts.rows.length
    ? String(
        workouts.rows.reduce((best, w) => {
          const a = history.get(String(w.id))?.times ?? 0;
          const b = history.get(String(best.id))?.times ?? 0;
          return a < b ? w : best;
        }).id
      )
    : null;

  const daysSince = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days <= 0) return "היום";
    if (days === 1) return "אתמול";
    return `לפני ${days} ימים`;
  };

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      {/* הלוגו וכפתור היציאה במעטפת, כדי שיופיעו בכל הלשוניות */}
      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
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
              תוכניות משויכות
            </span>
          </div>
        </div>

        <PushToggle hint="נזכיר לך אם יעברו כמה ימים בלי אימון." />

        {programs.rows.length > 0 && (
          <div className="mb-3 mt-7">
            <p
              className="mb-1 text-[11px] font-bold wood-text"
              style={{ letterSpacing: ".14em" }}
            >
              האימונים שלך
            </p>
            <h2 className="text-2xl font-extrabold">התוכניות שלי</h2>
          </div>
        )}

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
              <section
                key={String(p.id)}
                className="glass mb-7 overflow-hidden rounded-[2rem]"
              >
                <div
                  className="px-5 py-5"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(180,133,79,.14), rgba(255,255,255,.015) 65%)",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span
                      className="rounded-full px-3 py-1 text-[11px] font-extrabold"
                      style={{
                        background: "rgba(180,133,79,.2)",
                        border: "1px solid rgba(224,190,147,.32)",
                        color: "var(--wood-1)",
                      }}
                    >
                      רמה {String(p.level)}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
                      {String(p.weeks)} שבועות · {mine.length} אימונים
                    </span>
                  </div>
                  <h3 className="text-2xl font-extrabold leading-tight">
                    {String(p.title)}
                  </h3>
                </div>

                <div className="p-4">

                {mine.length === 0 ? (
                  <p
                    className="rounded-3xl px-6 py-8 text-center text-sm"
                    style={{
                      background: "rgba(255,255,255,.035)",
                      border: "1px solid var(--line)",
                      color: "var(--dim)",
                    }}
                  >
                    אין עדיין אימונים בתוכנית
                  </p>
                ) : (
                  phases.map((g) => (
                    <div key={g.phase} className="mb-6">
                      {/* המתאמן רואה את כל התוכנית מראש — כולל לאן הוא הולך */}
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="font-extrabold" style={{ color: "var(--wood-1)" }}>
                          שלב {g.phase}
                        </p>
                        <p className="text-left text-[11px]" style={{ color: "var(--faint)" }}>
                          שבועות {g.phase === 1 ? "1-4" : "5-8"} · 3 אימונים בשבוע
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {g.rows.map((w) => {
                          const id = String(w.id);
                          const past = history.get(id);
                          const isNext = id === nextWorkoutId;
                          return (
                            <Link
                              key={id}
                              href={`/client/workout/${id}`}
                              className="flex items-center gap-3 rounded-3xl p-4 transition active:scale-[.99]"
                              style={{
                                background: isNext
                                  ? "linear-gradient(135deg, rgba(180,133,79,.17), rgba(255,255,255,.035))"
                                  : "rgba(255,255,255,.035)",
                                border: `1px solid ${
                                  isNext ? "rgba(224,190,147,.48)" : "var(--line)"
                                }`,
                                boxShadow: isNext
                                  ? "0 18px 38px -24px rgba(180,133,79,.7)"
                                  : "none",
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                {isNext && (
                                  <span
                                    className="mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                                    style={{
                                      background: "rgba(180,133,79,.24)",
                                      border: "1px solid rgba(224,190,147,.45)",
                                      color: "var(--wood-1)",
                                    }}
                                  >
                                    הבא בתור
                                  </span>
                                )}
                                <p className="truncate text-lg font-extrabold">
                                  {String(w.title)}
                                </p>
                                <p className="text-sm" style={{ color: "var(--dim)" }}>
                                  {String(w.items)} תרגילים · חימום כלול
                                </p>
                                <p
                                  className="mt-0.5 text-xs"
                                  style={{ color: "var(--faint)" }}
                                >
                                  {past
                                    ? `בוצע ${past.times} פעמים · ${daysSince(past.last)}`
                                    : "עוד לא בוצע"}
                                </p>
                              </div>
                              <span
                                className="shrink-0 rounded-xl px-2.5 py-2 text-xs font-extrabold"
                                style={{
                                  background: isNext
                                    ? "var(--wood-2)"
                                    : "rgba(255,255,255,.055)",
                                  border: "1px solid var(--line)",
                                  color: isNext ? "#f7ebda" : "var(--wood-1)",
                                }}
                              >
                                לאימון
                              </span>
                            </Link>
                          );
                        })}
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
                          אותן חזרות, פחות סטים. 4 סטים הופכים ל-2, ו-3 הופכים לאחד או שניים.
                          גם אם אתה מרגיש רענן, עושים אותו.
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {/* בקשת מעבר לרמה הבאה. מוצג לכל תוכנית פעילה בנפרד. */}
                <LevelRequest
                  programId={String(p.id)}
                  programTitle={String(p.title)}
                  pending={pendingLevel.has(String(p.id))}
                />
                </div>
              </section>
            );
          })
        )}

      </div>
    </main>
  );
}
