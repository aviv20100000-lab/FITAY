"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { explainTempo, RULES } from "@/lib/method";
import { useWakeLock } from "@/lib/useWakeLock";
import type { LastPerformance, Side } from "@/lib/types";

type Item = {
  id: string;
  exerciseId: string;
  name: string;
  description: string;
  technique: string[];
  tips: string[];
  tempo: string;
  muscles: string;
  type: "reps" | "hold" | "amrap";
  unilateral: boolean;
  sets: number;
  reps: number | null;
  seconds: number | null;
  rest: number;
  ringHeight: string | null;
  bodyAngle: string | null;
  videoFile: string | null;
  last: LastPerformance | null;
};

export type WarmupItem = {
  id: string;
  name: string;
  description: string;
  technique: string[];
  sets: number;
  reps?: number;
  seconds?: number;
};

type LoggedSet = {
  workoutItemId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  seconds: number | null;
  side: Side | null;
};

/**
 * רטט קצר. לא צליל — מתאמנים רבים עם מוזיקה באוזניות, וביפ היה נבלע.
 * אייפון לא תומך ב-vibrate בכלל ופשוט מתעלם.
 */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // דפדפן שחוסם רטט. אין מה לעשות ואין למה להיכשל.
  }
}

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** מה נרשם בתרגיל הזה — חזרות או שניות. amrap נמדד בחזרות בתוך זמן קצוב. */
function logsReps(type: Item["type"]) {
  return type !== "hold";
}

function formatLast(last: LastPerformance | null, type: Item["type"]) {
  if (!last || last.sets.length === 0) return null;
  const unit = logsReps(type) ? "" : " שנ׳";
  const parts = last.sets.map((s) =>
    logsReps(type) ? String(s.reps ?? 0) : String(s.seconds ?? 0)
  );
  return `${parts.join(" · ")}${unit}  (סה״כ ${last.total})`;
}

