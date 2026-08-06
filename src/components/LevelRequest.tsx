"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LevelCheckVideos, {
  type LevelCheckExerciseView,
} from "./LevelCheckVideos";

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
  assignmentId,
  exercises,
  videosReady,
  coachNote,
}: {
  programId: string;
  programTitle: string;
  pending: boolean;
  assignmentId: string;
  /** ארבעת התרגילים הראשונים בתוכנית, עם הסרטון שצורף לכל אחד. */
  exercises: LevelCheckExerciseView[];
  /** ארבעה סרטונים ואף אחד לא מחכה לצילום מחדש. */
  videosReady: boolean;
  /** מה איתי כתב כשהחזיר לביצוע חוזר. ריק כשאין החזרה פתוחה. */
  coachNote: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pendingRedo = exercises.filter((e) => e.needsRedo).length;

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

  /*
   * הסרטונים תמיד מוצגים כאן, גם לפני שנפתח טופס הבקשה. הם התנאי לשליחה,
   * ומתאמן שרואה כפתור נעול בלי לדעת למה פשוט לוחץ עליו שוב.
   */
  const videos = (
    <>
      {coachNote && (
        <div
          className="mb-3 rounded-2xl px-3.5 py-3"
          style={{
            background: "rgba(229,72,77,.10)",
            border: "1px solid rgba(229,72,77,.28)",
          }}
        >
          <p className="text-sm font-black" style={{ color: "var(--danger-text)" }}>
            FITAY ביקש שתצלם שוב
          </p>
          <p className="mt-1.5 text-sm leading-relaxed">{coachNote}</p>
        </div>
      )}
      <LevelCheckVideos
        programId={programId}
        assignmentId={assignmentId}
        exercises={exercises}
        editable={!busy}
      />
    </>
  );

  if (!open) {
    return (
      <div
        className="mb-1 rounded-[1.4rem] p-4"
        style={{ background: "var(--soft-1)", border: "1px solid var(--line)" }}
      >
        {videos}
        <button
          onClick={() => setOpen(true)}
          disabled={!videosReady}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-right disabled:opacity-40"
          style={{
            background: "var(--soft-2)",
            border: "1px solid var(--line)",
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold">סיימתי את הרמה</span>
            <span className="mt-0.5 block text-[11px]" style={{ color: "var(--dim)" }}>
              {videosReady
                ? "שליחת בקשת מעבר ל-FITAY"
                : pendingRedo > 0
                  ? `אפשר לשלוח אחרי שתחליף ${pendingRedo} סרטונים`
                  : "אפשר לשלוח אחרי שכל ארבעת הסרטונים יעלו"}
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
      </div>
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
        הבקשה היא לעבור מ־{programTitle} לרמה הבאה. FITAY יצפה בסרטונים
        ויחליט. עד שתקבל אישור, תמשיך להתאמן בתוכנית הנוכחית.
      </p>

      <div className="mb-4">{videos}</div>

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
          disabled={busy || !videosReady}
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
