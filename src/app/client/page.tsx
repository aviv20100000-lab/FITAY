import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import LevelRequest from "@/components/LevelRequest";
import ProgramSetup from "@/components/ProgramSetup";
import LockedWorkoutCard from "@/components/LockedWorkoutCard";
import { programLevelName } from "@/lib/program-levels";
import { getLevelCheckState } from "@/lib/level-check";
import { isRecoverySession } from "@/lib/progression";
import { getTrainingDayWindow } from "@/lib/training-days";
import WeekStrip from "@/components/WeekStrip";
import { Bidi } from "@/components/Bidi";

function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Jerusalem",
    }).format(new Date())
  );
  if (h < 11) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

function israelDayNumber(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
}

export default async function ClientHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  const [programs, workouts, done, perWorkout, openRequests, coachRow] =
    await db.batch([
    {
      sql: `SELECT p.id, p.title, p.level, p.weeks,
                   a.sessions_per_week, a.target_sessions,
                   (SELECT COUNT(*) FROM completions c
                     WHERE c.trainee_id = a.trainee_id
                       AND c.program_id = a.program_id
                       AND c.completed_at >= a.assigned_at) AS completed
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
    // התוכניות שהסתיימו ירדו מכאן ועברו ללשונית ההישגים. הבית עונה על
    // מה עושים היום, והן תיעוד של מה שכבר נעשה.
    {
      sql: "SELECT phone FROM users WHERE role = 'coach' AND active = 1 LIMIT 1",
      args: [],
    },
  ], "read");

  /*
   * מצב בדיקת הרמה נשלף דרך אותה פונקציה שהשרת בודק לפיה, ולא בשאילתה
   * נפרדת כאן. שתי גרסאות של הכלל "אילו ארבעה תרגילים" נגמרות במסך שמציג
   * תרגיל אחד ובשרת שדורש אחר.
   *
   * רק לתוכניות שכבר הושלמו. לפני זה אין מה לצלם, ואין סיבה לשלם על סבב
   * רשת נוסף בכל טעינה של מסך הבית.
   */
  const finishedPrograms = programs.rows.filter(
    (p) =>
      Number(p.completed ?? 0) >= Number(p.target_sessions ?? 24)
  );
  const levelStates = new Map(
    await Promise.all(
      finishedPrograms.map(
        async (p) =>
          [String(p.id), await getLevelCheckState(user.id, String(p.id))] as const
      )
    )
  );

  // ההערה של איתי כשהוא החזיר לצילום מחדש. הבקשה עצמה כבר לא 'pending',
  // ולכן היא לא נספרת כבקשה פתוחה ולא חוסמת שליחה חדשה.
  const returnedNotes = new Map(
    (
      await db.execute({
        sql: `SELECT from_program_id, coach_note FROM level_requests
               WHERE trainee_id = ? AND status = 'returned'`,
        args: [user.id],
      })
    ).rows.map((r) => [String(r.from_program_id), String(r.coach_note ?? "")])
  );

  const trainingDays = await getTrainingDayWindow(user.id);

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
   *
   * לכל תוכנית משלה. קודם זה חושב על כל האימונים של כל התוכניות הפעילות
   * יחד, ולכן למתאמן עם שתי תוכניות רק אחת מהן קיבלה תג "הבא בתור",
   * והשנייה נראתה כאילו אין בה מה לעשות.
   */
  const nextWorkoutByProgram = new Map<string, string>();
  for (const w of workouts.rows) {
    const programId = String(w.program_id);
    const best = nextWorkoutByProgram.get(programId);
    if (best == null) {
      nextWorkoutByProgram.set(programId, String(w.id));
      continue;
    }
    const times = history.get(String(w.id))?.times ?? 0;
    const bestTimes = history.get(best)?.times ?? 0;
    if (times < bestTimes) nextWorkoutByProgram.set(programId, String(w.id));
  }

  const daysSince = (iso: string) => {
    const days = israelDayNumber(new Date()) - israelDayNumber(new Date(iso));
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
              <HomeStat value={doneCount} label={doneCount === 1 ? "אימון הושלם" : "אימונים הושלמו"} />
              <span className="my-3 w-px bg-white/8" />
              <HomeStat
                value={programs.rows.length}
                label={programs.rows.length === 1 ? "תוכנית משויכת" : "תוכניות משויכות"}
              />
            </div>
          </div>
        </section>

        {/*
          רצועת השבוע יושבת בין הפאנל העליון לכותרת התוכניות, כי היא ברמת
          המתאמן ולא ברמת התוכנית. בתוך מקטע תוכנית היא הייתה מופיעה פעמיים
          למי שיש לו שתי תוכניות פעילות.

          מוצגת רק כשיש תוכנית עם קצב שנבחר. לפני זה כל האימונים נעולים,
          ורצועת תכנון מעל מסך נעול מזמינה לתכנן משהו שאי אפשר לפתוח.
        */}
        {programs.rows.some((p) => p.sessions_per_week != null) && (
          <WeekStrip
            planned={trainingDays.planned}
            completedAt={trainingDays.completedAt}
          />
        )}

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
            {(() => {
              const coachPhone = coachRow.rows[0]?.phone
                ? String(coachRow.rows[0].phone)
                : null;
              const links = coachPhone ? contactLinks(coachPhone) : null;
              if (!links) return null;
              return (
                <div className="mt-5 flex gap-2">
                  <a
                    href={links.tel}
                    className="min-h-11 flex-1 rounded-2xl px-3 py-3 text-center text-sm font-bold"
                    style={{ background: "var(--soft-2)", border: "1px solid var(--line)", color: "var(--wood-1)" }}
                  >
                    חיוג לאיתי
                  </a>
                  <a
                    href={links.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-11 flex-1 rounded-2xl px-3 py-3 text-center text-sm font-bold"
                    style={{ background: "rgba(37,211,102,.12)", border: "1px solid rgba(37,211,102,.32)", color: "#72dfa0" }}
                  >
                    WhatsApp
                  </a>
                </div>
              );
            })()}
          </div>
        ) : (
          programs.rows.map((p) => {
            const completed = Number(p.completed ?? 0);
            const target = Number(p.target_sessions ?? 24);
            const sessionsPerWeek =
              p.sessions_per_week == null ? null : Number(p.sessions_per_week);
            const levelState = levelStates.get(String(p.id)) ?? null;
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
                      /* תג ממוסגר מרובע, לא גלולה. החתימה של FITAY. */
                      className="rounded-lg px-2.5 py-1 text-xs font-extrabold"
                      style={{
                        background: "rgba(180,133,79,.12)",
                        border: "1px solid rgba(180,133,79,.4)",
                        color: "var(--wood-1)",
                      }}
                    >
                      {programLevelName(Number(p.level))}
                    </span>
                    {sessionsPerWeek && (
                      <span className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
                        <Bidi text={`${completed} מתוך ${target} אימונים`} />
                      </span>
                    )}
                  </div>
                  <h3 className="relative text-2xl font-black leading-tight tracking-[-.025em]">
                    {String(p.title)}
                  </h3>
                </div>

                <div className="p-4 pb-3">
                {sessionsPerWeek && (
                  <div className="mb-4 overflow-hidden rounded-2xl border border-white/8 bg-black/15 p-3.5">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold">
                      <span>ההתקדמות שלך</span>
                      <span style={{ color: "var(--wood-1)" }}>
                        <Bidi text={`${Math.min(completed, target)} / ${target}`} />
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--soft-4)" }}>
                      <div
                        className="wood h-full rounded-full"
                        style={{ width: `${Math.min(100, (completed / target) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
                      {/*
                        התוכנית נמדדת באימונים ולא בשבועות. הקצב שהמתאמן
                        בחר קובע כמה מהר הוא מגיע ל-24, והוא לא הופך את
                        התוכנית לארוכה או לקצרה יותר.
                      */}
                      {`קצב של ${sessionsPerWeek} אימונים בשבוע · נשארו ${Math.max(
                        0,
                        target - completed
                      )} מתוך ${target}`}
                    </p>
                  </div>
                )}

                <ProgramSetup
                  programId={String(p.id)}
                  sessionsPerWeek={sessionsPerWeek}
                />

                {sessionsPerWeek && (mine.length === 0 ? (
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
                          const isNext =
                            id === nextWorkoutByProgram.get(String(p.id));
                          const blockedReason = !sessionsPerWeek
                            ? "האימון ייפתח אחרי בחירת קצב אימונים."
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
                                    className="mb-1.5 inline-block rounded-lg px-2.5 py-0.5 text-xs font-bold"
                                    style={{
                                      background: "rgba(180,133,79,.12)",
                                      border: "1px solid rgba(180,133,79,.4)",
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
                                    ? past.times === 1
                                      ? `בוצע פעם אחת · ${daysSince(past.last)}`
                                      : `בוצע ${past.times} פעמים · ${daysSince(past.last)}`
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
                ))}
                {/*
                  חלון ההתאוששות: אחרי כל 12 אימונים באים שני אימונים
                  מוקלים, והם נספרים בתוך ה-24. הכרטיס מוצג רק בתוך
                  החלון, כי הספירה קובעת — כל אימון שנפתח בזמן החלון
                  יהיה מוקל, לא רק "הבא בתור".
                */}
                {mine.length > 0 &&
                  sessionsPerWeek != null &&
                  completed < target &&
                  isRecoverySession(completed) && (
                    <RecoveryWindowCard
                      remaining={2 - (completed % 12)}
                    />
                  )}
                {/* בקשת מעבר לרמה הבאה. מוצג לכל תוכנית פעילה בנפרד. */}
                {/*
                  בדיקת הרמה נפתחת רק בסיום התוכנית. עד אז אין מה לצלם,
                  והמסך אומר כמה נשאר במקום להציג בלוק ריק.
                */}
                {sessionsPerWeek && (completed >= target && levelState ? (
                  <LevelRequest
                    programId={String(p.id)}
                    programTitle={String(p.title)}
                    pending={pendingLevel.has(String(p.id))}
                    assignmentId={levelState.assignmentId}
                    exercises={levelState.exercises}
                    videosReady={levelState.ready}
                    coachNote={returnedNotes.get(String(p.id)) ?? ""}
                  />
                ) : (
                  <div className="mb-1 rounded-[1.4rem] border border-white/8 bg-white/[.03] px-4 py-3.5">
                    <p className="text-sm font-extrabold">
                      נשארו עוד {Math.max(0, target - completed)} אימונים
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
                      בסיום התוכנית תצלם ארבעה תרגילים ותשלח בקשת מעבר.
                    </p>
                  </div>
                ))}
                </div>
              </section>
            );
          })
        )}

      </div>
    </main>
  );
}

