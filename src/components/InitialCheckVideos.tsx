"use client";

/**
 * העלאת סרטון לכל אחד מארבעת התרגילים הראשונים.
 *
 * העלאה אחת בכל פעם, מיד אחרי הצילום, ולא ארבע בסוף. מתאמן ברשת סלולרית
 * שמעלה ארבעה קליפים ברצף מסתכל על מסך שנראה תקוע, ויוצא ממנו באמצע.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type InitialCheckExerciseView = {
  exerciseId: string;
  name: string;
  videoUrl: string | null;
  needsRedo: boolean;
};

export default function InitialCheckVideos({
  programId,
  assignmentId,
  exercises,
  editable,
}: {
  programId: string;
  assignmentId: string;
  exercises: InitialCheckExerciseView[];
  editable: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const missing = exercises.filter((e) => !e.videoUrl).length;
  const redo = exercises.filter((e) => e.needsRedo).length;

  function pick(exerciseId: string) {
    setError("");
    setTarget(exerciseId);
    inputRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    const exerciseId = target;
    if (!file || !exerciseId) return;

    setBusy(exerciseId);
    setProgress(0);
    setError("");
    try {
      // חבילת ההעלאה כוללת קוד חתימה ורב-חלקי. נטענת רק אחרי בחירת קובץ,
      // ולא בכל טעינה של מסך הבית.
      const { upload } = await import("@vercel/blob/client");
      // הנתיב הוא מה שהשרת דורש ברישום, וזה מה שמונע רישום של כתובת
      // שמצביעה על קובץ אחר באחסון.
      const extension = file.name.includes(".")
        ? file.name.slice(file.name.lastIndexOf("."))
        : ".mp4";
      const blob = await upload(
        `initial-check/${assignmentId}/${exerciseId}${extension}`,
        file,
        {
          access: "public",
          handleUploadUrl: `/api/client/initial-check/videos/upload?programId=${encodeURIComponent(programId)}`,
          multipart: file.size > 20 * 1024 * 1024,
          onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
        }
      );

      const response = await fetch("/api/client/initial-check/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          exerciseId,
          url: blob.url,
          size: file.size,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "הרישום נכשל");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההעלאה נכשלה");
    }

    setBusy(null);
    setProgress(0);
    setTarget(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(exerciseId: string) {
    setBusy(exerciseId);
    setError("");
    const response = await fetch("/api/client/initial-check/videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, exerciseId }),
    });
    setBusy(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "לא הצלחנו להסיר");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {/*
        בלי capture בכוונה. הטלפון מונח על הרצפה ומצלם את הסט, והמתאמן
        חוזר אליו אחרי שהוא מסיים. capture היה פותח את המצלמה ישר וחוסם
        בחירה מהגלריה באייפון, כלומר חוסם בדיוק את הזרימה הזאת.
      */}
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <p className="text-sm font-bold">
        {redo > 0
          ? `${redo} תרגילים מחכים לצילום מחדש`
          : missing === 0
            ? "כל הסרטונים מוכנים"
            : `נשארו ${missing} סרטונים לצלם`}
      </p>
      <p className="mt-1 text-xs leading-5" style={{ color: "var(--dim)" }}>
        סט אחד לכל תרגיל. מספיק שרואים אותך מהצד ואת כל הגוף בפריים.
      </p>

      <div className="mt-3 space-y-2">
        {exercises.map((exercise) => {
          const working = busy === exercise.exerciseId;
          return (
            <div
              key={exercise.exerciseId}
              className="rounded-2xl px-3.5 py-3"
              style={{
                background: "var(--soft-2)",
                border: `1px solid ${
                  exercise.needsRedo
                    ? "rgba(229,72,77,.42)"
                    : exercise.videoUrl
                      ? "rgba(180,133,79,.4)"
                      : "var(--line)"
                }`,
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black"
                  style={{
                    background: exercise.needsRedo
                      ? "rgba(229,72,77,.16)"
                      : exercise.videoUrl
                        ? "rgba(180,133,79,.22)"
                        : "var(--soft-4)",
                    color: exercise.needsRedo
                      ? "var(--danger-text)"
                      : exercise.videoUrl
                        ? "var(--wood-1)"
                        : "var(--faint)",
                  }}
                >
                  {exercise.needsRedo ? "!" : exercise.videoUrl ? "✓" : "▲"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">
                    {exercise.name}
                  </p>
                  {exercise.needsRedo && (
                    <p
                      className="text-xs font-bold"
                      style={{ color: "var(--danger-text)" }}
                    >
                      FITAY ביקש לצלם את זה שוב
                    </p>
                  )}
                </div>
                {editable && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => pick(exercise.exerciseId)}
                    className="shrink-0 rounded-xl px-3 py-2 text-xs font-extrabold disabled:opacity-50"
                    style={{
                      background:
                        exercise.videoUrl && !exercise.needsRedo
                          ? "var(--soft-4)"
                          : "var(--wood-2)",
                      color:
                        exercise.videoUrl && !exercise.needsRedo
                          ? "var(--wood-1)"
                          : "var(--accent-contrast)",
                    }}
                  >
                    {working && progress > 0
                      ? `${progress}%`
                      : working
                        ? "מעלה…"
                        : exercise.videoUrl
                          ? "החלף"
                          : "צלם"}
                  </button>
                )}
              </div>

              {working && (
                <div
                  className="mt-2.5 h-1.5 overflow-hidden rounded-full"
                  style={{ background: "var(--soft-4)" }}
                >
                  <div
                    className="wood h-full rounded-full transition-all"
                    style={{ width: `${Math.max(3, progress)}%` }}
                  />
                </div>
              )}

              {exercise.videoUrl && !working && (
                <div className="mt-2.5">
                  <video
                    src={exercise.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full rounded-xl"
                  />
                  {editable && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => remove(exercise.exerciseId)}
                      className="mt-2 text-xs font-bold disabled:opacity-50"
                      style={{ color: "var(--danger-text)" }}
                    >
                      הסר את הסרטון
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-2 text-sm text-[var(--danger-text)]">{error}</p>
      )}
    </div>
  );
}
