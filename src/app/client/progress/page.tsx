import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";

export const metadata = { title: "התקדמות · FITAY" };

/**
 * ההתקדמות של המתאמן. לא גרפים — מספרים.
 * נוהל הצבירה מודד סך עבודה בתרגיל, ולכן זה מה שמוצג.
 */
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
          כל אימון נמדד בסך העבודה שעשית בתרגיל. המספר עולה? אתה מתקדם.
        </p>

        <div className="mb-7 grid grid-cols-2 gap-2.5">
          <div className="glass rounded-3xl px-3 py-4 text-center">
            <b className="block text-2xl font-extrabold wood-text tabular-nums">
              {recentRes.rows.length}
            </b>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              אימונים אחרונים
            </span>
          </div>
          <div className="glass rounded-3xl px-3 py-4 text-center">
            <b className="block text-2xl font-extrabold tabular-nums">{rising}</b>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              תרגילים בעלייה
            </span>
          </div>
        </div>

        <h2 className="mb-3 text-lg font-bold">צבירה לפי תרגיל</h2>
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
              const points = data.points.slice(-6);
              const first = points[0];
              const last = points[points.length - 1];
              const delta = last - first;
              return (
                <div
                  key={name}
                  className="px-3.5 py-3.5"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-semibold">{name}</p>
                    <p
                      className="shrink-0 text-xs font-bold tabular-nums"
                      style={{ color: delta > 0 ? "var(--wood-1)" : "var(--faint)" }}
                    >
                      {delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : "—"}
                    </p>
                  </div>
                  <p
                    className="mt-1 text-sm tabular-nums"
                    style={{ color: "var(--dim)" }}
                    dir="ltr"
                  >
                    {points.join("  →  ")} {data.unit}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <h2 className="mt-8 mb-3 text-lg font-bold">אימונים אחרונים</h2>
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
                {c.mood && (
                  <span
                    className="shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
                    style={{
                      background: "rgba(255,255,255,.05)",
                      border: "1px solid var(--line)",
                      color: "var(--dim)",
                    }}
                  >
                    {String(c.mood)}
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
