"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * עריכת ההודעות שאיתי בוחר מהן כשהוא לא מאשר הקשיה.
 *
 * יושב כאן, ליד התור שבו הוא משתמש בהן, ולא במסך ניהול נפרד. זה אותו
 * עיקרון שלפיו המדריך נערך מתוך המסך שבו הוא מוצג: הטקסט נראה במקום
 * שבו הוא באמת עובד, בלי לדמיין את התוצאה מול טופס.
 *
 * מקופל כברירת מחדל. ברוב הימים אין מה לשנות כאן, ומסך המאמן צפוף.
 */
export default function DeclineReasonsEditor({
  reasons,
}: {
  reasons: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(reasons);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(reasons);

  function update(index: number, value: string) {
    setSaved(false);
    setDraft((current) =>
      current.map((item, i) => (i === index ? value : item))
    );
  }

  function remove(index: number) {
    setSaved(false);
    setDraft((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/coach/decline-reasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasons: draft }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-right"
        style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--line)" }}
      >
        <span className="text-sm font-bold">ההודעות שלי לדחיית הקשיה</span>
        <span className="text-xs font-semibold" style={{ color: "var(--wood-1)" }}>
          {reasons.length} הודעות · לעריכה ←
        </span>
      </button>
    );
  }

  return (
    <div
      className="mb-6 rounded-3xl p-5"
      style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--line)" }}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-bold">ההודעות שלי לדחיית הקשיה</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setDraft(reasons);
            setError("");
          }}
          className="rounded-xl px-3 py-1.5 text-sm font-bold"
          style={{ background: "var(--soft-2)", color: "var(--dim)" }}
        >
          סגור
        </button>
      </div>
      <p className="mb-4 text-xs leading-5" style={{ color: "var(--dim)" }}>
        אלה ההודעות שתוכל לבחור מהן כשלא תאשר הקשיה. המתאמן רואה את הטקסט
        כמו שהוא, ולכן כדאי שכל אחת תגיד מה לעשות עכשיו. תמיד אפשר גם
        לכתוב משהו אחר באותו רגע.
      </p>

      <div className="space-y-3">
        {draft.map((reason, index) => (
          <div key={index}>
            <textarea
              value={reason}
              onChange={(e) => update(index, e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-2xl px-4 py-3 text-sm leading-relaxed outline-none"
              style={{
                background: "rgba(255,255,255,.06)",
                border: "1px solid var(--line)",
                color: "var(--text)",
              }}
            />
            {draft.length > 1 && (
              <button
                type="button"
                onClick={() => remove(index)}
                className="mt-1 text-xs font-bold"
                style={{ color: "#ffb4b6" }}
              >
                מחק את ההודעה הזאת
              </button>
            )}
          </div>
        ))}
      </div>

      {draft.length < 8 && (
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setDraft((current) => [...current, ""]);
          }}
          className="mt-3 w-full rounded-2xl py-3 text-sm font-bold"
          style={{ background: "var(--soft-2)", color: "var(--wood-1)" }}
        >
          + הודעה חדשה
        </button>
      )}

      {error && (
        <p className="mt-3 text-sm" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p className="mt-3 text-sm" style={{ color: "var(--wood-1)" }}>
          נשמר.
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy || !dirty || draft.every((r) => !r.trim())}
        className="wood mt-3 w-full rounded-2xl py-3.5 font-extrabold disabled:opacity-40"
        style={{ color: "#f7ebda" }}
      >
        {busy ? "שומר…" : dirty ? "שמור" : "אין שינויים לשמור"}
      </button>
    </div>
  );
}
