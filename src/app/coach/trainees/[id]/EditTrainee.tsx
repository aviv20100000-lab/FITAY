"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const field: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid var(--line)",
  color: "var(--text)",
};

/** עריכת מתאמן קיים. נפתח בלחיצה — במסך הרגיל איתי רוצה לראות נתונים, לא טופס. */
export default function EditTrainee({
  traineeId,
  name: initialName,
  active: initialActive,
  notes: initialNotes,
}: {
  traineeId: string;
  name: string;
  active: boolean;
  notes: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [active, setActive] = useState(initialActive);
  const [notes, setNotes] = useState(initialNotes);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setError("");
    setSaved(false);
    setBusy(true);
    const res = await fetch("/api/coach/trainees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: traineeId,
        name,
        active,
        notes,
        password: password || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחתי לשמור");
      setBusy(false);
      return;
    }
    setPassword("");
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 w-full rounded-2xl py-3.5 font-semibold"
        style={{
          background: "rgba(255,255,255,.06)",
          border: "1px solid var(--line)",
          color: "var(--wood-1)",
        }}
      >
        עריכת פרטים
      </button>
    );
  }

  return (
    <div className="glass mb-6 rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-lg font-bold">עריכת פרטים</p>
        <button
          onClick={() => setOpen(false)}
          className="text-sm"
          style={{ color: "var(--dim)" }}
        >
          סגור
        </button>
      </div>

      <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
        שם
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-5 w-full rounded-2xl px-4 py-3.5 outline-none"
        style={field}
      />

      {/*
        מתג מצב השיקום הוסר. דיווח הכאב שהוא פתח נמצא עכשיו אצל כל מתאמן
        בסוף כל אימון, ולכן המתג היה מיותר. העמודה במסד נשארה, ולא נמחק
        שום נתון.
      */}

      <Toggle
        label="חשבון פעיל"
        hint="כיבוי מנתק אותו מכל המכשירים ומונע כניסה"
        checked={active}
        onChange={setActive}
      />

      <label className="mb-2 mt-5 block text-sm" style={{ color: "var(--dim)" }}>
        הערות
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="פציעות, מגבלות, כל מה שחשוב לזכור"
        className="mb-5 w-full resize-none rounded-2xl px-4 py-3.5 outline-none"
        style={field}
      />

      <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
        סיסמה חדשה
      </label>
      <input
        type="text"
        dir="ltr"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="השאר ריק כדי לא לשנות"
        className="mb-1.5 w-full rounded-2xl px-4 py-3.5 outline-none"
        style={field}
      />
      <p className="mb-5 text-xs" style={{ color: "var(--faint)" }}>
        שינוי סיסמה מנתק אותו מכל המכשירים. תמסור לו אותה בעצמך.
      </p>

      {error && (
        <p
          className="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(229,72,77,.12)",
            border: "1px solid rgba(229,72,77,.3)",
            color: "#ffb4b6",
          }}
        >
          {error}
        </p>
      )}

      {saved && (
        <p className="mb-4 text-center text-sm" style={{ color: "var(--wood-1)" }}>
          נשמר
        </p>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="wood w-full rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
        style={{
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        {busy ? "שומר…" : "שמור"}
      </button>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const on = "var(--wood-2)";
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="mb-3 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-right"
      style={{
        background: checked ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)",
        border: `1px solid ${checked ? on : "var(--line)"}`,
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{label}</p>
        <p className="text-xs" style={{ color: "var(--dim)" }}>
          {hint}
        </p>
      </div>
      <span
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? on : "rgba(255,255,255,.12)" }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full transition-all"
          style={{
            background: "#f7ebda",
            insetInlineStart: checked ? "calc(100% - 1.5rem)" : "0.25rem",
          }}
        />
      </span>
    </button>
  );
}
