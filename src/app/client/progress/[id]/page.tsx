import { redirect, notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import { Bidi } from "@/components/Bidi";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";

export const metadata = { title: "אימון · FITAY" };

/**
 * אימון אחד שהושלם, סט אחר סט.
 *
 * למאמן כבר יש את המסך הזה ב-/coach/completions/[id], והמתאמן ראה עד
 * עכשיו רק שורה עם תאריך. אותם נתונים בדיוק, בשפה של לשונית ההישגים:
 * בלי אדום, בלי חוסרים ובלי הפרש שלילי מול היעד. הלשונית הזאת מתעדת
 * מה נעשה, והדיווח על מה שלא נעשה שייך למסכי המאמן.
 */

type SetRow = {
  setNumber: number;
  weak: number | null;
  strong: number | null;
  /** רמת הגומייה בסט. null כשהסט נעשה בלי גומייה. */
  bandLevel: string | null;
  /** סט ישן שנרשם לפני ההפרדה לשלוש גומיות: יודעים שהייתה, לא איזו. */
  bandedOnly: boolean;
};

type Block = {
  key: string;
  name: string;
  unilateral: boolean;
  isHold: boolean;
  targetSets: number | null;
  targetValue: number | null;
  ringHeight: string | null;
  bodyAngle: string | null;
  sets: Map<number, SetRow>;
};

const BAND_LABEL: Record<string, string> = {
  easy: "קלה",
  medium: "בינונית",
  hard: "קשה",
};

/*
 * התחושה נשמרה בעבר באנגלית ורק אחר כך בעברית, ושתי הצורות חיות במסד
 * זו לצד זו. בלי המיפוי הזה אימון ישן היה מציג "good" באמצע משפט עברי.
 */
const MOOD_LABEL: Record<string, string> = {
  easy: "קל",
  good: "מתאים",
  suitable: "מתאים",
  medium: "מתאים",
  hard: "קשה",
  קל: "קל",
  מתאים: "מתאים",
  קשה: "קשה",
};

export default async function ClientCompletionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  /*
   * trainee_id בתנאי ולא רק במסך: בלעדיו כל מתאמן היה יכול לפתוח אימון
   * של מתאמן אחר לפי מזהה. notFound ולא הודעת שגיאה, כדי שהמסך גם לא
   * יסגיר שהמזהה קיים.
   */
  const compRes = await db.execute({
    sql: `SELECT c.id, c.trainee_id, c.workout_id, c.completed_at, c.duration_sec,
                 c.mood, w.title AS workout_title, p.title AS program_title
            FROM completions c
       LEFT JOIN workouts w ON w.id = c.workout_id
       LEFT JOIN programs p ON p.id = c.program_id
           WHERE c.id = ? AND c.trainee_id = ?`,
    args: [id, user.id],
  });
  const c = compRes.rows[0];
  if (!c) notFound();

  // כל הסטים של האימון חולקים חותמת זמן אחת עם ה-completion.
  // workout_items ב-LEFT JOIN, כדי שתרגיל שנמחק מאז עדיין יופיע.
  const setsRes = await db.execute({
    sql: `SELECT sl.workout_item_id, sl.set_number, sl.reps, sl.seconds, sl.side,
                 sl.banded, sl.band_level,
                 e.name AS exercise_name, e.unilateral, e.type,
                 wi.position, wi.sets AS t_sets, wi.reps AS t_reps,
                 wi.seconds AS t_seconds, wi.ring_height, wi.body_angle
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
        ringHeight: r.ring_height == null ? null : String(r.ring_height),
        bodyAngle: r.body_angle == null ? null : String(r.body_angle),
        sets: new Map(),
      };
      byItem.set(key, block);
      blocks.push(block);
    }

    const n = Number(r.set_number);
    const row =
      block.sets.get(n) ??
      { setNumber: n, weak: null, strong: null, bandLevel: null, bandedOnly: false };
    const value =
      r.reps != null ? Number(r.reps) : r.seconds != null ? Number(r.seconds) : null;
    if (String(r.side) === "strong") {
      row.strong = value;
    } else {
      row.weak = value;
    }

    const rawLevel = r.band_level == null ? null : String(r.band_level);
    if (rawLevel && BAND_LABEL[rawLevel]) row.bandLevel = rawLevel;
    else if (Number(r.banded ?? 0) === 1) row.bandedOnly = true;

    block.sets.set(n, row);
  }

  const mood =
    c.mood == null ? null : MOOD_LABEL[String(c.mood).toLowerCase()] ?? null;
  const totalSets = blocks.reduce((sum, b) => sum + b.sets.size, 0);
  const minutes =
    c.duration_sec == null ? null : Math.round(Number(c.duration_sec) / 60);

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_50%_4%,rgba(180,133,79,.2),transparent_58%)]" />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
        <BackLink href="/client/progress" className="mb-6">
          חזרה להישגים
        </BackLink>

        <p className="mb-1 text-xs" style={{ color: "var(--dim)" }}>
          {c.program_title ? String(c.program_title) : "תוכנית"}
        </p>
        <h1 className="mb-1 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
          {c.workout_title ? String(c.workout_title) : "אימון"}
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--dim)" }}>
          {new Date(String(c.completed_at)).toLocaleDateString("he-IL", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Jerusalem",
          })}
          {minutes != null && minutes >= 1 && ` · ${minutes} דק׳`}
          {mood ? ` · ${mood}` : ""}
        </p>

        {totalSets > 0 && (
          <div className="glass mb-5 flex items-center justify-between rounded-3xl px-5 py-4">
            <span className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
              סטים באימון הזה
            </span>
            <b className="text-3xl font-extrabold wood-text tabular-nums">{totalSets}</b>
          </div>
        )}

        {blocks.length === 0 ? (
          <p
            className="glass rounded-3xl px-6 py-10 text-center text-sm leading-relaxed"
            style={{ color: "var(--dim)" }}
          >
            לא נשמרו סטים באימון הזה.
          </p>
        ) : (
          <div className="glass overflow-hidden rounded-3xl">
            {blocks.map((b, blockIndex) => {
              const unit = b.isHold ? "שנ׳" : "חזרות";
              const rows = [...b.sets.values()].sort(
                (x, y) => x.setNumber - y.setNumber
              );
              return (
                <div
                  key={b.key}
                  className="px-5 py-4"
                  style={{
                    borderBottom:
                      blockIndex === blocks.length - 1
                        ? "none"
                        : "1px solid var(--line)",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-bold leading-snug">{b.name}</p>
                    <p
                      className="shrink-0 text-xs tabular-nums"
                      style={{ color: "var(--dim)" }}
                    >
                      <Bidi
                        text={rows.length === 1 ? "סט אחד" : `${rows.length} סטים`}
                      />
                    </p>
                  </div>

                  {b.targetSets != null && b.targetValue != null && (
                    <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
                      <Bidi
                        /*
                          מילים ולא סימן כפל. "3 × 12" לא אומר אם אלה
                          שלושה סטים של שתים עשרה או להפך, ובעברית שני
                          המספרים גם מתהפכים בעין. אותו ניסוח בדיוק
                          שבמסך החימום ובמסך האימון.
                        */
                        text={`היעד היה ${b.targetValue} ${unit} · ${
                          b.targetSets === 1 ? "סט אחד" : `${b.targetSets} סטים`
                        }`}
                      />
                    </p>
                  )}

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
                              <b className="text-lg wood-text">{r.weak ?? "—"}</b>{" "}
                              {unit}
                            </span>
                          )}
                          {/* הגומייה משנה את משמעות המספר, ולכן היא נאמרת
                              לידו ולא נשמטת מהתיעוד. */}
                          {(r.bandLevel || r.bandedOnly) && (
                            <span
                              className="mr-1.5 text-xs"
                              style={{ color: "var(--faint)" }}
                            >
                              {r.bandLevel
                                ? `גומייה ${BAND_LABEL[r.bandLevel]}`
                                : "עם גומייה"}
                            </span>
                          )}
                        </div>
                        {/*
                          רק הגעה ליעד מסומנת. הפרש שלילי באדום הוא בדיוק
                          מה שהלשונית הזאת אמורה לא לעשות, והוא ממילא כבר
                          נאמר למתאמן בסוף האימון עצמו.
                        */}
                        {r.weak != null &&
                          b.targetValue != null &&
                          r.weak >= b.targetValue && (
                            <span
                              className="shrink-0 rounded-xl px-2.5 py-1 text-xs font-bold"
                              style={{
                                background: "rgba(180,133,79,.18)",
                                border: "1px solid rgba(224,190,147,.32)",
                                color: "var(--wood-1)",
                              }}
                            >
                              יעד
                            </span>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
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
