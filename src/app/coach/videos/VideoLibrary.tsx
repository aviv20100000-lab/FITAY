"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

export type Video = {
  url: string;
  filename: string;
  size: number;
  /** שמות התרגילים שמשתמשים בסרטון הזה כרגע. */
  usedBy: { id: string; name: string }[];
};

export type ExerciseOption = { id: string; name: string; category: string };

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + "MB";

export default function VideoLibrary({
  videos,
  exercises,
}: {
  videos: Video[];
  exercises: ExerciseOption[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");

    for (const file of Array.from(files)) {
      setUploading(file.name);
      setProgress(0);
      try {
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/coach/videos/upload",
          multipart: file.size > 20 * 1024 * 1024,
          onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
        });

        const res = await fetch("/api/coach/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: blob.url, filename: file.name }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "הרישום נכשל");
        }
      } catch (e) {
        setError(
          `${file.name}: ${e instanceof Error ? e.message : "ההעלאה נכשלה"}`
        );
      }
    }

    setUploading(null);
    setProgress(0);
    if (fileInput.current) fileInput.current.value = "";
    router.refresh();
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      <button
        onClick={() => fileInput.current?.click()}
        disabled={uploading !== null}
        className="wood mb-2 w-full rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
        style={{
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        {uploading ? `מעלה… ${progress}%` : "+ העלאת סרטון"}
      </button>

      {uploading && (
        <>
          <div
            className="mb-2 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,.08)" }}
          >
            <div
              className="wood h-full rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mb-4 truncate text-xs" style={{ color: "var(--dim)" }}>
            {uploading}
          </p>
        </>
      )}

      <p className="mb-6 text-xs leading-relaxed" style={{ color: "var(--faint)" }}>
        אפשר לבחור כמה קבצים יחד. סרטוני אייפון בפורמט MOV לא מתנגנים באנדרואיד —
        עדיף להעלות MP4.
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

      {videos.length === 0 ? (
        <div className="glass rounded-3xl px-6 py-12 text-center">
          <p className="mb-2 text-lg font-semibold">אין סרטונים עדיין</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
            העלה את הקליפים שצילמת, צפה בכל אחד, ושייך אותו לתרגיל.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {videos.map((v) => (
            <VideoCard key={v.url} video={v} exercises={exercises} />
          ))}
        </div>
      )}
    </>
  );
}

function VideoCard({
  video,
  exercises,
}: {
  video: Video;
  exercises: ExerciseOption[];
}) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function link(exerciseId: string, videoFile: string | null) {
    setError("");
    setBusy(true);
    const res = await fetch("/api/coach/exercises", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, videoFile }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחתי לשמור");
      return;
    }
    setChoice("");
    router.refresh();
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/coach/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: video.url }),
    });
    setBusy(false);
    setConfirmDelete(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "המחיקה נכשלה");
      return;
    }
    router.refresh();
  }

  const free = exercises.filter((e) => !video.usedBy.some((u) => u.id === e.id));

  return (
    <div className="glass rounded-3xl p-4">
      {/* preload="metadata" בכוונה — 19 סרטונים שנטענים במלואם יחסלו חבילת גלישה */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={video.url}
        controls
        playsInline
        preload="metadata"
        className="mb-3 aspect-video w-full rounded-2xl bg-black object-contain"
        style={{ border: "1px solid var(--line)" }}
      />

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" dir="ltr">
          {video.filename}
        </p>
        <span className="shrink-0 text-xs" style={{ color: "var(--faint)" }}>
          {mb(video.size)}
        </span>
      </div>

      {video.usedBy.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {video.usedBy.map((u) => (
            <button
              key={u.id}
              onClick={() => link(u.id, null)}
              disabled={busy}
              className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{
                background: "rgba(180,133,79,.2)",
                border: "1px solid rgba(224,190,147,.42)",
                color: "var(--wood-1)",
              }}
              title="הסר שיוך"
            >
              {u.name} ✕
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="min-w-0 flex-1 rounded-2xl px-3 py-3 text-sm outline-none"
          style={{
            background: "rgba(255,255,255,.05)",
            border: "1px solid var(--line)",
            color: "var(--text)",
          }}
        >
          <option value="">שייך לתרגיל…</option>
          {free.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        {choice && (
          <button
            onClick={() => link(choice, video.url)}
            disabled={busy}
            className="wood shrink-0 rounded-2xl px-5 font-extrabold disabled:opacity-60"
            style={{ color: "#f7ebda" }}
          >
            {busy ? "…" : "שייך"}
          </button>
        )}

        <button
          onClick={remove}
          disabled={busy}
          className="shrink-0 rounded-2xl px-4 text-sm font-semibold disabled:opacity-60"
          style={{
            background: confirmDelete ? "rgba(229,72,77,.16)" : "rgba(255,255,255,.05)",
            border: `1px solid ${confirmDelete ? "rgba(229,72,77,.45)" : "var(--line)"}`,
            color: confirmDelete ? "#ffb4b6" : "var(--faint)",
          }}
        >
          {confirmDelete ? "בטוח?" : "מחק"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}
    </div>
  );
}
