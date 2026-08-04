import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";

export const metadata = { title: "התקדמות · FITAY" };

const LEGACY_MOODS: Record<string, string> = {
  easy: "קל",
  good: "מתאים",
  suitable: "מתאים",
  medium: "מתאים",
  hard: "קשה",
  קל: "קל",
  מתאים: "מתאים",
  קשה: "קשה",
};

export default async function ProgressPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  const [progressRes, recentRes] = await Promise.all([
    db.execute({
      sql: `SELECT e.name, e.type, sl.logged_at,
                   SUM(COALESCE(sl.reps, sl.seconds)) AS total
              FROM set_logs sl JOIN exercises e ON e.id = sl.exercise_id
             WHERE sl.trainee_id = ? AND (sl.side IS NULL OR sl.side = 'weak')
             GROUP BY sl.exercise_id, sl.logged_at
             ORDER BY e.name, sl.logged_at`,
      args: [user.id],
    }),
    db.execute({
      sql: `SELECT c.completed_at, c.mood, c.duration_sec, w.title
              FROM completions c LEFT JOIN workouts w ON w.id = c.workout_id
             WHERE c.trainee_id = ?
             ORDER BY c.completed_at DESC LIMIT 15`,
      args: [user.id],
    }),
  ]);

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

  const rising = [...progress.values()].filter(
    (d) => d.points.length > 1 && d.points[d.points.length - 1] > d.points[0]
  ).length;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const workoutsThisWeek = recentRes.rows.filter(
    (row) => new Date(String(row.completed_at)).getTime() >= weekAgo
  ).length;

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
        <h1 className="mb-1 text-3xl font-bold tracking-tight">התקדמות</h1>
        <p className="mb-7 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          בכל תרגיל אנחנו מחברים את כל החזרות או השניות שביצעת. כשהמספר
          עולה לאורך זמן, סימן שהתקדמת.
        </p>

        <div className="mb-7 grid grid-cols-2 gap-2.5">
          <div className="glass rounded-3xl px-3 py-4 text-center">
            <b className="block text-2xl font-extrabold wood-text tabular-nums">
              {workoutsThisWeek}
            </b>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              אימונים בשבוע האחרון
            </span>
          </div>
          <div className="glass rounded-3xl px-3 py-4 text-center">
            <b className="block text-2xl font-extrabold tabular-nums">{rising}</b>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              תרגילים שהשתפרו
            </span>
          </div>
        </div>

        <SectionTitle
          title="צבירה לפי תרגיל"
          hint="המספר הגדול הוא הסך הכולל באימון האחרון"
        />
        {progress.size === 0 ? (
          <div className="glass rounded-3xl px-6 py-12 text-center">
            <p className="mb-2 text-lg font-semibold">עוד אין נתונים</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              אחרי האימון הראשון תתחיל לראות כאן את המספרים שלך.
            </p>
          </div>
        ) : (
          <div className="glass rounded-3xl p-2">
            {[...progress.entries()].map(([name, data], i) => {
              const points = data.points;
              const last = points[points.length - 1];
              const previous = points.length > 1 ? points[points.length - 2] : null;
              const previousDelta = previous == null ? null : last - previous;
              const startDelta = last - points[0];

              return (
                <div
                  key={name}
                  className="flex items-center gap-3 px-3.5 py-3.5"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{name}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--dim)" }}>
                      {previous == null ? (
                        "האימון הראשון בתרגיל"
                      ) : (
                        <>
                          <span
                            className="font-extrabold tabular-nums"
                            style={{ color: previousDelta! < 0 ? "var(--danger-text)" : previousDelta! > 0 ? "var(--wood-1)" : "var(--dim)" }}
                          >
                            {previousDelta! > 0 ? `עלייה של ${previousDelta}` : previousDelta! < 0 ? `ירידה של ${Math.abs(previousDelta!)}` : "ללא שינוי"}
                          </span>
                          <span style={{ color: "var(--faint)" }}>
                            {` · מההתחלה ${startDelta > 0 ? `+${startDelta}` : startDelta}`}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <TrendLine points={points} />

                  {/*
                    הסך הכולל האחרון הוא המספר שנוהל הצבירה נמדד לפיו, ולכן
                    הוא היחיד שמקבל גודל. קודם הוצגה כאן שרשרת של שישה
                    מספרים עם חצים בכיוון ההפוך לשאר המסך, והיא נשברה לשתי
                    שורות בטלפון.
                  */}
                  <div className="shrink-0 text-left">
                    <b className="block text-xl font-extrabold wood-text tabular-nums">
                      {last}
                    </b>
                    <span className="text-xs" style={{ color: "var(--faint)" }}>
                      {data.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <SectionTitle title="אימונים אחרונים" />
        </div>
        {recentRes.rows.length === 0 ? (
          <p
            className="glass rounded-3xl px-6 py-8 text-center text-sm"
            style={{ color: "var(--dim)" }}
          >
            עוד לא השלמת אימונים
          </p>
        ) : (
          <div className="glass rounded-3xl p-2">
            {recentRes.rows.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3.5 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {c.title ? String(c.title) : "אימון"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>
                    {new Date(String(c.completed_at)).toLocaleDateString("he-IL")}
                    {c.duration_sec
                      ? ` · ${Math.round(Number(c.duration_sec) / 60)} דק׳`
                      : ""}
                  </p>
                </div>
                {c.mood && LEGACY_MOODS[String(c.mood).toLowerCase()] && (
                  <span
                    className="shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
                    style={{
                      background: "var(--soft-2)",
                      border: "1px solid var(--line)",
                      color: "var(--dim)",
                    }}
                  >
                    {LEGACY_MOODS[String(c.mood).toLowerCase()]}
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

function TrendLine({ points }: { points: number[] }) {
  const width = 72;
  const height = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - 3 - ((point - min) / range) * (height - 6);
    return `${x},${y}`;
  });

  return (
    <svg className="h-8 w-[72px] shrink-0" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="מגמת התרגיל לאורך האימונים">
      <polyline points={coordinates.join(" ")} fill="none" stroke="var(--wood-2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={coordinates.at(-1)?.split(",")[0]} cy={coordinates.at(-1)?.split(",")[1]} r="3" fill="var(--surface)" stroke="var(--wood-1)" strokeWidth="2" />
    </svg>
  );
}

/**
 * כותרת מקטע. הקו הדוהה הוא אותו סימן שכבר משמש במסך המדריך ובתיבות
 * האישור של המאמן, ולכן הוא לא מכניס שפה חדשה למסך.
 */
function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        <h2 className="shrink-0 text-lg font-bold">{title}</h2>
        <span
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(to left, rgba(180,133,79,.45), transparent)",
          }}
        />
      </div>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
