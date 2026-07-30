"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type VideoOption = { url: string; filename: string; size: number };

/**
 * בחירת סרטון לתרגיל. הרשימה היא מה שהועלה ל-Blob, והתצוגה המקדימה
 * נטענת רק אחרי בחירה — 19 סרטונים שנטענים יחד יחסלו את הגלישה.
 */
export default function VideoPicker({
  exerciseId,
  exerciseName,
  current,
  videos,
  bandAllowed,
}: {
  exerciseId: string;
  exerciseName: string;
  current: string | null;
  videos: VideoOption[];
  bandAllowed: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [band, setBand] = useState(bandAllowed);
  const [bandBusy, setBandBusy] = useState(false);

  /**
   * סימון גומייה. נשמר מיד בלחיצה ולא מחכה לכפתור שמירה, כי זו הגדרה
   * בודדת ולא טופס. אם השמירה נכשלה, המתג חוזר אחורה כדי שלא יציג
   * מצב שלא קיים במסד.
   */
  async function toggleBand() {
    const next = !band;
    setBand(next);
    setBandBusy(true);
    const res = await fetch("/api/coach/exercises", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, bandAllowed: next }),
    });
    setBandBusy(false);
    if (!res.ok) {
      setBand(!next);
      setError("לא הצלחנו לשמור את סימון הגומייה");
      return;
    }
    router.refresh();
  }

  const dirty = value !== (current ?? "");

  async function save() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/coach/exercises", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, videoFile: value || null }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחנו לשמור");
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="px-3.5 py-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <p className="font-bold">{exerciseName}</p>
        {current ? (
          <button
            onClick={() => setPreview((p) => !p)}
            className="shrink-0 text-xs"
            style={{ color: "var(--wood-2)" }}
          >
            {preview ? "הסתר" : "תצוגה מקדימה"}
          </button>
        ) : (
          <span className="shrink-0 text-xs" style={{ color: "var(--faint)" }}>
            אין סרטון
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-2xl px-3 py-3 text-sm outline-none"
          style={{
            background: "rgba(255,255,255,.05)",
            border: "1px solid var(--line)",
            color: "var(--text)",
          }}
        >
          <option value="">בלי סרטון</option>
          {videos.map((v) => (
            <option key={v.url} value={v.url}>
              {v.filename}
            </option>
          ))}
        </select>

        {dirty && (
          <button
            onClick={save}
            disabled={busy}
            className="wood shrink-0 rounded-2xl px-5 font-extrabold disabled:opacity-60"
            style={{ color: "#f7ebda" }}
          >
            {busy ? "…" : "שמור"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}

      {/*
        סימון גומייה. חל על התרגיל בכל התוכניות, ולכן הוא כאן בספרייה
        ולא בתוך תוכנית מסוימת. כשהוא דלוק, המתאמן מקבל באימון מתג
        "עם גומייה", והסימון נשמר עם כל סט.
      */}
      <button
        type="button"
        onClick={toggleBand}
        disabled={bandBusy}
        className="mt-3 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-right disabled:opacity-60"
        style={{
          background: band ? "rgba(180,133,79,.16)" : "rgba(255,255,255,.04)",
          border: `1px solid ${band ? "rgba(224,190,147,.45)" : "var(--line)"}`,
        }}
      >
        <span>
          <span className="block text-sm font-semibold">מותר להשתמש בגומייה</span>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            המתאמן יוכל לדווח אם נעזר בה
          </span>
        </span>
        <span
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
          style={{ background: band ? "var(--wood-2)" : "rgba(255,255,255,.14)" }}
        >
          <span
            className="absolute top-1 h-4 w-4 rounded-full transition-all"
            style={{
              background: "#f7ebda",
              insetInlineStart: band ? "calc(100% - 1.25rem)" : "0.25rem",
            }}
          />
        </span>
      </button>

      {preview && current && (
        // המסגרת לא כופה 16:9 על קליפ אנכי. עם object-cover נשאר רק הפס
        // האמצעי של הפריים, ואי אפשר לוודא שהסרטון הנכון שויך לתרגיל.
        <div
          className="mt-3 flex min-h-40 w-full items-center justify-center overflow-hidden rounded-2xl bg-black"
          style={{ border: "1px solid var(--line)" }}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={current}
            controls
            playsInline
            preload="metadata"
            className="max-h-[52vh] w-auto max-w-full"
          />
        </div>
      )}
    </div>
  );
}
