import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import { Bidi } from "@/components/Bidi";

type SetRow = {
  setNumber: number;
  weak: number | null;
  strong: number | null;
  /** הצד הקובע (weak, או היחיד בתרגיל דו־צדדי) אושר בלי לגעת במספר שהוצע. */
  weakUntouched: boolean;
};

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
    sql: `SELECT sl.workout_item_id, sl.set_number, sl.reps, sl.seconds, sl.side, sl.untouched,
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
    const row =
      block.sets.get(n) ?? { setNumber: n, weak: null, strong: null, weakUntouched: false };
    const value = r.reps != null ? Number(r.reps) : r.seconds != null ? Number(r.seconds) : null;
    if (String(r.side) === "strong") {
      row.strong = value;
    } else {
      row.weak = value;
      row.weakUntouched = Number(r.untouched ?? 0) === 1;
    }
    block.sets.set(n, row);
  }

  const pain = c.pain_level == null ? null : Number(c.pain_level);
  const note = String(c.notes ?? "").trim();
  const duration = c.duration_sec == null ? null : Number(c.duration_sec);
  const mood = displayMood(c.mood);
  const firstBlock = blocks[0];
  const repeatedSetup =
    blocks.length > 1 &&
    Boolean(firstBlock?.ringHeight || firstBlock?.bodyAngle) &&
    blocks.every(
      (block) =>
        block.ringHeight === firstBlock.ringHeight && block.bodyAngle === firstBlock.bodyAngle
    );

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
        </p>

        <section className="glass mb-6 rounded-3xl p-5">
          <h2 className="mb-3 font-bold">הדיווח של המתאמן</h2>
          <ReportRow label="תחושה" value={mood ?? "לא דווח"} />
          <ReportRow
            label="כאב"
            value={pain == null ? "לא דווח" : `${pain} מתוך 10`}
            alert={pain != null && pain >= 5}
          />
          <ReportRow label="הערה" value={note || "לא נכתבה הערה"} multiline last />
        </section>

        {repeatedSetup && (
          <div className="mb-6 rounded-3xl p-4" style={{ background: "rgba(229,72,77,.08)", border: "1px solid rgba(229,72,77,.3)" }}>
            <p className="font-bold" style={{ color: "var(--danger-text)" }}>כדאי לבדוק את הגדרות התרגילים</p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
              גובה הטבעת ומנח הגוף זהים בכל התרגילים בדיווח הזה. אלה הנתונים השמורים בתוכנית.
            </p>
            <Link href={`/coach/programs/${String(c.program_id)}`} className="mt-3 inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-bold" style={{ border: "1px solid var(--line)", color: "var(--wood-1)" }}>
              בדיקת התוכנית ←
            </Link>
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
          <div className="glass overflow-hidden rounded-3xl">
            {blocks.map((b, blockIndex) => {
              const unit = b.isHold ? "שנ׳" : "חזרות";
              const rows = [...b.sets.values()].sort((x, y) => x.setNumber - y.setNumber);
              return (
                <div
                  key={b.key}
                  className="px-5 py-4"
                  style={{ borderBottom: blockIndex === blocks.length - 1 ? "none" : "1px solid var(--line)" }}
                >
                  <p className="font-bold leading-snug">{b.name}</p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--dim)" }}>
                    <Bidi
                      text={`${
                        b.targetSets != null && b.targetValue != null
                          ? `יעד ${b.targetValue} ${unit} · ${
                              b.targetSets === 1 ? "סט אחד" : `${b.targetSets} סטים`
                            }`
                          : "התרגיל כבר לא בתוכנית"
                      }${b.rest != null ? ` · מנוחה ${b.rest} שנ׳` : ""}`}
                    />
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <SetupValue label="גובה הטבעת" value={b.ringHeight ?? "חופשי"} />
                    <SetupValue label="מנח הגוף" value={b.bodyAngle ?? "רגיל"} />
                  </div>

                  <div className="mt-3">
                    {rows.map((r) => (
                      <div
                        key={r.setNumber}
                        className="flex min-h-9 items-center gap-3 py-1.5"
                        style={{ borderTop: "1px solid var(--line)" }}
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
                          {/* סימון שקט: הסט אושר בלי לגעת במספר שהוצע. */}
                          {r.weak != null && r.weakUntouched && (
                            <span className="mr-1.5 text-xs" style={{ color: "var(--faint)" }}>
                              בלי נגיעה
                            </span>
                          )}
                        </div>
                        <Delta actual={r.weak} target={b.targetValue} />
                      </div>
                    ))}
                  </div>

                  {b.targetSets != null && rows.length < b.targetSets && (
                    <p className="mt-2.5 text-xs" style={{ color: "var(--danger-text)" }}>
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

function displayMood(value: unknown) {
  if (value == null) return null;
  const moods: Record<string, string> = {
    easy: "קל",
    good: "מתאים",
    suitable: "מתאים",
    medium: "מתאים",
    hard: "קשה",
    קל: "קל",
    מתאים: "מתאים",
    קשה: "קשה",
  };
  return moods[String(value).toLowerCase()] ?? null;
}

function ReportRow({ label, value, alert = false, multiline = false, last = false }: { label: string; value: string; alert?: boolean; multiline?: boolean; last?: boolean }) {
  return (
    <div className={multiline ? "py-3" : "flex items-center justify-between gap-3 py-3"} style={{ borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span className="text-sm" style={{ color: "var(--dim)" }}>{label}</span>
      <span className={`${multiline ? "mt-1 block whitespace-pre-wrap text-sm leading-relaxed" : "text-sm font-bold"}`} style={{ color: alert ? "var(--danger-text)" : "var(--text)" }}>{value}</span>
    </div>
  );
}

function SetupValue({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="rounded-lg px-2.5 py-1 text-xs"
      style={{
        background: "rgba(180,133,79,.12)",
        border: "1px solid rgba(180,133,79,.4)",
        color: "var(--wood-1)",
      }}
    >
      <span style={{ color: "var(--dim)" }}>{label}: </span>
      <strong>{value}</strong>
    </span>
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
        color: good ? "var(--wood-1)" : "var(--danger-text)",
      }}
    >
      {diff === 0 ? "יעד" : <Bidi text={diff > 0 ? `+${diff}` : String(diff)} />}
    </span>
  );
}
