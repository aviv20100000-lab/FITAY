"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * בקשת מעבר לרמה הבאה.
 *
 * המעבר אינו אוטומטי בכוונה. איתי ביקש שהמתאמן יבקש והוא יאשר, כדי שלא
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
        className="mb-6 rounded-3xl px-5 py-4 text-sm leading-relaxed"
        style={{
          background: "rgba(180,133,79,.12)",
          border: "1px solid rgba(224,190,147,.28)",
          color: "var(--wood-1)",
        }}
      >
        הבקשה שלך לעבור רמה נשלחה. איתי יסתכל ויעדכן אותך.
      </div>
    );
  }

  async function send() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/client/level-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, note: note.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחתי לשלוח");
      return;
    }
    setOpen(false);
    setNote("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 w-full rounded-2xl py-3.5 text-sm font-semibold"
        style={{
          background: "rgba(255,255,255,.05)",
          border: "1px solid var(--line)",
          color: "var(--wood-1)",
        }}
      >
        סיימתי את הרמה, בקשת מעבר
      </button>
    );
  }

  return (
    <div className="glass mb-6 rounded-3xl p-5">
      <p className="mb-1 font-bold">בקשת מעבר לרמה הבאה</p>
      <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        אתה מבקש לסיים את {programTitle}. איתי יראה את הבקשה ויחליט. עד שהוא
        מאשר, תמשיך להתאמן בתוכנית הנוכחית.
      </p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="משהו שכדאי שידע? לא חובה"
        className="mb-4 w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
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
          style={{ background: "rgba(255,255,255,.05)", color: "var(--dim)" }}
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
