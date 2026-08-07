"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const field: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid var(--line)",
  color: "var(--text)",
};

/**
 * החשבון של מאמן FITAY עצמו: שם וסיסמה.
 *
 * סגור כברירת מחדל, כמו עריכת מתאמן. זו פעולה של פעם בשנה, ואין סיבה
 * שהיא תתפוס מקום במסך שנפתח כל בוקר.
 */
export default function CoachAccount({ name: initialName }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setError("");
    setSaved(false);

    if (password.trim() && !currentPassword) {
      setError("צריך את הסיסמה הנוכחית כדי להחליף אותה");
      return;
    }

    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/coach/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          password: password.trim() || undefined,
          currentPassword: password.trim() ? currentPassword : undefined,
        }),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    setCurrentPassword("");
    setPassword("");
    setSaved(true);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 w-full rounded-2xl py-3.5 font-semibold"
        style={{
          background: "rgba(255,255,255,.06)",
          border: "1px solid var(--line)",
          color: "var(--wood-1)",
        }}
      >
        החשבון שלי
      </button>
    );
  }

  return (
    <div className="glass mb-6 rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-lg font-bold">החשבון שלי</p>
        <button
          type="button"
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

      <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
        הסיסמה הנוכחית
      </label>
      <input
        type="password"
        dir="ltr"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="רק אם אתה מחליף סיסמה"
        className="mb-5 w-full rounded-2xl px-4 py-3.5 outline-none"
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
        autoComplete="new-password"
        spellCheck={false}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="השאר ריק כדי לא לשנות"
        className="mb-1.5 w-full rounded-2xl px-4 py-3.5 outline-none"
        style={field}
      />
      <p className="mb-5 text-xs" style={{ color: "var(--faint)" }}>
        שאר המכשירים שלך יתנתקו. המכשיר הזה נשאר מחובר.
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
        type="button"
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
