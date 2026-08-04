import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import LevelRequest from "@/components/LevelRequest";
import ProgramSetup from "@/components/ProgramSetup";
import LockedWorkoutCard from "@/components/LockedWorkoutCard";
import { programLevelName } from "@/lib/program-levels";

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

  const [programs, workouts, done, perWorkout, openRequests, completedPrograms] =
    await db.batch([
    {
      sql: `SELECT p.id, p.title, p.level, p.weeks,
                   a.sessions_per_week, a.target_sessions, a.initial_check_status,
                   (SELECT COUNT(*) FROM completions c
                     WHERE c.trainee_id = a.trainee_id
                       AND c.program_id = a.program_id
                       AND c.completed_at >= a.assigned_at) AS completed,
                   (SELECT COUNT(DISTINCT sl.exercise_id)
                      FROM set_logs sl JOIN workouts sw ON sw.id = sl.workout_id
                     WHERE sl.trainee_id = a.trainee_id
                       AND sw.program_id = a.program_id
                       AND sl.logged_at >= a.assigned_at) AS exercises_done
              FROM assignments a JOIN programs p ON p.id = a.program_id
             WHERE a.trainee_id = ? AND a.status = 'active'
             ORDER BY a.assigned_at`,
      args: [user.id],
    },
    {
      sql: `SELECT w.id, w.title, w.phase, w.program_id,
                   (SELECT COUNT(*) FROM workout_items i WHERE i.workout_id = w.id) AS items
              FROM workouts w
             WHERE w.program_id IN (
               SELECT program_id FROM assignments WHERE trainee_id = ? AND status = 'active'
             )
             ORDER BY w.phase, w.position`,
      args: [user.id],
    },
    {
      sql: "SELECT COUNT(*) c FROM completions WHERE trainee_id = ?",
      args: [user.id],
    },
    // כמה פעמים בוצע כל אימון ומתי לאחרונה — כדי לדעת מה הבא בתור.
    {
      sql: `SELECT c.workout_id, COUNT(*) AS times, MAX(c.completed_at) AS last
              FROM completions c
              JOIN assignments a
                ON a.trainee_id = c.trainee_id
               AND a.program_id = c.program_id
               AND a.status = 'active'
             WHERE c.trainee_id = ? AND c.completed_at >= a.assigned_at
             GROUP BY c.workout_id`,
      args: [user.id],
    },
    // בקשות מעבר רמה שעדיין ממתינות, כדי לא להציע לבקש פעמיים.
    {
      sql: "SELECT from_program_id FROM level_requests WHERE trainee_id = ? AND status = ?",
      args: [user.id, "pending"],
    },
    // תוכניות שהסתיימו. נשארת כאן ולא מאחורי Suspense: לרוב המתאמנים
    // אין אף אחת, ופיצול שלה החוצה שילם סבב רשת נוסף רק כדי להבהב שלד
    // שמתחלף בכלום.
    {
      sql: `SELECT a.id, p.title, p.level, a.completed_at,
                   (SELECT COUNT(*) FROM completions c
                     WHERE c.trainee_id = a.trainee_id
                       AND c.program_id = a.program_id
                       AND c.completed_at >= a.assigned_at
                       AND c.completed_at <= COALESCE(a.completed_at, c.completed_at)) AS completed
              FROM assignments a JOIN programs p ON p.id = a.program_id
             WHERE a.trainee_id = ? AND a.status = 'completed'
             ORDER BY a.completed_at DESC`,
      args: [user.id],
    },
  ], "read");

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
        <section
          className="relative mb-5 overflow-hidden rounded-[2rem] border border-white/10 px-5 pb-5 pt-6"
          style={{ background: "var(--panel)", boxShadow: "var(--panel-shadow)" }}
        >
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
            const completed = Number(p.completed ?? 0);
            const target = Number(p.target_sessions ?? 24);
            const sessionsPerWeek =
              p.sessions_per_week == null ? null : Number(p.sessions_per_week);
            const initialStatus = String(p.initial_check_status ?? "not_ready");
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
                className="mb-7 overflow-hidden rounded-[2rem] border border-white/10"
                style={{ background: "var(--panel)", boxShadow: "var(--panel-shadow)" }}
              >
                <div
                  className="relative overflow-hidden px-5 py-5"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(180,133,79,.16), var(--soft-1) 68%)",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span className="absolute -left-4 -top-12 text-[8rem] font-black leading-none text-white/[.025]">
                    {String(p.level).padStart(2, "0")}
                  </span>
                  <div className="relative mb-3 flex items-center justify-between gap-3">
                    <span
                      className="rounded-full px-3 py-1 text-xs font-extrabold"
                      style={{
                        background: "rgba(180,133,79,.2)",
                        border: "1px solid rgba(224,190,147,.32)",
                        color: "var(--wood-1)",
                      }}
                    >
                      {programLevelName(Number(p.level))}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
                      {completed} מתוך {target} אימונים
                    </span>
                  </div>
                  <h3 className="relative text-2xl font-black leading-tight tracking-[-.025em]">
                    {String(p.title)}
                  </h3>
                </div>

                <div className="p-4 pb-3">
                <div className="mb-4 overflow-hidden rounded-2xl border border-white/8 bg-black/15 p-3.5">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold">
                    <span>ההתקדמות שלך</span>
                    <span style={{ color: "var(--wood-1)" }}>
                      {Math.min(completed, target)} / {target}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--soft-4)" }}>
                    <div
                      className="wood h-full rounded-full"
                      style={{ width: `${Math.min(100, (completed / target) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
                    {sessionsPerWeek
                      ? `${sessionsPerWeek} אימונים בשבוע · בערך ${
                          sessionsPerWeek === 3 ? 8 : 6
                        } שבועות`
                      : "בחר קצב כדי לראות כמה זמן התוכנית צפויה לקחת"}
                  </p>
                </div>

                <ProgramSetup
                  programId={String(p.id)}
                  sessionsPerWeek={sessionsPerWeek}
                  exercisesDone={Number(p.exercises_done ?? 0)}
                  initialStatus={initialStatus}
                />

                {mine.length === 0 ? (
                  <p
                    className="rounded-3xl px-6 py-8 text-center text-sm"
                    style={{
                      background: "var(--soft-1)",
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
                          <span
                            className="grid h-8 w-8 place-items-center rounded-xl border border-[#b4854f]/25 bg-[#b4854f]/10 text-xs font-black"
                            style={{ color: "var(--wood-1)" }}
                          >
                            {String(g.phase).padStart(2, "0")}
                          </span>
                          <p className="text-sm font-extrabold">שלב {g.phase}</p>
                        </div>
                        <p className="text-left text-xs" style={{ color: "var(--faint)" }}>
                          חלק {g.phase} מתוך 2
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {g.rows.map((w, workoutIndex) => {
                          const id = String(w.id);
                          const past = history.get(id);
                          const isNext = id === nextWorkoutId;
                          const blockedReason = !sessionsPerWeek
                            ? "האימון ייפתח אחרי בחירת קצב אימונים."
                            : initialStatus === "pending"
                              ? "האימון ייפתח אחרי שהמאמן יאשר את בדיקת הפתיחה."
                              : completed >= target
                                ? "האימון סגור כי התוכנית הושלמה."
                                : null;
                          const cardStyle = {
                            background: isNext
                              ? "linear-gradient(135deg, rgba(180,133,79,.17), var(--soft-1))"
                              : "var(--soft-1)",
                            border: `1px solid ${
                              isNext ? "rgba(224,190,147,.48)" : "var(--line)"
                            }`,
                            boxShadow: isNext
                              ? "0 18px 38px -24px rgba(180,133,79,.7)"
                              : "none",
                          };
                          const cardContent = (
                            <>
                              <span
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black"
                                style={{
                                  background: isNext
                                    ? "rgba(180,133,79,.18)"
                                    : "var(--soft-2)",
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
                                    className="mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
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
                              {/*
                                כרטיס חסום לא מוביל לשום מקום, ולכן התג עליו
                                אומר שהוא נעול במקום להזמין ללחוץ.
                              */}
                              <span
                                className="shrink-0 rounded-xl px-2.5 py-2 text-xs font-extrabold"
                                style={{
                                  background:
                                    isNext && !blockedReason
                                      ? "var(--wood-2)"
                                      : "var(--soft-2)",
                                  border: "1px solid var(--line)",
                                  color: blockedReason
                                    ? "var(--faint)"
                                    : isNext
                                      ? "#f7ebda"
                                      : "var(--wood-1)",
                                }}
                              >
                                {blockedReason ? "נעול" : "לאימון"}
                              </span>
                            </>
                          );

                          if (blockedReason) {
                            return (
                              <LockedWorkoutCard
                                key={id}
                                reason={blockedReason}
                                style={cardStyle}
                              >
                                {cardContent}
                              </LockedWorkoutCard>
                            );
                          }

                          return (
                            <Link
                              key={id}
                              href={`/client/workout/${id}`}
                              className="flex items-center gap-3 rounded-[1.4rem] p-3.5 transition active:scale-[.99]"
                              style={cardStyle}
                            >
                              {cardContent}
                            </Link>
                          );
                        })}
                      </div>

                    </div>
                  ))
                )}
                {/*
                  שבוע התאוששות אחרי כל שלב, לא אופציונלי לפי החוברת.
                  מוצג פעם אחת ולא בתוך הלולאה: הכרטיס זהה לחלוטין בכל
                  שלב, ושתי הופעות של אותו טקסט הן חצי מסך של כפילות.
                */}
                {mine.length > 0 && <RecoveryCard />}
                {/* בקשת מעבר לרמה הבאה. מוצג לכל תוכנית פעילה בנפרד. */}
                {completed >= target && initialStatus === "approved" ? (
                  <LevelRequest
                    programId={String(p.id)}
                    programTitle={String(p.title)}
                    pending={pendingLevel.has(String(p.id))}
                  />
                ) : (
                  <div className="mb-1 rounded-[1.4rem] border border-white/8 bg-white/[.03] px-4 py-3.5">
                    <p className="text-sm font-extrabold">
                      {initialStatus === "pending"
                        ? "מחכים לאישור הפתיחה"
                        : initialStatus !== "approved"
                          ? "קודם מסיימים את בדיקת הפתיחה"
                          : `נשארו עוד ${Math.max(0, target - completed)} אימונים`}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
                      בקשת מעבר תיפתח רק כשהתוכנית תושלם.
                    </p>
                  </div>
                )}
                </div>
              </section>
            );
          })
        )}

        <CompletedProgramsHistory rows={completedPrograms.rows} />

      </div>
    </main>
  );
}

function CompletedProgramsHistory({
  rows,
}: {
  rows: Awaited<ReturnType<typeof db.execute>>["rows"];
}) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-black">תוכניות שסיימתי</h2>
        <span className="h-px flex-1 bg-gradient-to-l from-white/15 to-transparent" />
      </div>
      <div className="space-y-2">
        {rows.map((program) => (
          <div
            key={String(program.id)}
            className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[.035] px-4 py-3.5"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#b4854f]/15 font-black text-[var(--wood-1)]">
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">{String(program.title)}</p>
              {/* התאריך מבדיל בין ריצות חוזרות של אותה תוכנית. */}
              <p className="text-xs" style={{ color: "var(--dim)" }}>
                {programLevelName(Number(program.level))} · {String(program.completed)} אימונים
                {program.completed_at
                  ? ` · הסתיים ב-${new Date(String(program.completed_at)).toLocaleDateString("he-IL")}`
                  : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 px-3 py-3.5 text-center">
      <b className="block text-2xl font-black wood-text">{value}</b>
      <span className="mt-0.5 block text-xs font-semibold text-white/45">
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
    <aside
      className="relative mt-4 overflow-hidden rounded-[1.6rem] border border-[#7fa1c5]/30 shadow-[0_22px_48px_-34px_rgba(107,143,181,.8)]"
      style={{
        background:
          "linear-gradient(145deg, rgba(107,143,181,.16), var(--recovery-base) 64%)",
      }}
    >
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
          <span
            className="flex items-center gap-1.5 text-xs font-extrabold tracking-[.08em]"
            style={{ color: "var(--recovery-text)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#91afd0]" />
            חלק מהתוכנית
          </span>
          <span
            className="rounded-full border border-[#91afd0]/25 bg-[#6b8fb5]/10 px-2.5 py-1 text-xs font-extrabold"
            style={{ color: "var(--recovery-text)" }}
          >
            בסיום כל שלב
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

      <p className="relative mx-4 my-3 border-r-2 border-[#91afd0]/50 pr-3 text-xs font-semibold leading-5 text-white/60">
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
      <strong
        className="shrink-0 rounded-lg bg-[#6b8fb5]/14 px-2.5 py-1 text-xs font-black"
        style={{ color: "var(--recovery-strong)" }}
      >
        {value}
      </strong>
    </div>
  );
}
