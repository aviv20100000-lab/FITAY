import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import AssignPrograms from "./AssignPrograms";
import EditTrainee from "./EditTrainee";
import DeleteTrainee from "@/components/DeleteTrainee";
import { programLevelName } from "@/lib/program-levels";

export default async function TraineePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [
    traineeRes,
    programsRes,
    assignedRes,
    recentRes,
    progressRes,
    countsRes,
    pastWorkoutsRes,
  ] = await db.batch([
    { sql: "SELECT * FROM users WHERE id = ? AND role='trainee'", args: [id] },
    "SELECT id, title, level, is_template FROM programs ORDER BY is_template DESC, level",
    {
      sql: `SELECT a.*, p.title, p.level,
                   (SELECT COUNT(*) FROM completions c
                     WHERE c.trainee_id = a.trainee_id
                       AND c.program_id = a.program_id
                       AND c.completed_at >= a.assigned_at
                       AND c.completed_at <= COALESCE(a.completed_at, c.completed_at)) AS completed
              FROM assignments a JOIN programs p ON p.id = a.program_id
             WHERE a.trainee_id = ?
             ORDER BY a.status, a.assigned_at DESC`,
      args: [id],
    },
    {
      sql: `SELECT c.id, c.completed_at, c.pain_level, c.mood, c.notes, w.title
              FROM completions c LEFT JOIN workouts w ON w.id = c.workout_id
             WHERE c.trainee_id = ?
             ORDER BY c.completed_at DESC LIMIT 10`,
      args: [id],
    },
    // הצבירה: סך העבודה בכל תרגיל, אימון אחר אימון. בתרגיל חד־צדדי
    // נספר רק הצד החלש — הוא זה שקובע אם יש התקדמות אמיתית.
    {
      sql: `SELECT e.name, e.type, sl.logged_at,
                   SUM(COALESCE(sl.reps, sl.seconds)) AS total,
                   COUNT(*) AS sets
              FROM set_logs sl JOIN exercises e ON e.id = sl.exercise_id
             WHERE sl.trainee_id = ? AND (sl.side IS NULL OR sl.side = 'weak')
             GROUP BY sl.exercise_id, sl.logged_at
             ORDER BY e.name, sl.logged_at`,
      args: [id],
    },
    // מה בדיוק יימחק אם ימחקו את המתאמן. מוצג לפני הפעולה, במספרים אמיתיים.
    {
      sql: `SELECT
              (SELECT COUNT(*) FROM completions WHERE trainee_id = ?) AS completions,
              (SELECT COUNT(*) FROM set_logs   WHERE trainee_id = ?) AS sets`,
      args: [id, id],
    },
    // האימונים שבוצעו בריצות שהסתיימו, לפתיחת ההיסטוריה.
    // מסונן לריצות סגורות בלבד, כדי לא למשוך את כל ההיסטוריה של המתאמן
    // רק בשביל קטע שברוב הפעמים סגור.
    {
      sql: `SELECT c.id, c.program_id, c.completed_at, w.title
              FROM completions c
              LEFT JOIN workouts w ON w.id = c.workout_id
             WHERE c.trainee_id = ?
               AND EXISTS (
                 SELECT 1 FROM assignments a
                  WHERE a.trainee_id = c.trainee_id
                    AND a.program_id = c.program_id
                    AND a.status = 'completed'
                    AND c.completed_at >= a.assigned_at
                    AND c.completed_at <= a.completed_at
               )
             ORDER BY c.completed_at DESC`,
      args: [id],
    },
  ], "read");

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

  const activeAssignments = assignedRes.rows.filter((row) => String(row.status) === "active");
  const assignedIds = activeAssignments.map((r) => String(r.program_id));
  // ריצות שהסתיימו. השאילתה כבר מסדרת מהחדשה לישנה.
  const pastAssignments = assignedRes.rows.filter((row) => String(row.status) === "completed");

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
        <BackLink href="/coach" className="mb-6">
          חזרה לרשימת המתאמנים
        </BackLink>

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

        {activeAssignments.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-xl font-black">המסלול הנוכחי</h2>
            <div className="space-y-3">
              {activeAssignments.map((assignment) => {
                const completed = Number(assignment.completed ?? 0);
                const target = Number(assignment.target_sessions ?? 24);
                const checkStatus = String(assignment.initial_check_status ?? "not_ready");
                return (
                  <div
                    key={String(assignment.id)}
                    className="rounded-[1.7rem] border border-[#b4854f]/30 bg-[#b4854f]/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black">{String(assignment.title)}</p>
                        <p className="mt-1 text-xs text-[var(--wood-1)]">
                          {programLevelName(Number(assignment.level))}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs font-bold">
                        {assignment.sessions_per_week
                          ? `${String(assignment.sessions_per_week)} בשבוע`
                          : "טרם בחר קצב"}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-sm font-extrabold">
                      <span>{completed} מתוך {target} אימונים</span>
                      <span style={{ color: "var(--dim)" }}>
                        {checkStatus === "approved"
                          ? "פתיחה אושרה"
                          : checkStatus === "pending"
                            ? "מחכה לאישור פתיחה"
                            : "לפני בדיקת פתיחה"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/20">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#e0be93] to-[#9a6738]"
                        style={{ width: `${Math.min(100, (completed / target) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/*
          שכבת פתיחה אחת ולא שתיים. קודם היה קטע מכווץ שבתוכו כרטיסים
          מכווצים, כלומר שלוש לחיצות עד לאימון והכל באותו משקל אפור.
          עכשיו כל ריצה היא כרטיס בשפה של "המסלול הנוכחי", עמום יותר כי
          היא הסתיימה, ולחיצה אחת פותחת את האימונים שלה.
        */}
        {pastAssignments.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-xl font-black">תוכניות קודמות</h2>
            <div className="space-y-2.5">
              {pastAssignments.map((assignment) => {
                // האימונים של הריצה הזאת בלבד, לפי חלון הזמן שלה. אותה
                // תוכנית יכולה לרוץ יותר מפעם אחת, ובלי החלון היו מתערבבות.
                // הסדר הפוך לכרונולוגי, כדי שהמספור יקרא כמו יומן.
                const runWorkouts = pastWorkoutsRes.rows
                  .filter(
                    (c) =>
                      String(c.program_id) === String(assignment.program_id) &&
                      String(c.completed_at) >= String(assignment.assigned_at) &&
                      String(c.completed_at) <= String(assignment.completed_at)
                  )
                  .reverse();

                const started = new Date(
                  String(assignment.assigned_at)
                ).toLocaleDateString("he-IL");
                const ended = assignment.completed_at
                  ? new Date(String(assignment.completed_at)).toLocaleDateString("he-IL")
                  : null;

                return (
                  <details
                    key={String(assignment.id)}
                    className="group/run overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[.03]"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#b4854f]/15 text-base font-black text-[var(--wood-1)]">
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-extrabold">
                          {String(assignment.title)}
                        </span>
                        <span
                          className="mt-0.5 block text-xs"
                          style={{ color: "var(--dim)" }}
                        >
                          {programLevelName(Number(assignment.level))} ·{" "}
                          {String(assignment.completed)} אימונים
                        </span>
                        <span
                          className="mt-0.5 block text-[11px]"
                          style={{ color: "var(--faint)" }}
                        >
                          {ended ? `${started} עד ${ended}` : `התחיל ב-${started}`}
                        </span>
                      </span>
                      <span
                        className="shrink-0 text-xs transition-transform group-open/run:rotate-180"
                        style={{ color: "var(--dim)" }}
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    </summary>

                    {runWorkouts.length === 0 ? (
                      <p
                        className="border-t border-white/8 px-4 py-3 text-xs"
                        style={{ color: "var(--faint)" }}
                      >
                        אין אימונים שמורים בריצה הזאת.
                      </p>
                    ) : (
                      <div className="border-t border-white/8 bg-black/15">
                        {runWorkouts.map((c, i) => (
                          <Link
                            key={String(c.id)}
                            href={`/coach/completions/${String(c.id)}`}
                            className="flex items-center gap-3 px-4 py-3 transition active:scale-[.995]"
                            style={{
                              borderTop: i === 0 ? "none" : "1px solid var(--line)",
                            }}
                          >
                            {/* המספר נותן קצב לרשימה. בלעדיו 24 שורות
                                נראות זהות ואי אפשר לאחוז בהן בעין. */}
                            <span
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black tabular-nums"
                              style={{
                                background: "rgba(255,255,255,.05)",
                                border: "1px solid var(--line)",
                                color: "var(--dim)",
                              }}
                            >
                              {i + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-bold">
                              {c.title ? String(c.title) : "אימון"}
                            </span>
                            <span
                              className="shrink-0 text-[11px] tabular-nums"
                              style={{ color: "var(--dim)" }}
                            >
                              {new Date(String(c.completed_at)).toLocaleDateString("he-IL")}
                            </span>
                            <span
                              className="shrink-0 text-sm"
                              style={{ color: "var(--wood-1)" }}
                              aria-hidden="true"
                            >
                              ←
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          </section>
        )}

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
              סך החזרות או השניות בכל תרגיל, מאימון לאימון. כשהמספר עולה
              לאורך זמן, יש התקדמות.
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
