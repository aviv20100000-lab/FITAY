import { redirect, notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";

type SetRow = { setNumber: number; weak: number | null; strong: number | null };

type Block = {
  key: string;
  name: string;
  unilateral: boolean;
  isHold: boolean;
  targetSets: number | null;
  targetValue: number | null;
  rest: number | null;
  ringHeight: string | null;
  bodyAngle: string | null;
  sets: Map<number, SetRow>;
};

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function CompletionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const compRes = await db.execute({
    sql: `SELECT c.*, u.name AS trainee_name, u.rehab_mode, w.title AS workout_title,
                 p.title AS program_title
            FROM completions c
            JOIN users u ON u.id = c.trainee_id
       LEFT JOIN workouts w ON w.id = c.workout_id
       LEFT JOIN programs p ON p.id = c.program_id
           WHERE c.id = ?`,
    args: [id],
  });
  const c = compRes.rows[0];
  if (!c) notFound();

  // כל הסטים של האימון הזה חולקים את אותה חותמת זמן עם ה-completion.
  // workout_items ב-LEFT JOIN — תרגיל שנמחק מאז עדיין יופיע, בלי יעד.
  const setsRes = await db.execute({
    sql: `SELECT sl.workout_item_id, sl.set_number, sl.reps, sl.seconds, sl.side,
                 e.name AS exercise_name, e.unilateral, e.type,
                 wi.position, wi.sets AS t_sets, wi.reps AS t_reps,
                 wi.seconds AS t_seconds, wi.rest, wi.ring_height, wi.body_angle
            FROM set_logs sl
            JOIN exercises e ON e.id = sl.exercise_id
       LEFT JOIN workout_items wi ON wi.id = sl.workout_item_id
           WHERE sl.trainee_id = ? AND sl.workout_id = ? AND sl.logged_at = ?
        ORDER BY COALESCE(wi.position, 9999), sl.set_number`,
    args: [String(c.trainee_id), String(c.workout_id), String(c.completed_at)],
  });

  const blocks: Block[] = [];
  const byItem = new Map<string, Block>();
  for (const r of setsRes.rows) {
    const key = String(r.workout_item_id);
    let block = byItem.get(key);
    if (!block) {
      block = {
        key,
        name: String(r.exercise_name),
        unilateral: Number(r.unilateral) === 1,
        isHold: String(r.type) === "hold",
        targetSets: r.t_sets == null ? null : Number(r.t_sets),
        targetValue:
          String(r.type) === "hold"
            ? r.t_seconds == null
              ? null
              : Number(r.t_seconds)
            : r.t_reps == null
              ? null
              : Number(r.t_reps),
        rest: r.rest == null ? null : Number(r.rest),
        ringHeight: r.ring_height == null ? null : String(r.ring_height),
        bodyAngle: r.body_angle == null ? null : String(r.body_angle),
        sets: new Map(),
      };
      byItem.set(key, block);
      blocks.push(block);
    }
    const n = Number(r.set_number);
    const row = block.sets.get(n) ?? { setNumber: n, weak: null, strong: null };
    const value = r.reps != null ? Number(r.reps) : r.seconds != null ? Number(r.seconds) : null;
    if (String(r.side) === "strong") row.strong = value;
    else row.weak = value;
    block.sets.set(n, row);
  }

  const pain = c.pain_level == null ? null : Number(c.pain_level);
  const note = String(c.notes ?? "").trim();
  const duration = c.duration_sec == null ? null : Number(c.duration_sec);

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
        <BackLink href={`/coach/trainees/${String(c.trainee_id)}`} className="mb-6">
          חזרה לכרטיס של {String(c.trainee_name)}
        </BackLink>

        <p className="mb-1 text-xs" style={{ color: "var(--dim)" }}>
          {c.program_title ? String(c.program_title) : "תוכנית"}
        </p>
        <h1 className="mb-1 text-3xl font-bold tracking-tight">
          {c.workout_title ? String(c.workout_title) : "אימון"}
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--dim)" }}>
          {new Date(String(c.completed_at)).toLocaleString("he-IL", {
            dateStyle: "long",
            timeStyle: "short",
          })}
          {duration != null && ` · ${mmss(duration)} דקות`}
          {c.mood ? ` · ${String(c.mood)}` : ""}
        </p>

        {pain != null && (
          <div
            className="mb-4 rounded-2xl px-4 py-3 text-sm font-bold"
            style={{
              background: pain >= 5 ? "rgba(229,72,77,.14)" : "rgba(107,143,181,.12)",
              border: `1px solid ${pain >= 5 ? "rgba(229,72,77,.4)" : "rgba(107,143,181,.34)"}`,
              color: pain >= 5 ? "#ffb4b6" : "var(--rehab)",
            }}
          >
            דיווח כאב: {pain} מתוך 10
          </div>
        )}

        {note && (
          <div
            className="mb-6 rounded-3xl px-5 py-4"
            style={{
              background: "rgba(180,133,79,.10)",
              border: "1px solid rgba(224,190,147,.24)",
            }}
          >
            <p className="mb-1.5 text-[11px] font-bold" style={{ color: "var(--wood-1)" }}>
              מה שהוא כתב
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{note}</p>
          </div>
        )}

        {blocks.length === 0 ? (
          <p
            className="glass rounded-3xl px-6 py-10 text-center text-sm"
            style={{ color: "var(--dim)" }}
          >
            לא נרשמו סטים באימון הזה.
          </p>
        ) : (
          <div className="space-y-4">
            {blocks.map((b) => {
              const unit = b.isHold ? "שנ׳" : "חזרות";
              const rows = [...b.sets.values()].sort((x, y) => x.setNumber - y.setNumber);
              return (
                <div key={b.key} className="glass rounded-3xl p-5">
                  <p className="text-lg font-bold">{b.name}</p>
                  <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
                    {b.targetSets != null && b.targetValue != null
                      ? `יעד ${b.targetSets} × ${b.targetValue} ${unit}`
                      : "התרגיל כבר לא בתוכנית"}
                    {b.rest != null && ` · מנוחה ${b.rest} שנ׳`}
                    {b.ringHeight && ` · טבעת ${b.ringHeight}`}
                    {b.bodyAngle && ` · ${b.bodyAngle}`}
                  </p>

                  <div className="space-y-1.5">
                    {rows.map((r) => (
                      <div
                        key={r.setNumber}
                        className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
                        style={{ background: "rgba(255,255,255,.04)" }}
                      >
                        <span
                          className="shrink-0 text-xs font-semibold"
                          style={{ color: "var(--faint)" }}
                        >
                          סט {r.setNumber}
                        </span>
                        <div className="flex-1 text-sm tabular-nums">
                          {b.unilateral ? (
                            <span>
                              חלש <b className="wood-text">{r.weak ?? "—"}</b>
                              <span style={{ color: "var(--faint)" }}> · </span>
                              חזק <b>{r.strong ?? "—"}</b>
                            </span>
                          ) : (
                            <span>
                              <b className="text-lg wood-text">{r.weak ?? "—"}</b> {unit}
                            </span>
                          )}
                        </div>
                        <Delta actual={r.weak} target={b.targetValue} />
                      </div>
                    ))}
                  </div>

                  {b.targetSets != null && rows.length < b.targetSets && (
                    <p className="mt-2.5 text-xs" style={{ color: "#ffb4b6" }}>
                      נרשמו {rows.length} סטים מתוך {b.targetSets}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

/** ההפרש מול היעד. בתרגיל חד־צדדי נמדד הצד החלש — הוא שקובע התקדמות. */
function Delta({ actual, target }: { actual: number | null; target: number | null }) {
  if (actual == null || target == null) return null;
  const diff = actual - target;
  const good = diff >= 0;
  return (
    <span
      className="shrink-0 rounded-xl px-2.5 py-1 text-xs font-bold tabular-nums"
      style={{
        background: good ? "rgba(180,133,79,.18)" : "rgba(229,72,77,.14)",
        border: `1px solid ${good ? "rgba(224,190,147,.32)" : "rgba(229,72,77,.36)"}`,
        color: good ? "var(--wood-1)" : "#ffb4b6",
      }}
    >
      {diff === 0 ? "יעד" : diff > 0 ? `+${diff}` : diff}
    </span>
  );
}
