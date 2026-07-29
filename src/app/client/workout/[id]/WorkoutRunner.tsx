"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Item = {
  id: string;
  name: string;
  description: string;
  technique: string[];
  tips: string[];
  tempo: string;
  muscles: string;
  sets: number;
  reps: number | null;
  seconds: number | null;
  rest: number;
  ringHeight: string | null;
  bodyAngle: string | null;
  videoFile: string | null;
};

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function WorkoutRunner({
  programId,
  workoutId,
  workoutTitle,
  programTitle,
  rehabMode,
  items,
}: {
  programId: string;
  workoutId: string;
  workoutTitle: string;
  programTitle: string;
  rehabMode: boolean;
  items: Item[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [set, setSet] = useState(1);
  const [resting, setResting] = useState(0);
  const [done, setDone] = useState(false);
  const startedAt = useRef(Date.now());

  const item = items[index];

  // טיימר המנוחה. יורד לאפס ונעצר — בלי צלצול, כי מתאמנים עם מוזיקה ברקע.
  useEffect(() => {
    if (resting <= 0) return;
    const t = setTimeout(() => setResting((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resting]);

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

  if (done) {
    return (
      <FinishScreen
        programId={programId}
        workoutId={workoutId}
        rehabMode={rehabMode}
        durationSec={Math.round((Date.now() - startedAt.current) / 1000)}
        onSaved={() => {
          router.push("/client");
          router.refresh();
        }}
      />
    );
  }

  const isLastSet = set >= item.sets;
  const isLastExercise = index >= items.length - 1;

  function nextSet() {
    if (!isLastSet) {
      setSet(set + 1);
      setResting(item.rest);
      return;
    }
    if (!isLastExercise) {
      setIndex(index + 1);
      setSet(1);
      setResting(item.rest);
      return;
    }
    setDone(true);
  }

  const target =
    item.reps != null ? `${item.reps} חזרות` : `${item.seconds} שניות`;

  return (
    <Shell>
      {/* כותרת + התקדמות */}
      <div className="mb-5 flex items-center justify-between">
        <Link href="/client" className="text-sm" style={{ color: "var(--dim)" }}>
          ← יציאה
        </Link>
        <span className="text-sm" style={{ color: "var(--dim)" }}>
          תרגיל {index + 1} מתוך {items.length}
        </span>
      </div>

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

      {/* וידאו או מציין מקום */}
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
            src={`/videos/${encodeURIComponent(item.videoFile)}`}
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

      {/* המספרים הגדולים */}
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
      </div>

      {/* גובה הטבעת ומנח הגוף — שני המרכיבים שקובעים קושי */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <Chip label="גובה הטבעת" value={item.ringHeight ?? "חופשי"} />
        <Chip label="מנח הגוף" value={item.bodyAngle ?? "רגיל"} />
      </div>

      {/* טכניקה — גלויה תוך כדי, לא מוסתרת מאחורי לחיצה */}
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

      {/* מנוחה או המשך */}
      {resting > 0 ? (
        <div className="glass rounded-3xl p-6 text-center">
          <p className="mb-1 text-sm" style={{ color: "var(--dim)" }}>
            מנוחה
          </p>
          <p className="mb-4 text-5xl font-extrabold tabular-nums">{mmss(resting)}</p>
          <button
            onClick={() => setResting(0)}
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
        <button
          onClick={nextSet}
          className="wood w-full rounded-2xl py-5 text-xl font-extrabold"
          style={{
            color: "#f7ebda",
            boxShadow:
              "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
          }}
        >
          {isLastSet && isLastExercise ? "סיים אימון" : "סיימתי את הסט"}
        </button>
      )}
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
  onSaved,
}: {
  programId: string;
  workoutId: string;
  rehabMode: boolean;
  durationSec: number;
  onSaved: () => void;
}) {
  const [mood, setMood] = useState("");
  const [pain, setPain] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/client/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, workoutId, durationSec, mood, painLevel: pain }),
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
