"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * מחיקת מתאמן.
 *
 * מוצג אחרון במסך ובצבע אזהרה, כי הוא שכן של כפתורים שנלחצים כל יום.
 *
 * שלוש הגנות, וכל אחת מהן קיימת בגלל שהפעולה בלתי הפיכה:
 *   • סגור כברירת מחדל, ונפתח בלחיצה נפרדת.
 *   • מציג בדיוק כמה אימונים וכמה סטים יימחקו, במספרים אמיתיים.
 *   • דורש להקליד את שם המתאמן. השרת בודק את זה שוב.
 *
 * למי שרק רוצה לחסום כניסה יש כיבוי חשבון, והטקסט מפנה לשם.
 */
export default function DeleteTrainee({
  traineeId,
  traineeName,
  completions,
  loggedSets,
}: {
  traineeId: string;
  traineeName: string;
  completions: number;
  loggedSets: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const matches = typed.trim() === traineeName.trim();

  async function remove() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/coach/trainees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: traineeId, confirmName: typed.trim() }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "המחיקה נכשלה");
      setBusy(false);
      return;
    }
    router.replace("/coach");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-8 w-full rounded-2xl py-3 text-sm font-semibold"
        style={{ background: "transparent", color: "var(--faint)" }}
      >
        מחיקת המתאמן
      </button>
    );
  }

  return (
    <div
      className="mt-8 rounded-3xl p-5"
      style={{
        background: "rgba(229,72,77,.08)",
        border: "1px solid rgba(229,72,77,.32)",
      }}
    >
      <p className="mb-1 font-bold" style={{ color: "#ffb4b6" }}>
        למחוק את {traineeName}?
      </p>
      <p className="mb-3 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        זה בלתי הפיך. יימחקו גם:
      </p>

      <ul className="mb-3 space-y-1 text-sm" style={{ color: "var(--dim)" }}>
        <li>· {completions} אימונים שהושלמו</li>
        <li>· {loggedSets} סטים שנרשמו, וכל ההיסטוריה של ההתקדמות</li>
        <li>· שיוכי התוכניות שלו וההתראות שלו</li>
      </ul>

      <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        אם אתה רק רוצה שהוא לא יוכל להיכנס, סגור את זה ותכבה לו את החשבון
        בעריכת פרטים. זה הפיך ולא מוחק כלום.
      </p>

      <label className="mb-2 block text-xs" style={{ color: "var(--dim)" }}>
        להמשך, הקלד את השם: {traineeName}
      </label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="mb-4 w-full rounded-2xl px-4 py-3 outline-none"
        style={{
          background: "rgba(255,255,255,.05)",
          border: "1px solid var(--line)",
          color: "var(--text)",
        }}
      />

      {error && (
        <p className="mb-3 text-sm" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={remove}
          disabled={busy || !matches}
          className="flex-1 rounded-2xl py-3.5 font-extrabold disabled:opacity-40"
          style={{
            background: "rgba(229,72,77,.9)",
            color: "#fff",
          }}
        >
          {busy ? "מוחק…" : "מחק לצמיתות"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError("");
          }}
          className="rounded-2xl px-5 text-sm font-semibold"
          style={{ background: "rgba(255,255,255,.06)", color: "var(--dim)" }}
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