export default function WorkoutRunner({
  programId,
  workoutId,
  workoutTitle,
  programTitle,
  phase,
  rehabMode,
  items,
  warmup,
}: {
  programId: string;
  workoutId: string;
  workoutTitle: string;
  programTitle: string;
  phase: number;
  rehabMode: boolean;
  items: Item[];
  warmup: WarmupItem[];
}) {
  const router = useRouter();
  const storageKey = `fitay-workout-${workoutId}`;

  const [stage, setStage] = useState<"warmup" | "work">("warmup");
  const [index, setIndex] = useState(0);
  const [set, setSet] = useState(1);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<LoggedSet[]>([]);
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  /** רגע הסיום של המנוחה כחותמת זמן — לא מונה יורד. */
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [restored, setRestored] = useState(false);
  const [resumed, setResumed] = useState(false);

  const item = items[index];

  /**
   * שחזור אימון שנקטע. מתאמן שנועל את המסך, מקבל שיחה או מרענן —
   * חוזר בדיוק לאותו סט. בלי זה כל הרישום נמחק, וזה קורה בחצר כל שבוע.
   */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === "object") {
          const restoredIndex = Math.min(
            Math.max(0, Number(s.index) || 0),
            Math.max(0, items.length - 1)
          );
          setStage(s.stage === "work" ? "work" : "warmup");
          setIndex(restoredIndex);
          setSet(Math.max(1, Number(s.set) || 1));
          setLogs(Array.isArray(s.logs) ? s.logs : []);
          setStartedAtMs(Number(s.startedAtMs) || Date.now());
          setRestUntil(typeof s.restUntil === "number" ? s.restUntil : null);
          if (s.stage === "work" && Array.isArray(s.logs) && s.logs.length > 0) {
            setResumed(true);
          }
        }
      }
    } catch {
      // אחסון חסום או פגום — מתחילים נקי, לא מפילים את המסך.
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // שמירה אחרי כל שינוי. אחרי סיום האימון אין מה לשמור.
  useEffect(() => {
    if (!restored || done) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ stage, index, set, logs, startedAtMs, restUntil })
      );
    } catch {
      // אין מקום באחסון — האימון ימשיך לעבוד, פשוט בלי שחזור.
    }
  }, [restored, done, stage, index, set, logs, startedAtMs, restUntil, storageKey]);

  function clearSaved() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // אין מה לעשות, ואין למה להיכשל.
    }
  }

  function restart() {
    clearSaved();
    setStage("warmup");
    setIndex(0);
    setSet(1);
    setLogs([]);
    setRestUntil(null);
    setResumed(false);
    setStartedAtMs(Date.now());
  }

  // ערכי הרישום לסט הנוכחי. מתאפסים לברירת המחדל בכל מעבר סט או תרגיל.
  const [main, setMain] = useState(0);
  const [strong, setStrong] = useState(0);

  useEffect(() => {
    if (!item) return;
    const fallback = logsReps(item.type)
      ? item.reps ?? lastValue(item) ?? 10
      : item.seconds ?? lastValue(item) ?? 20;
    setMain(fallback);
    setStrong(fallback);
  }, [item, set]);

  /**
   * טיימר המנוחה נגזר משעון אמיתי ולא מספירה לאחור בזיכרון —
   * setTimeout נעצר כשהמסך ננעל, והמתאמן היה חוזר לטיימר קפוא.
   * בלי צלצול, כי מתאמנים עם מוזיקה ברקע.
   */
  const resting =
    restUntil == null ? 0 : Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));

  useEffect(() => {
    if (restUntil == null) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [restUntil]);

  useEffect(() => {
    if (restUntil == null) return;
    const over = Date.now() - restUntil;
    if (over < 0) return;
    // רק אם המנוחה נגמרה ממש עכשיו. אימון שנשמר ונפתח מחר לא ירטוט לשווא.
    if (over < 3000) buzz([180, 90, 180]);
    setRestUntil(null);
  }, [tick, restUntil]);

  // המסך נשאר דלוק כל עוד האימון פתוח — כולל החימום, לא רק הסטים.
  useWakeLock(restored && !done);

  if (items.length === 0) {
    return (
      <Shell>
        <p className="glass rounded-3xl px-6 py-12 text-center">
          אין תרגילים באימון הזה עדיין.
        </p>
        <Link
          href="/client"
          className="mt-4 block text-center text-sm"
          style={{ color: "var(--dim)" }}
        >
          ← חזרה
        </Link>
      </Shell>
    );
  }

  // מחכים לשחזור לפני הציור הראשון, אחרת המסך היה קופץ מהחימום
  // אל אמצע האימון מול העיניים של המתאמן.
  if (!restored) {
    return (
      <Shell>
        <div className="h-40" />
      </Shell>
    );
  }

  if (done) {
    return (
      <FinishScreen
        programId={programId}
        workoutId={workoutId}
        rehabMode={rehabMode}
        logs={logs}
        durationSec={Math.round((Date.now() - startedAtMs) / 1000)}
        onSaved={() => {
          clearSaved();
          router.push("/client");
          router.refresh();
        }}
      />
    );
  }

  if (stage === "warmup") {
    return (
      <WarmupScreen
        warmup={warmup}
        workoutTitle={workoutTitle}
        programTitle={programTitle}
        phase={phase}
        onStart={() => setStage("work")}
      />
    );
  }

  const isLastSet = set >= item.sets;
  const isLastExercise = index >= items.length - 1;

  function saveSet() {
    const entries: LoggedSet[] = [];
    const base = {
      workoutItemId: item.id,
      exerciseId: item.exerciseId,
      setNumber: set,
    };
    const toRow = (value: number, side: Side | null): LoggedSet => ({
      ...base,
      reps: logsReps(item.type) ? value : null,
      seconds: logsReps(item.type) ? null : value,
      side,
    });

    if (item.unilateral) {
      entries.push(toRow(main, "weak"), toRow(strong, "strong"));
    } else {
      entries.push(toRow(main, null));
    }
    setLogs((prev) => [...prev, ...entries]);
    setResumed(false);

    if (!isLastSet) {
      setSet(set + 1);
      setRestUntil(Date.now() + item.rest * 1000);
      return;
    }
    if (!isLastExercise) {
      setIndex(index + 1);
      setSet(1);
      setRestUntil(Date.now() + item.rest * 1000);
      return;
    }
    setDone(true);
  }

  const target =
    item.type === "hold"
      ? `${item.seconds} שניות`
      : item.type === "amrap"
        ? `${item.seconds} שניות`
        : `${item.reps} חזרות`;

  const tempoHelp = explainTempo(item.tempo);
  const lastLine = formatLast(item.last, item.type);
  const unit = logsReps(item.type) ? "חזרות" : "שניות";

  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/client" className="text-sm" style={{ color: "var(--dim)" }}>
          ← שמור וצא
        </Link>
        <div className="flex items-center gap-3">
          {logs.length > 0 && (
            <button
              type="button"
              onClick={restart}
              className="text-xs"
              style={{ color: "var(--faint)" }}
            >
              התחל מחדש
            </button>
          )}
          <span className="text-sm" style={{ color: "var(--dim)" }}>
            תרגיל {index + 1} מתוך {items.length}
          </span>
        </div>
      </div>

      {resumed && (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "rgba(180,133,79,.14)",
            border: "1px solid rgba(224,190,147,.3)",
            color: "var(--wood-1)",
          }}
        >
          חזרת לאימון שהתחלת. הסטים שרשמת נשמרו.
        </div>
      )}

      <div
        className="mb-6 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,.08)" }}
      >
        <div
          className="wood h-full rounded-full transition-all duration-500"
          style={{ width: `${((index + (set - 1) / item.sets) / items.length) * 100}%` }}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--dim)" }}>
        {programTitle} · {workoutTitle}
      </p>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">{item.name}</h1>

      <div
        className="mb-4 grid aspect-video w-full place-items-center overflow-hidden rounded-3xl"
        style={{
          background: "linear-gradient(140deg,#221b12,#12100c)",
          border: "1px solid var(--line)",
        }}
      >
        {item.videoFile ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={
              item.videoFile.startsWith("http")
                ? item.videoFile
                : `/videos/${encodeURIComponent(item.videoFile)}`
            }
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm" style={{ color: "var(--faint)" }}>
            סרטון יתווסף בקרוב
          </span>
        )}
      </div>

      {/* נוהל הצבירה: מה עשית פעם שעברה, כאן, לפני שאתה מתחיל את הסט */}
      {lastLine && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(180,133,79,.10)",
            border: "1px solid rgba(224,190,147,.24)",
          }}
        >
          <p className="mb-1 text-[11px] font-bold" style={{ color: "var(--wood-1)" }}>
            פעם שעברה
          </p>
          <p className="text-sm tabular-nums" style={{ color: "var(--dim)" }}>
            {lastLine}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--faint)" }}>
            נסה לעבור את זה, אבל עצור 1-2 חזרות לפני כישלון.
          </p>
        </div>
      )}

      <div className="glass mb-4 rounded-3xl p-6 text-center">
        <p className="mb-1 text-sm" style={{ color: "var(--dim)" }}>
          סט {set} מתוך {item.sets}
        </p>
        <p className="mb-3 text-5xl font-extrabold wood-text">{target}</p>
        <div className="flex justify-center gap-2 text-xs" style={{ color: "var(--dim)" }}>
          {item.tempo && <span>קצב {item.tempo}</span>}
          <span>·</span>
          <span>מנוחה {item.rest} שנ׳</span>
        </div>
        {tempoHelp && (
          <p className="mt-2 text-[11px]" style={{ color: "var(--faint)" }}>
            {tempoHelp}
          </p>
        )}
      </div>

      {item.unilateral && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(107,143,181,.12)",
            border: "1px solid rgba(107,143,181,.34)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--rehab)" }}>
            מתחילים מהצד החלש
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--dim)" }}>
            הצד החלש מקבל אותך במלוא הכוח, ורק אחריו הדומיננטי.
          </p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <Chip label="גובה הטבעת" value={item.ringHeight ?? "חופשי"} />
        <Chip label="מנח הגוף" value={item.bodyAngle ?? "רגיל"} />
      </div>

      {item.technique.length > 0 && (
        <div className="glass mb-4 rounded-3xl p-5">
          <p className="mb-3 text-sm font-bold wood-text">טכניקה</p>
          <ul className="space-y-2">
            {item.technique.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span style={{ color: "var(--wood-2)" }}>•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resting > 0 ? (
        <div className="glass rounded-3xl p-6 text-center">
          <p className="mb-1 text-sm" style={{ color: "var(--dim)" }}>
            מנוחה
          </p>
          <p className="mb-4 text-5xl font-extrabold tabular-nums">{mmss(resting)}</p>
          <button
            onClick={() => setRestUntil(null)}
            className="w-full rounded-2xl py-3.5 font-semibold"
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid var(--line)",
              color: "var(--wood-1)",
            }}
          >
            דלג על המנוחה
          </button>
        </div>
      ) : (
        <div className="glass rounded-3xl p-5">
          <p className="mb-3 text-sm font-bold">כמה עשית בפועל?</p>

          {item.unilateral ? (
            <div className="space-y-3">
              <Stepper label={`צד חלש · ${unit}`} value={main} onChange={setMain} />
              <Stepper label={`צד חזק · ${unit}`} value={strong} onChange={setStrong} />
            </div>
          ) : (
            <Stepper label={unit} value={main} onChange={setMain} />
          )}

          <button
            onClick={saveSet}
            className="wood mt-4 w-full rounded-2xl py-5 text-xl font-extrabold"
            style={{
              color: "#f7ebda",
              boxShadow:
                "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
            }}
          >
            {isLastSet && isLastExercise ? "סיים אימון" : "סיימתי את הסט"}
          </button>
        </div>
      )}
    </Shell>
  );
}

