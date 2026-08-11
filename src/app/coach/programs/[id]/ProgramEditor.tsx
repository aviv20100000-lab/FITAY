"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { programLevelName } from "@/lib/program-levels";
import { Bidi } from "@/components/Bidi";

type Program = {
  id: string;
  title: string;
  description: string;
  level: number;
  weeks: number;
  isTemplate: boolean;
  assigned: number;
};
type Workout = { id: string; title: string; phase: number };
type Item = {
  id: string;
  workoutId: string;
  name: string;
  sets: number;
  reps: number | null;
  seconds: number | null;
  /** תחתית טווח העבודה. null = ברירת מחדל, 60 אחוז מהתקרה. */
  targetMin: number | null;
  rest: number;
  ringHeight: string | null;
  bodyAngle: string | null;
  notes: string;
  isHold: boolean;
  /** amrap נשאר מחוץ למנגנון הטווח — זמן קצוב הוא כבר מדידה בפני עצמה. */
  isAmrap: boolean;
};
type Ex = { id: string; name: string; type: string };

/** תחתית ברירת המחדל, אותו חישוב כמו rangeFloor בשרת. */
function defaultFloor(ceiling: number | null): number | null {
  if (ceiling == null) return null;
  return Math.max(1, Math.round(ceiling * 0.6));
}

const field: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  color: "var(--text)",
};

const panel: React.CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--line)",
};

/** מזיז פריט אחד במערך ומחזיר מערך חדש. משמש לסידור מחדש. */
function moved<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = arr.slice();
  const [row] = copy.splice(from, 1);
  copy.splice(to, 0, row);
  return copy;
}