/** קישורי חיוג ו-WhatsApp למאמן, מאותו מנגנון שמשמש את המאמן מול המתאמנים שלו. */
function contactLinks(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
  const international = local.startsWith("0") ? `972${local.slice(1)}` : local;
  return { tel: `tel:${local}`, whatsapp: `https://wa.me/${international}` };
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

/**
 * הכרטיס שמוצג בזמן חלון ההתאוששות. האפליקציה כבר מקטינה את הסטים
 * באימונים עצמם, ולכן אין כאן טבלת כללים — רק הסבר מה קורה עכשיו.
 */
function RecoveryWindowCard({ remaining }: { remaining: number }) {
  return (
    <aside className="glass relative mt-4 overflow-hidden rounded-3xl">
      <span
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-[#e0be93]/60 to-transparent"
        aria-hidden="true"
      />
      <div className="relative px-4 pb-4 pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span
            className="flex items-center gap-1.5 text-xs font-extrabold tracking-[.08em] wood-text"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#b4854f]" />
            חלק מהתוכנית
          </span>
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-extrabold"
            style={{
              background: "rgba(180,133,79,.12)",
              border: "1px solid rgba(180,133,79,.4)",
              color: "var(--wood-1)",
            }}
          >
            {remaining === 1 ? "נשאר אימון אחד" : "נשארו 2 אימונים"}
          </span>
        </div>
        <h4 className="text-lg font-black tracking-[-.02em] text-white">
          אימוני התאוששות
        </h4>
        <p className="mt-1 text-xs leading-5 text-white/55">
          {remaining === 1
            ? "האימון הבא מוקל: אותם תרגילים, חצי מהסטים, אותן חזרות. הוא נספר בתוך התוכנית."
            : "שני האימונים הבאים מוקלים: אותם תרגילים, חצי מהסטים, אותן חזרות. הם נספרים בתוך התוכנית."}
        </p>
        <p className="mt-2 border-r-2 border-[#b4854f]/50 pr-3 text-xs font-semibold leading-5 text-white/60">
          לא מדלגים על האימונים האלה, גם כשמרגישים טוב.
        </p>
      </div>
    </aside>
  );
}
