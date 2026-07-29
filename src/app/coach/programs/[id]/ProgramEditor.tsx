"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Workout = { id: string; title: string; phase: number };
type Item = {
  id: string;
  workoutId: string;
  name: string;
  sets: number;
  reps: number | null;
  seconds: number | null;
  rest: number;
  ringHeight: string | null;
  bodyAngle: string | null;
};
type Ex = { id: string; name: string; type: string };

const field: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid var(--line)",
  color: "var(--text)",
};

export default function ProgramEditor({
  programId,
  workouts,
  items,
  exercises,
}: {
  programId: string;
  workouts: Workout[];
  items: Item[];
  exercises: Ex[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  async function addWorkout() {
    const title = prompt("שם האימון (למשל: אימון A — דחיפה)");
    if (!title?.trim()) return;
    setBusy(true);
    await fetch("/api/coach/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, title: title.trim(), phase: 1 }),
    });
    setBusy(false);
    router.refresh();
  }

  async function removeWorkout(id: string) {
    if (!confirm("למחוק את האימון וכל התרגילים שבו?")) return;
    setBusy(true);
    await fetch(`/api/coach/workouts?id=${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  async function removeItem(id: string) {
    setBusy(true);
    await fetch(`/api/coach/workout-items?id=${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={addWorkout}
        disabled={busy}
        className="wood mb-6 w-full rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
        style={{
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        + אימון חדש
      </button>

      {workouts.length === 0 && (
        <p
          className="glass rounded-3xl px-6 py-10 text-center text-sm"
          style={{ color: "var(--dim)" }}
        >
          עוד אין אימונים בתוכנית הזו
        </p>
      )}

      <div className="space-y-4">
        {workouts.map((w) => {
          const mine = items.filter((i) => i.workoutId === w.id);
          return (
            <div key={w.id} className="glass rounded-3xl p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{w.title}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>
                    שלב {w.phase} · {mine.length} תרגילים
                  </p>
                </div>
                <button
                  onClick={() => removeWorkout(w.id)}
                  className="shrink-0 text-xs"
                  style={{ color: "#e5484d" }}
                >
                  מחק
                </button>
              </div>

              {mine.map((i) => (
                <div
                  key={i.id}
                  className="mb-2 flex items-center gap-3 rounded-2xl px-3.5 py-3"
                  style={{ background: "rgba(255,255,255,.04)" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{i.name}</p>
                    <p className="text-xs" style={{ color: "var(--dim)" }}>
                      {i.sets} סטים ·{" "}
                      {i.reps != null ? `${i.reps} חזרות` : `${i.seconds} שניות`} ·{" "}
                      {i.rest} שנ׳ מנוחה
                      {i.bodyAngle && ` · ${i.bodyAngle}`}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-xl px-2.5 py-1.5 text-center text-xs font-bold"
                    style={{
                      background: "rgba(180,133,79,.18)",
                      border: "1px solid rgba(224,190,147,.32)",
                      color: "var(--wood-1)",
                    }}
                    title="גובה הטבעת"
                  >
                    {i.ringHeight ?? "חופשי"}
                  </span>
                  <button
                    onClick={() => removeItem(i.id)}
                    className="shrink-0 px-1 text-lg leading-none"
                    style={{ color: "var(--faint)" }}
                    aria-label="הסר תרגיל"
                  >
                    ×
                  </button>
                </div>
              ))}

              {addingTo === w.id ? (
                <AddItem
                  workoutId={w.id}
                  exercises={exercises}
                  onDone={() => {
                    setAddingTo(null);
                    router.refresh();
                  }}
                  onCancel={() => setAddingTo(null)}
                />
              ) : (
                <button
                  onClick={() => setAddingTo(w.id)}
                  className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold"
                  style={{
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid var(--line)",
                    color: "var(--wood-1)",
                  }}
                >
                  + הוסף תרגיל
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AddItem({
  workoutId,
  exercises,
  onDone,
  onCancel,
}: {
  workoutId: string;
  exercises: Ex[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? "");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [seconds, setSeconds] = useState("");
  const [rest, setRest] = useState("60");
  const [ringHeight, setRingHeight] = useState("");
  const [bodyAngle, setBodyAngle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = exercises.find((e) => e.id === exerciseId);
  const isHold = selected?.type === "hold" || selected?.type === "amrap";

  async function save() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/coach/workout-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutId,
        exerciseId,
        sets: Number(sets),
        reps: isHold ? null : reps,
        seconds: isHold ? seconds : null,
        rest: Number(rest),
        ringHeight,
        bodyAngle,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "משהו השתבש");
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <div
      className="mt-3 rounded-2xl p-4"
      style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--line)" }}
    >
      <select
        value={exerciseId}
        onChange={(e) => setExerciseId(e.target.value)}
        className="mb-3 w-full rounded-xl px-3 py-3 outline-none"
        style={field}
      >
        {exercises.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Num label="סטים" value={sets} onChange={setSets} />
        {isHold ? (
          <Num label="שניות" value={seconds} onChange={setSeconds} />
        ) : (
          <Num label="חזרות" value={reps} onChange={setReps} />
        )}
        <Num label="מנוחה" value={rest} onChange={setRest} />
      </div>

      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        גובה הטבעת — ריק = המתאמן בוחר מה שנוח
      </label>
      <input
        value={ringHeight}
        onChange={(e) => setRingHeight(e.target.value)}
        placeholder="למשל: 12 / גובה חזה"
        className="mb-3 w-full rounded-xl px-3 py-3 outline-none"
        style={field}
      />

      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        מנח הגוף
      </label>
      <input
        value={bodyAngle}
        onChange={(e) => setBodyAngle(e.target.value)}
        placeholder="למשל: שיפוע 45°"
        className="mb-4 w-full rounded-xl px-3 py-3 outline-none"
        style={field}
      />

      {error && (
        <p className="mb-3 text-sm" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ background: "rgba(255,255,255,.06)", color: "var(--dim)" }}
        >
          ביטול
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="wood flex-1 rounded-xl py-3 font-extrabold disabled:opacity-60"
          style={{ color: "#f7ebda", boxShadow: "inset 0 1px 0 rgba(255,255,255,.28)" }}
        >
          {busy ? "רגע…" : "הוסף"}
        </button>
      </div>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        {label}
      </label>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl px-3 py-3 text-center outline-none"
        style={field}
      />
    </div>
  );
}