export default function ProgramEditor({
  program,
  workouts,
  items,
  exercises,
}: {
  program: Program;
  workouts: Workout[];
  items: Item[];
  exercises: Ex[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<string | null>(null);
  const [editingProgram, setEditingProgram] = useState(false);

  /*
   * כל הפעולות כאן עוברות דרך אותו שולח.
   *
   * בלעדיו כשל רשת השאיר את המסך על busy לצמיתות: כל הכפתורים מושבתים,
   * בלי הודעה ובלי דרך לנסות שוב, ואיתי היה צריך לרענן כדי להבין שכלום
   * לא נשמר. תשובה שנכשלה גם היא נאמרת, כי רענון בלי שינוי נראה בדיוק
   * כמו שמירה שהצליחה.
   */
  async function send(url: string, init?: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "הפעולה נכשלה");
        return false;
      }
      return true;
    } catch {
      alert("אין חיבור לרשת. נסה שוב.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const json = (method: string, body: object): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  async function addWorkout() {
    const title = prompt("שם האימון (למשל: אימון A · דחיפה)");
    if (!title?.trim()) return;
    await send(
      "/api/coach/workouts",
      json("POST", { programId: program.id, title: title.trim(), phase: 1 })
    );
    router.refresh();
  }

  async function removeWorkout(id: string) {
    if (!confirm("למחוק את האימון וכל התרגילים שבו?")) return;
    await send(`/api/coach/workouts?id=${id}`, { method: "DELETE" });
    setEditingWorkout(null);
    router.refresh();
  }

  async function moveWorkout(index: number, dir: -1 | 1) {
    const order = moved(workouts, index, index + dir).map((w) => w.id);
    if (order[index] === workouts[index].id) return;
    await send("/api/coach/workouts", json("PATCH", { order }));
    router.refresh();
  }

  async function removeItem(id: string) {
    if (!confirm("להסיר את התרגיל מהאימון?")) return;
    await send(`/api/coach/workout-items?id=${id}`, { method: "DELETE" });
    setEditingItem(null);
    router.refresh();
  }

  async function moveItem(list: Item[], index: number, dir: -1 | 1) {
    const order = moved(list, index, index + dir).map((i) => i.id);
    if (order[index] === list[index].id) return;
    await send("/api/coach/workout-items", json("PATCH", { order }));
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">ניהול התוכנית</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--dim)" }}>
            עריכת פרטים והוספת אימונים
          </p>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={addWorkout}
          disabled={busy}
          className="wood rounded-2xl px-3 py-4 text-sm font-extrabold disabled:opacity-60"
          style={{
            color: "var(--on-wood)",
            boxShadow: "var(--button-shadow)",
          }}
        >
          + אימון חדש
        </button>
        <button
          type="button"
          onClick={() => setEditingProgram((v) => !v)}
          className="rounded-2xl px-3 py-4 text-sm font-bold"
          style={{ ...panel, color: "var(--wood-1)" }}
        >
          {editingProgram ? "סגור" : "שינוי שם ופרטים"}
        </button>
      </div>

      {editingProgram && (
        <ProgramForm
          program={program}
          onDone={() => {
            setEditingProgram(false);
            router.refresh();
          }}
        />
      )}

      {workouts.length === 0 && (
        <p
          className="glass rounded-3xl px-6 py-10 text-center text-sm"
          style={{ color: "var(--dim)" }}
        >
          עוד אין אימונים בתוכנית הזו
        </p>
      )}

      {workouts.length > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">האימונים בתוכנית</h2>
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-bold"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              color: "var(--dim)",
            }}
          >
            {workouts.length}
          </span>
        </div>
      )}

      <div className="space-y-4">
        {workouts.map((w, wIndex) => {
          const mine = items.filter((i) => i.workoutId === w.id);
          return (
            <div key={w.id} className="glass overflow-hidden rounded-3xl">
              <div
                className="h-1"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(224,190,147,.65), transparent)",
                }}
              />
              <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold"
                    style={{
                      background: "rgba(180,133,79,.16)",
                      border: "1px solid rgba(224,190,147,.28)",
                      color: "var(--wood-1)",
                    }}
                  >
                    {wIndex + 1}
                  </span>
                  <div className="min-w-0 pt-0.5">
                  <p className="truncate text-lg font-extrabold">{w.title}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>
                    שלב {w.phase} · {mine.length} תרגילים
                  </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Arrow
                    dir="up"
                    disabled={busy || wIndex === 0}
                    onClick={() => moveWorkout(wIndex, -1)}
                  />
                  <Arrow
                    dir="down"
                    disabled={busy || wIndex === workouts.length - 1}
                    onClick={() => moveWorkout(wIndex, 1)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditingWorkout(editingWorkout === w.id ? null : w.id)
                    }
                    className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                    style={{ background: "rgba(180,133,79,.12)", color: "var(--wood-1)" }}
                  >
                    ערוך
                  </button>
                </div>
              </div>

              {editingWorkout === w.id && (
                <WorkoutForm
                  workout={w}
                  busy={busy}
                  onDelete={() => removeWorkout(w.id)}
                  onDone={() => {
                    setEditingWorkout(null);
                    router.refresh();
                  }}
                  onCancel={() => setEditingWorkout(null)}
                />
              )}

              {mine.map((i, iIndex) =>
                editingItem === i.id ? (
                  <ItemForm
                    key={i.id}
                    item={i}
                    exercises={exercises}
                    workoutId={w.id}
                    onDone={() => {
                      setEditingItem(null);
                      router.refresh();
                    }}
                    onCancel={() => setEditingItem(null)}
                    onDelete={() => removeItem(i.id)}
                  />
                ) : (
                  <div
                    key={i.id}
                    className="mb-2 flex items-center gap-2 rounded-2xl px-3 py-3.5"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Arrow
                        dir="up"
                        small
                        disabled={busy || iIndex === 0}
                        onClick={() => moveItem(mine, iIndex, -1)}
                      />
                      <Arrow
                        dir="down"
                        small
                        disabled={busy || iIndex === mine.length - 1}
                        onClick={() => moveItem(mine, iIndex, 1)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingItem(i.id)}
                      className="min-w-0 flex-1 text-right"
                    >
                      <p className="truncate font-semibold">{i.name}</p>
                      <p className="text-xs" style={{ color: "var(--dim)" }}>
                        {i.sets} סטים ·{" "}
                        {/* טווח העבודה: תחתית עד תקרה. amrap נשאר יעד יחיד. */}
                        <Bidi
                          text={
                            i.isAmrap
                              ? `${i.seconds} שניות`
                              : i.reps != null
                                ? `${i.targetMin ?? defaultFloor(i.reps)}–${i.reps} חזרות`
                                : `${i.targetMin ?? defaultFloor(i.seconds)}–${i.seconds} שניות`
                          }
                        />{" "}
                        ·{" "}
                        {i.rest} שנ׳ מנוחה
                        {i.bodyAngle && ` · ${i.bodyAngle}`}
                      </p>
                    </button>
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
                  </div>
                )
              )}

              {addingTo === w.id ? (
                <ItemForm
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
                  type="button"
                  onClick={() => setAddingTo(w.id)}
                  className="mt-3 w-full rounded-2xl py-3.5 text-sm font-bold"
                  style={{ ...panel, color: "var(--wood-1)" }}
                >
                  + הוסף תרגיל
                </button>
              )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── עריכת פרטי התוכנית ──────────────────────────────────────────────── */

function ProgramForm({ program, onDone }: { program: Program; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(program.title);
  const [description, setDescription] = useState(program.description);
  const [level, setLevel] = useState(String(program.level));
  const [isTemplate, setIsTemplate] = useState(program.isTemplate);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/coach/programs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: program.id,
          title,
          description,
          level: Number(level),
          weeks: program.weeks,
          isTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "לא הצלחנו לשמור את התוכנית");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setError("לא הצלחנו לשמור. בדוק את החיבור ונסה שוב.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`למחוק את "${program.title}" וכל האימונים שבה? אין דרך חזרה.`)) return;
    setError("");
    setBusy(true);
    let res: Response;
    try {
      res = await fetch(`/api/coach/programs?id=${program.id}`, { method: "DELETE" });
    } catch {
      setError("לא הצלחנו למחוק. בדוק את החיבור ונסה שוב.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "לא הצלחנו למחוק את התוכנית");
      setBusy(false);
      return;
    }
    router.push("/coach/programs");
  }

  return (
    <form
      className="mb-6 rounded-3xl p-5"
      style={panel}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="mb-1 text-lg font-bold">שינוי שם ופרטי תוכנית</h2>
      <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--dim)" }}>
        השם שתכתוב כאן הוא השם שיופיע למתאמנים.
      </p>

      <label className="mb-1.5 block text-sm font-semibold">
        שם התוכנית
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full rounded-xl px-3 py-3 outline-none"
        style={field}
        maxLength={80}
        autoFocus
      />

      <label className="mb-1.5 block text-sm font-semibold">
        תיאור קצר שמבדיל את התוכנית
      </label>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
        maxLength={180}
        className="mb-3 w-full resize-none rounded-xl px-3 py-3 text-sm leading-relaxed outline-none"
        style={field}
        placeholder="למשל: בסיס למתאמן חדש עם דגש על שליטה ומשיכה"
      />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
            רמה
          </label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-full rounded-xl px-3 py-3 outline-none"
            style={field}
          >
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                {programLevelName(value)}
              </option>
            ))}
          </select>
        </div>
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ border: "1px solid var(--border-2)", background: "var(--surface-1)" }}
        >
          <span className="block text-xs" style={{ color: "var(--dim)" }}>
            אורך התוכנית
          </span>
          <strong className="mt-1 block text-sm">24 אימונים</strong>
        </div>
      </div>

      {/*
        תבנית היא גם רשימת האפשרויות באישור מעבר רמה. תוכנית שלא מסומנת
        כאן פשוט לא תופיע שם, ולכן ההסבר צריך להיות בגוף המתג ולא בטולטיפ.
      */}
      <button
        type="button"
        onClick={() => setIsTemplate(!isTemplate)}
        className="mb-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right"
        style={{
          background: isTemplate ? "var(--wood-wash-strong)" : "var(--surface-1)",
          border: `1px solid ${isTemplate ? "var(--wood-border-light)" : "var(--line)"}`,
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">תבנית</span>
          <span className="block text-xs" style={{ color: "var(--dim)" }}>
            תבנית משמשת בסיס לתוכניות חדשות, ואפשר להעביר אליה מתאמן באישור
            מעבר רמה
          </span>
        </span>
        <span
          className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
          style={{ background: isTemplate ? "var(--wood-2)" : "var(--surface-3)" }}
        >
          <span
            className="absolute top-1 h-5 w-5 rounded-full transition-all"
            style={{
              background: "var(--on-wood)",
              insetInlineStart: isTemplate ? "calc(100% - 1.5rem)" : "0.25rem",
            }}
          />
        </span>
      </button>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}

      {program.assigned > 0 && (
        <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--dim)" }}>
          השינוי יופיע אצל {program.assigned} מתאמנים שמשויכים לתוכנית.
        </p>
      )}

      <div className="mb-3 flex gap-2">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="wood flex-1 rounded-xl py-3 font-extrabold disabled:opacity-60"
          style={{ color: "var(--on-wood)", boxShadow: "var(--button-shadow)" }}
        >
          {busy ? "שומר…" : "שמור שינויים"}
        </button>
      </div>

      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
        style={{ border: "1px solid rgba(229,72,77,.4)", color: "var(--danger-text)" }}
      >
        מחק תוכנית
        {program.assigned > 0 &&
          (program.assigned === 1
            ? " (משויכת למתאמן אחד)"
            : ` (משויכת ל-${program.assigned} מתאמנים)`)}
      </button>
    </form>
  );
}

