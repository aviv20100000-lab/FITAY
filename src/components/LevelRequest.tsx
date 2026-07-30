"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * בקשת מעבר לרמה הבאה.
 *
 * המעבר אינו אוטומטי בכוונה. ב-FITAY ביקשו שהמתאמן ישלח בקשה לאישור, כדי שלא
 * ירוצו לרמה הבאה לפני שהם יציבים בנוכחית.
 *
 * מוצג רק כשיש תוכנית פעילה, ונעלם ברגע שנשלחה בקשה.
 */
export default function LevelRequest({
  programId,
  programTitle,
  pending,
}: {
  programId: string;
  programTitle: string;
  pending: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (pending) {
    return (
      <div
        className="mb-1 rounded-[1.4rem] px-4 py-3.5"
        style={{
          background: "rgba(180,133,79,.12)",
          border: "1px solid rgba(224,190,147,.28)",
        }}
      >
        <p className="text-sm font-extrabold" style={{ color: "var(--wood-1)" }}>
          הבקשה נשלחה
        </p>
        <p className="mt-0.5 text-xs leading-5" style={{ color: "var(--dim)" }}>
          הבקשה תיבדק ב-FITAY, ותקבל עדכון לגבי המעבר לרמה הבאה.
        </p>
      </div>
    );
  }

  async function send() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/client/level-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, note: note.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "לא הצלחנו לשלוח");
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-1 flex w-full items-center gap-3 rounded-[1.4rem] px-4 py-3.5 text-right"
        style={{
          background: "var(--soft-1)",
          border: "1px solid var(--line)",
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold">סיימתי את הרמה</span>
          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--dim)" }}>
            שליחת בקשת מעבר ל-FITAY
          </span>
        </span>
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold"
          style={{
            background: "rgba(180,133,79,.12)",
            border: "1px solid rgba(224,190,147,.22)",
            color: "var(--wood-1)",
          }}
        >
          ←
        </span>
      </button>
    );
  }

  return (
    <div
      className="mb-1 rounded-[1.4rem] p-4"
      style={{
        background: "var(--soft-1)",
        border: "1px solid rgba(224,190,147,.2)",
      }}
    >
      <p className="mb-1 font-extrabold">בקשת מעבר לרמה הבאה</p>
      <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        הבקשה היא לעבור מ־{programTitle} לרמה הבאה. היא תיבדק ב-FITAY.
        עד שתקבל אישור, תמשיך להתאמן בתוכנית הנוכחית.
      </p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="משהו שכדאי שידע? לא חובה"
        className="mb-4 w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
        style={{
          background: "var(--soft-2)",
          border: "1px solid var(--line)",
          color: "var(--text)",
        }}
      />

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={send}
          disabled={busy}
          className="wood flex-1 rounded-2xl py-3.5 font-extrabold disabled:opacity-60"
          style={{ color: "#f7ebda" }}
        >
          {busy ? "שולח…" : "שלח בקשה"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-2xl px-5 text-sm font-semibold"
          style={{ background: "var(--soft-2)", color: "var(--dim)" }}
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
