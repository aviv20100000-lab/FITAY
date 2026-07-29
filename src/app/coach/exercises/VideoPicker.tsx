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
}: {
  exerciseId: string;
  exerciseName: string;
  current: string | null;
  videos: VideoOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      setError(d.error || "לא הצלחתי לשמור");
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

      {preview && current && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={current}
          controls
          playsInline
          preload="metadata"
          className="mt-3 aspect-video w-full rounded-2xl object-cover"
          style={{ border: "1px solid var(--line)" }}
        />
      )}
    </div>
  );
}