/* ── עריכת אימון ─────────────────────────────────────────────────────── */

function WorkoutForm({
  workout,
  busy,
  onDone,
  onCancel,
  onDelete,
}: {
  workout: Workout;
  busy: boolean;
  onDone: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(workout.title);
  const [phase, setPhase] = useState(String(workout.phase));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setError("");
    setSaving(true);
    let res: Response;
    try {
      res = await fetch("/api/coach/workouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: workout.id, title, phase: Number(phase) }),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setSaving(false);
      return;
    }
    // json() נשבר גם על תשובת שגיאה שאינה JSON, ואז הכפתור נשאר על
    // "רגע…" בלי שאיתי יראה מה קרה.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "לא הצלחנו לשמור את האימון");
      setSaving(false);
      return;
    }
    onDone();
  }

  return (
    <div className="mb-4 rounded-2xl p-4" style={panel}>
      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        שם האימון
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full rounded-xl px-3 py-3 outline-none"
        style={field}
      />

      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        שלב. כל רמה מחולקת לשניים
      </label>
      <select
        value={phase}
        onChange={(e) => setPhase(e.target.value)}
        className="mb-4 w-full rounded-xl px-3 py-3 outline-none"
        style={field}
      >
        <option value="1">שלב 1</option>
        <option value="2">שלב 2</option>
      </select>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--dim)" }}
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="wood flex-1 rounded-xl py-3 font-extrabold disabled:opacity-60"
          style={{ color: "var(--on-wood)", boxShadow: "var(--button-shadow)" }}
        >
          {saving ? "רגע…" : "שמור"}
        </button>
      </div>

      <button
        type="button"
        onClick={onDelete}
        disabled={busy || saving}
        className="w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
        style={{ border: "1px solid rgba(229,72,77,.4)", color: "var(--danger-text)" }}
      >
        מחק אימון
      </button>
    </div>
  );
}