/** הערך של הסט הראשון בפעם הקודמת — ברירת מחדל טובה יותר מאפס. */
function lastValue(item: Item): number | null {
  const first = item.last?.sets[0];
  if (!first) return null;
  return logsReps(item.type) ? first.reps : first.seconds;
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs" style={{ color: "var(--dim)" }}>
        {label}
      </p>
      <div className="flex items-center gap-2.5">
        <StepButton onClick={() => onChange(Math.max(0, value - 1))}>−</StepButton>
        <div
          className="flex-1 rounded-2xl py-3 text-center text-3xl font-extrabold tabular-nums"
          style={{
            background: "rgba(180,133,79,.14)",
            border: "1px solid rgba(224,190,147,.28)",
            color: "var(--wood-1)",
          }}
        >
          {value}
        </div>
        <StepButton onClick={() => onChange(value + 1)}>+</StepButton>
      </div>
    </div>
  );
}

function StepButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-14 w-14 shrink-0 rounded-2xl text-2xl font-bold"
      style={{
        background: "rgba(255,255,255,.06)",
        border: "1px solid var(--line)",
        color: "var(--wood-1)",
      }}
    >
      {children}
    </button>
  );
}

function WarmupScreen({
  warmup,
  workoutTitle,
  programTitle,
  phase,
  onStart,
}: {
  warmup: WarmupItem[];
  workoutTitle: string;
  programTitle: string;
  phase: number;
  onStart: () => void;
}) {
  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between">
        <Link href="/client" className="text-sm" style={{ color: "var(--dim)" }}>
          ← יציאה
        </Link>
        <span className="text-sm" style={{ color: "var(--dim)" }}>
          שלב {phase}
        </span>
      </div>

      <p className="text-xs" style={{ color: "var(--dim)" }}>
        {programTitle} · {workoutTitle}
      </p>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">חימום</h1>
      <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        חובה לפני כל אימון. כל המפרקים העיקריים צריכים לעבוד טוב לפני שמעמיסים
        עליהם. 4-5 דקות, ואז נכנסים לעבודה.
      </p>

      <div className="glass mb-5 rounded-3xl p-2">
        {warmup.map((w, i) => (
          <div
            key={w.id}
            className="px-3.5 py-3.5"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-bold">{w.name}</p>
              <p className="shrink-0 text-sm tabular-nums" style={{ color: "var(--wood-1)" }}>
                {w.sets} × {w.reps != null ? w.reps : `${w.seconds} שנ׳`}
              </p>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--dim)" }}>
              {w.technique[0]}
            </p>
          </div>
        ))}
      </div>

      <div className="glass mb-5 rounded-3xl p-5">
        <p className="mb-3 text-sm font-bold wood-text">ארבעת החוקים</p>
        <ul className="space-y-1.5">
          {RULES.map((r) => (
            <li key={r.title} className="flex gap-2.5 text-sm">
              <span style={{ color: "var(--wood-2)" }}>•</span>
              <span>{r.title}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onStart}
        className="wood w-full rounded-2xl py-5 text-xl font-extrabold"
        style={{
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        סיימתי חימום, מתחילים
      </button>
    </Shell>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-4 py-3 text-center"
      style={{
        background: "rgba(180,133,79,.14)",
        border: "1px solid rgba(224,190,147,.28)",
      }}
    >
      <p className="text-[11px]" style={{ color: "var(--dim)" }}>
        {label}
      </p>
      <p className="text-lg font-bold" style={{ color: "var(--wood-1)" }}>
        {value}
      </p>
    </div>
  );
}

function FinishScreen({
  programId,
  workoutId,
  rehabMode,
  durationSec,
  logs,
  onSaved,
}: {
  programId: string;
  workoutId: string;
  rehabMode: boolean;
  durationSec: number;
  logs: LoggedSet[];
  onSaved: () => void;
}) {
  const [mood, setMood] = useState("");
  const [pain, setPain] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totalReps = logs.reduce((sum, l) => sum + (l.reps ?? 0), 0);
  const totalSeconds = logs.reduce((sum, l) => sum + (l.seconds ?? 0), 0);

  async function save() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/client/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId,
        workoutId,
        durationSec,
        mood,
        painLevel: pain,
        notes: notes.trim(),
        setLogs: logs,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחתי לשמור");
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <Shell>
      <div className="pt-8 text-center">
        <p className="mb-2 text-6xl">💪</p>
        <h1 className="mb-1 text-3xl font-bold">אימון הושלם</h1>
        <p className="mb-8 text-sm" style={{ color: "var(--dim)" }}>
          {mmss(durationSec)} דקות
        </p>
      </div>

      {/* הסיכום הוא מה שנכנס לצבירה — כדאי שיראה אותו */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="glass rounded-3xl px-3 py-4 text-center">
          <b className="block text-2xl font-extrabold wood-text tabular-nums">
            {totalReps}
          </b>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            חזרות סה״כ
          </span>
        </div>
        <div className="glass rounded-3xl px-3 py-4 text-center">
          <b className="block text-2xl font-extrabold tabular-nums">{totalSeconds}</b>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            שניות בהחזקות
          </span>
        </div>
      </div>

      <div className="glass mb-4 rounded-3xl p-6">
        <p className="mb-3 text-sm font-bold">איך הרגשת?</p>
        <div className="grid grid-cols-3 gap-2">
          {["קל", "בול", "קשה"].map((m) => (
            <button
              key={m}
              onClick={() => setMood(m)}
              className="rounded-2xl py-3.5 font-semibold"
              style={{
                background: mood === m ? "rgba(180,133,79,.24)" : "rgba(255,255,255,.05)",
                border: `1px solid ${mood === m ? "rgba(224,190,147,.5)" : "var(--line)"}`,
                color: mood === m ? "var(--wood-1)" : "var(--dim)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {rehabMode && (
        <div
          className="mb-4 rounded-3xl p-6"
          style={{
            background: "rgba(107,143,181,.10)",
            border: "1px solid rgba(107,143,181,.3)",
          }}
        >
          <p className="mb-1 text-sm font-bold" style={{ color: "var(--rehab)" }}>
            רמת כאב
          </p>
          <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
            0 = בלי כאב · 10 = כאב חזק. איתי רואה את זה.
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                onClick={() => setPain(n)}
                className="rounded-xl py-2.5 text-sm font-bold"
                style={{
                  background: pain === n ? "var(--rehab)" : "rgba(255,255,255,.05)",
                  border: `1px solid ${pain === n ? "var(--rehab)" : "var(--line)"}`,
                  color: pain === n ? "#0a0a0b" : "var(--dim)",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* "קל/בול/קשה" לא מספיק כדי לתקן תרגיל. כאן נכנס מה שבאמת קרה. */}
      <div className="glass mb-4 rounded-3xl p-6">
        <p className="mb-1 text-sm font-bold">משהו להגיד לאיתי?</p>
        <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
          לא חובה. מה שכתוב כאן מגיע אליו יחד עם האימון.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="למשל: כאב בכתף בסט השלישי, הטבעת הרגישה נמוכה מדי"
          className="w-full resize-none rounded-2xl px-3.5 py-3 text-sm leading-relaxed outline-none"
          style={{
            background: "rgba(255,255,255,.05)",
            border: "1px solid var(--line)",
            color: "var(--text)",
          }}
        />
      </div>

      {error && (
        <p className="mb-3 text-center text-sm" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="wood w-full rounded-2xl py-5 text-lg font-extrabold disabled:opacity-60"
        style={{
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        {busy ? "שומר…" : "שמור וסיים"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />
      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-7 pb-10">
        {children}
      </div>
    </main>
  );
}
