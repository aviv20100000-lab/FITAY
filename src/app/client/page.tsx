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
        <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[#12100e] px-5 pb-5 pt-6 shadow-[0_30px_70px_-42px_rgba(180,133,79,.75)]">
          <HomeRings />
          <div className="relative">
            <p className="text-xs font-bold text-white/50">{greeting()}</p>
            <h1 className="mt-1 text-[2.15rem] font-black leading-none tracking-[-.04em]">
              {user.name}
            </h1>

            <div className="mt-6 flex items-stretch rounded-2xl border border-white/8 bg-black/15">
              <HomeStat value={doneCount} label="אימונים הושלמו" />
              <span className="my-3 w-px bg-white/8" />
              <HomeStat value={programs.rows.length} label="תוכניות משויכות" />
            </div>
          </div>
        </section>

        <PushToggle hint="נזכיר לך אם יעברו כמה ימים בלי אימון." />

        {programs.rows.length > 0 && (
          <div className="mb-4 mt-8 flex items-center gap-3">
            <h2 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
              התוכניות <span className="wood-text">שלי</span>
            </h2>
            <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
          </div>
        )}

        {programs.rows.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-12 text-center">
            <p className="mb-2 text-lg font-semibold">עוד אין לך תוכנית</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              כשתשויך לך תוכנית ב-FITAY, היא תופיע כאן.
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
                className="mb-7 overflow-hidden rounded-[2rem] border border-white/10 bg-[#12100e] shadow-[0_28px_65px_-42px_rgba(0,0,0,.95)]"
              >
                <div
                  className="relative overflow-hidden px-5 py-5"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(180,133,79,.16), rgba(255,255,255,.015) 68%)",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span className="absolute -left-4 -top-12 text-[8rem] font-black leading-none text-white/[.025]">
                    {String(p.level).padStart(2, "0")}
                  </span>
                  <div className="relative mb-3 flex items-center justify-between gap-3">
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
                  <h3 className="relative text-2xl font-black leading-tight tracking-[-.025em]">
                    {String(p.title)}
                  </h3>
                </div>

                <div className="p-4 pb-3">

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
                    <div key={g.phase} className="mb-7">
                      {/* המתאמן רואה את כל התוכנית מראש — כולל לאן הוא הולך */}
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 place-items-center rounded-xl border border-[#b4854f]/25 bg-[#b4854f]/10 text-[11px] font-black text-[#d5a974]">
                            {String(g.phase).padStart(2, "0")}
                          </span>
                          <p className="text-sm font-extrabold">שלב {g.phase}</p>
                        </div>
                        <p className="text-left text-[11px]" style={{ color: "var(--faint)" }}>
                          שבועות {g.phase === 1 ? "1-4" : "5-8"} · 3 אימונים בשבוע
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {g.rows.map((w, workoutIndex) => {
                          const id = String(w.id);
                          const past = history.get(id);
                          const isNext = id === nextWorkoutId;
                          return (
                            <Link
                              key={id}
                              href={`/client/workout/${id}`}
                              className="flex items-center gap-3 rounded-[1.4rem] p-3.5 transition active:scale-[.99]"
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
                              <span
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black"
                                style={{
                                  background: isNext
                                    ? "rgba(180,133,79,.18)"
                                    : "rgba(255,255,255,.045)",
                                  border: `1px solid ${
                                    isNext ? "rgba(224,190,147,.28)" : "var(--line)"
                                  }`,
                                  color: isNext ? "var(--wood-1)" : "var(--faint)",
                                }}
                              >
                                {workoutIndex + 1}
                              </span>
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
                                <p className="truncate text-[15px] font-extrabold">
                                  {String(w.title)}
                                </p>
                                <p className="text-xs" style={{ color: "var(--dim)" }}>
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
                                className="shrink-0 rounded-xl px-2.5 py-2 text-[11px] font-extrabold"
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
                      <RecoveryCard />
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

function HomeStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 px-3 py-3.5 text-center">
      <b className="block text-2xl font-black wood-text">{value}</b>
      <span className="mt-0.5 block text-[10px] font-semibold text-white/45">
        {label}
      </span>
    </div>
  );
}

function HomeRings() {
  return (
    <div className="pointer-events-none absolute -left-9 -top-8 opacity-20" aria-hidden="true">
      <div className="h-32 w-32 rounded-full border-[14px] border-[#b4854f]/35" />
      <div className="-mt-20 ml-10 h-20 w-20 rounded-full border-[9px] border-[#e0be93]/35" />
    </div>
  );
}

function RecoveryCard() {
  return (
    <aside className="relative mt-4 overflow-hidden rounded-[1.6rem] border border-[#7fa1c5]/30 bg-[linear-gradient(145deg,rgba(107,143,181,.16),rgba(18,16,14,.88)_64%)] shadow-[0_22px_48px_-34px_rgba(107,143,181,.8)]">
      <span
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-[#a9c3df]/70 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-12 -top-16 h-40 w-40 rounded-full bg-[#6b8fb5]/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative px-4 pb-3 pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.08em] text-[#a9c3df]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#91afd0]" />
            חלק מהתוכנית
          </span>
          <span className="rounded-full border border-[#91afd0]/25 bg-[#6b8fb5]/10 px-2.5 py-1 text-[10px] font-extrabold text-[#a9c3df]">
            בסיום השלב
          </span>
        </div>
        <h4 className="text-lg font-black tracking-[-.02em] text-white">
          שבוע התאוששות
        </h4>
        <p className="mt-1 text-xs leading-5 text-white/55">
          שבוע קל יותר שמוריד עומס ועוזר לגוף להגיע מוכן לשלב הבא.
        </p>
      </div>

      <div className="relative mx-3 overflow-hidden rounded-2xl border border-[#91afd0]/15 bg-black/20">
        <RecoveryRule label="מספר החזרות" value="נשאר כמו בתוכנית" />
        <RecoveryRule label="אם כתובים 4 סטים" value="מבצעים 2" />
        <RecoveryRule label="אם כתובים 3 סטים" value="מבצעים 1–2" last />
      </div>

      <p className="relative mx-4 my-3 border-r-2 border-[#91afd0]/50 pr-3 text-[11px] font-semibold leading-5 text-white/60">
        לא מדלגים על השבוע הזה, גם כשמרגישים טוב.
      </p>
    </aside>
  );
}

function RecoveryRule({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3.5 py-3 ${
        last ? "" : "border-b border-[#91afd0]/10"
      }`}
    >
      <span className="text-xs font-semibold text-white/55">{label}</span>
      <strong className="shrink-0 rounded-lg bg-[#6b8fb5]/14 px-2.5 py-1 text-[11px] font-black text-[#b8cde3]">
        {value}
      </strong>
    </div>
  );
}