/* ── הוספה ועריכה של תרגיל — אותו טופס ───────────────────────────────── */

function ItemForm({
  workoutId,
  exercises,
  item,
  onDone,
  onCancel,
  onDelete,
}: {
  workoutId: string;
  exercises: Ex[];
  item?: Item;
  onDone: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const editing = item != null;
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? "");
  const [sets, setSets] = useState(item ? String(item.sets) : "3");
  const [reps, setReps] = useState(item?.reps != null ? String(item.reps) : editing ? "" : "10");
  const [seconds, setSeconds] = useState(item?.seconds != null ? String(item.seconds) : "");
  // תחתית טווח העבודה. ריק = ברירת המחדל של 60 אחוז מהתקרה.
  const [targetMin, setTargetMin] = useState(
    item?.targetMin != null ? String(item.targetMin) : ""
  );
  const [rest, setRest] = useState(item ? String(item.rest) : "60");
  const [ringHeight, setRingHeight] = useState(item?.ringHeight ?? "");
  const [bodyAngle, setBodyAngle] = useState(item?.bodyAngle ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = exercises.find((e) => e.id === exerciseId);
  // בהוספה סוג התרגיל נגזר מהתרגיל שנבחר. בעריכה עדיף ללכת לפי מה שכבר
  // רשום בשורה — כך שורה חריגה נפתחת עם השדה שבאמת מלא בה.
  const isHold = editing
    ? item!.seconds != null || (item!.reps == null && item!.isHold)
    : selected?.type === "hold" || selected?.type === "amrap";
  const isAmrap = editing ? item!.isAmrap : selected?.type === "amrap";
  const ceilingValue = Number(isHold ? seconds : reps) || null;

  async function save() {
    setError("");
    setBusy(true);
    const payload = {
      sets: Number(sets),
      reps: isHold ? null : reps,
      seconds: isHold ? seconds : null,
      targetMin: isAmrap ? null : targetMin,
      rest: Number(rest),
      ringHeight,
      bodyAngle,
      notes,
    };
    let res: Response;
    try {
      res = await fetch("/api/coach/workout-items", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing ? { id: item!.id, ...payload } : { workoutId, exerciseId, ...payload }
        ),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "לא הצלחנו לשמור את התרגיל");
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <div className="mb-2 mt-3 rounded-2xl p-4" style={panel}>
      {editing ? (
        <p className="mb-3 text-base font-bold">{item!.name}</p>
      ) : (
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
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Num label="סטים" value={sets} onChange={setSets} />
        {isHold ? (
          <Num label={isAmrap ? "שניות" : "תקרה · שניות"} value={seconds} onChange={setSeconds} />
        ) : (
          <Num label="תקרה · חזרות" value={reps} onChange={setReps} />
        )}
        <Num label="מנוחה" value={rest} onChange={setRest} />
      </div>

      {/*
        תחתית טווח העבודה. המתאמן מטפס מהתחתית אל התקרה, וכשהוא עובר
        את התקרה בכל הסטים התרגיל מוקשה. ריק = 60 אחוז מהתקרה.
      */}
      {!isAmrap && (
        <div className="mb-3">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
            תחתית הטווח. אם תשאיר ריק
            {ceilingValue != null
              ? `, התחתית תהיה ${Math.max(1, Math.round(ceilingValue * 0.6))}`
              : ", התחתית תהיה 60 אחוז מהתקרה"}
          </label>
          <input
            value={targetMin}
            onChange={(e) => setTargetMin(e.target.value)}
            inputMode="numeric"
            placeholder={
              ceilingValue != null
                ? String(Math.max(1, Math.round(ceilingValue * 0.6)))
                : ""
            }
            className="w-full rounded-xl px-3 py-3 outline-none"
            style={field}
          />
        </div>
      )}

      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        גובה הטבעת. אם תשאיר ריק, המתאמן יבחר מה שנוח לו
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
        className="mb-3 w-full rounded-xl px-3 py-3 outline-none"
        style={field}
      />

      {/*
        הדגש אישי לתרגיל הזה אצל המתאמן הזה, בנפרד מההדגשים הקבועים של
        התרגיל בספרייה. המתאמן רואה אותו במסך התרגיל באמצע האימון.
      */}
      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        הדגש למתאמן. יופיע לו בתרגיל הזה בלבד
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        maxLength={280}
        placeholder="למשל: שים לב לכתף הימנית, בלי למהר"
        className="mb-4 w-full resize-none rounded-xl px-3 py-3 outline-none"
        style={field}
      />

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--dim)" }}
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="wood flex-1 rounded-xl py-3 font-extrabold disabled:opacity-60"
          style={{ color: "var(--on-wood)", boxShadow: "var(--button-shadow)" }}
        >
          {busy ? "רגע…" : editing ? "שמור" : "הוסף"}
        </button>
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="mt-3 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
          style={{ border: "1px solid rgba(229,72,77,.4)", color: "var(--danger-text)" }}
        >
          הסר תרגיל
        </button>
      )}
    </div>
  );
}

/* ── חלקים קטנים ─────────────────────────────────────────────────────── */

function Arrow({
  dir,
  onClick,
  disabled,
  small,
}: {
  dir: "up" | "down";
  onClick: () => void;
  disabled: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "up" ? "העלה" : "הורד"}
      className={`rounded-lg leading-none disabled:opacity-25 ${
        small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1.5 text-xs"
      }`}
      style={{ background: "var(--surface-2)", color: "var(--dim)" }}
    >
      {dir === "up" ? "▲" : "▼"}
    </button>
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
