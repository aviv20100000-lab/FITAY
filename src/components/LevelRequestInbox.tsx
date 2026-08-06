"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type RequestClip = {
  exerciseId: string;
  name: string;
  url: string;
};

export type PendingRequest = {
  id: string;
  traineeName: string;
  fromTitle: string;
  note: string;
  requestedAt: string;
  clips: RequestClip[];
};

export type ProgramOption = { id: string; title: string; level: number };

/**
 * בקשות מעבר רמה שממתינות להכרעה.
 *
 * יושב בראש מסך המאמן ולא במסך נפרד, כי בקשה שממתינה היא הדבר היחיד
 * באפליקציה שחוסם מתאמן מלהתקדם. אם היא מוסתרת מאחורי לחיצה, היא תחכה.
 */
export default function LevelRequestInbox({
  requests,
  programs,
}: {
  requests: PendingRequest[];
  programs: ProgramOption[];
}) {
  if (requests.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-lg font-bold">
        בקשות מעבר רמה
        <span className="mr-2 text-sm font-semibold" style={{ color: "var(--wood-1)" }}>
          {requests.length}
        </span>
      </h2>
      {requests.map((r) => (
        <RequestCard key={r.id} request={r} programs={programs} />
      ))}
    </div>
  );
}

function RequestCard({
  request,
  programs,
}: {
  request: PendingRequest;
  programs: ProgramOption[];
}) {
  const router = useRouter();
  const [nextProgramId, setNextProgramId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [returning, setReturning] = useState(false);
  const [coachNote, setCoachNote] = useState("");
  // אילו תרגילים סומנו לצילום מחדש. המתאמן חייב להחליף בדיוק אותם.
  const [redo, setRedo] = useState<string[]>([]);

  function toggleRedo(exerciseId: string) {
    setRedo((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId]
    );
  }

  async function sendReturn() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/coach/level-request/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: request.id,
        note: coachNote.trim(),
        exerciseIds: redo,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחנו לשמור");
      return;
    }
    setReturning(false);
    setCoachNote("");
    setRedo([]);
    router.refresh();
  }

  async function decide(approve: boolean) {
    if (approve && !nextProgramId) {
      setError("בחר לאיזו תוכנית להעביר");
      return;
    }
    if (!approve && !confirmDecline) {
      setConfirmDecline(true);
      return;
    }

    setError("");
    setBusy(true);
    const res = await fetch("/api/coach/level-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: request.id, approve, nextProgramId }),
    });
    setBusy(false);
    setConfirmDecline(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחנו לשמור");
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="rounded-3xl p-5"
      style={{
        background: "rgba(180,133,79,.12)",
        border: "1px solid rgba(224,190,147,.32)",
      }}
    >
      <p className="font-bold">{request.traineeName}</p>
      <p className="mb-3 text-sm" style={{ color: "var(--dim)" }}>
        סיים את {request.fromTitle}
      </p>

      {request.note && (
        <p
          className="mb-3 rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={{ background: "rgba(255,255,255,.05)", color: "var(--text)" }}
        >
          {request.note}
        </p>
      )}

      {/*
        preload="metadata" ולא יותר. ארבעה קליפים שנטענים במלואם בפתיחת
        המסך הם כמה עשרות מגה על החיבור של איתי, לפני שהוא בכלל לחץ.
      */}
      {request.clips.length === 0 ? (
        <p className="mb-3 text-sm" style={{ color: "var(--dim)" }}>
          הבקשה הזאת נשלחה בלי סרטונים.
        </p>
      ) : (
        <>
          <div className="mb-3 space-y-2.5">
            {request.clips.map((clip) => (
              <div key={clip.exerciseId}>
                <p className="mb-1.5 text-sm font-extrabold">{clip.name}</p>
                <video
                  src={clip.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-xl bg-black/30"
                />
                {returning && (
                  <label className="mt-1.5 flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={redo.includes(clip.exerciseId)}
                      onChange={() => toggleRedo(clip.exerciseId)}
                      className="h-4 w-4 accent-[#b4854f]"
                    />
                    לצלם שוב את התרגיל הזה
                  </label>
                )}
              </div>
            ))}
          </div>
          <p className="mb-3 text-xs" style={{ color: "var(--faint)" }}>
            הסרטונים נמחקים ברגע שתכריע. אחרי זה אי אפשר לצפות בהם שוב.
          </p>
        </>
      )}

      {returning && (
        <div className="mb-3">
          <textarea
            value={coachNote}
            onChange={(e) => setCoachNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="למשל: בסט השני הגב מתעגל. תוריד גובה טבעות ותצלם שוב."
            className="w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid var(--line)",
              color: "var(--text)",
            }}
          />
          <p className="mt-1.5 text-xs" style={{ color: "var(--dim)" }}>
            {redo.length === 0
              ? "סמן מעל כל סרטון שצריך לצלם מחדש. בלי סימון אי אפשר להחזיר."
              : `${redo.length} תרגילים לצילום מחדש. המתאמן לא יוכל לשלוח עד שיחליף אותם.`}
          </p>
        </div>
      )}

      <select
        value={nextProgramId}
        onChange={(e) => setNextProgramId(e.target.value)}
        className="mb-3 w-full rounded-2xl px-4 py-3 text-sm outline-none"
        style={{
          background: "rgba(255,255,255,.06)",
          border: "1px solid var(--line)",
          color: "var(--text)",
        }}
      >
        <option value="">העבר לתוכנית…</option>
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}

      {returning ? (
        <div className="flex gap-2">
          <button
            onClick={sendReturn}
            disabled={busy || !coachNote.trim() || redo.length === 0}
            className="flex-1 rounded-2xl py-3.5 font-extrabold disabled:opacity-50"
            style={{
              background: "rgba(229,72,77,.16)",
              border: "1px solid rgba(229,72,77,.45)",
              color: "#ffb4b6",
            }}
          >
            {busy ? "שולח…" : "שלח להחזרה"}
          </button>
          <button
            onClick={() => {
              setReturning(false);
              setCoachNote("");
              setRedo([]);
            }}
            disabled={busy}
            className="rounded-2xl px-4 text-sm font-semibold disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,.05)",
              border: "1px solid var(--line)",
              color: "var(--dim)",
            }}
          >
            ביטול
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => decide(true)}
              disabled={busy}
              className="wood flex-1 rounded-2xl py-3.5 font-extrabold disabled:opacity-60"
              style={{ color: "#f7ebda" }}
            >
              {busy ? "…" : "אשר מעבר"}
            </button>
            <button
              onClick={() => decide(false)}
              disabled={busy}
              className="rounded-2xl px-4 text-sm font-semibold disabled:opacity-60"
              style={{
                background: confirmDecline ? "rgba(229,72,77,.16)" : "rgba(255,255,255,.05)",
                border: `1px solid ${confirmDecline ? "rgba(229,72,77,.45)" : "var(--line)"}`,
                color: confirmDecline ? "#ffb4b6" : "var(--dim)",
              }}
            >
              {confirmDecline ? "בטוח?" : "דחה בקשה"}
            </button>
          </div>
          {/*
            החזרה היא לא דחייה. דחייה סוגרת ואומרת שממשיכים בתוכנית
            הנוכחית, וכאן הבקשה חוזרת למתאמן כדי שיצלם שוב.
          */}
          {request.clips.length > 0 && (
            <button
              onClick={() => {
                setReturning(true);
                setCoachNote("");
                setRedo([]);
                setError("");
              }}
              disabled={busy}
              className="mt-2 w-full py-2 text-sm font-bold disabled:opacity-50"
              style={{ color: "#ffb4b6" }}
            >
              החזר לצילום מחדש
            </button>
          )}
        </>
      )}
    </div>
  );
}
