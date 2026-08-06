"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CheckClip = {
  exerciseId: string;
  name: string;
  url: string;
};

type Check = {
  traineeId: string;
  programId: string;
  traineeName: string;
  programTitle: string;
  waitingLabel: string;
  overdue: boolean;
  clips: CheckClip[];
};

export default function InitialCheckInbox({ checks }: { checks: Check[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [returning, setReturning] = useState<string | null>(null);
  const [note, setNote] = useState("");
  if (!checks.length) return null;

  async function decide(check: Check, path: string, body: object) {
    const key = `${check.traineeId}:${check.programId}`;
    setBusy(key);
    setError("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traineeId: check.traineeId,
        programId: check.programId,
        ...body,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    setReturning(null);
    setNote("");
    router.refresh();
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-black">אישורי פתיחה</h2>
        <span className="rounded-full bg-[#b4854f]/20 px-2.5 py-1 text-xs font-black text-[var(--wood-1)]">
          {checks.length}
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
      </div>
      <div className="space-y-3">
        {checks.map((check) => {
          const key = `${check.traineeId}:${check.programId}`;
          return (
            <article
              key={key}
              className="overflow-hidden rounded-[1.7rem] border border-[#b4854f]/35"
              style={{
                background:
                  "linear-gradient(135deg, rgba(180,133,79,.16), var(--panel))",
              }}
            >
              <div className="p-4">
                <p className="text-lg font-black">{check.traineeName}</p>
                <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                  דיווח שהאימון הראשון עבר בסדר
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold text-[var(--wood-1)]">{check.programTitle}</p>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold"
                    style={{
                      background: check.overdue ? "rgba(229,72,77,.16)" : "var(--soft-2)",
                      border: `1px solid ${check.overdue ? "rgba(229,72,77,.42)" : "var(--line)"}`,
                      color: check.overdue ? "var(--danger-text)" : "var(--dim)",
                    }}
                  >
                    {check.waitingLabel}
                  </span>
                </div>
                <p
                  className="mt-3 rounded-2xl px-3 py-2.5 text-sm font-bold leading-relaxed"
                  style={{
                    background: "rgba(229,72,77,.10)",
                    border: "1px solid rgba(229,72,77,.28)",
                    color: "var(--danger-text)",
                  }}
                >
                  האימונים הבאים של המתאמן נעולים עד לאישור הזה.
                </p>

                {/*
                  preload="metadata" ולא יותר. ארבעה קליפים שנטענים במלואם
                  בפתיחת המסך הם כמה עשרות מגה על החיבור של איתי, לפני
                  שהוא בכלל לחץ על אחד מהם.
                */}
                {/*
                  דיווח שנשלח לפני שהסרטונים נכנסו לתמונה מגיע בלי קליפים.
                  במקרה כזה עדיף לומר את זה מאשר להציג אזור ריק ומשפט על
                  מחיקה של כלום.
                */}
                {check.clips.length === 0 ? (
                  <p className="mt-3 text-sm" style={{ color: "var(--dim)" }}>
                    הדיווח הזה נשלח בלי סרטונים.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 space-y-2.5">
                      {check.clips.map((clip) => (
                        <div key={clip.exerciseId}>
                          <p className="mb-1.5 text-sm font-extrabold">{clip.name}</p>
                          <video
                            src={clip.url}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full rounded-xl bg-black/30"
                          />
                        </div>
                      ))}
                    </div>

                    <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>
                      הסרטונים נמחקים ברגע שתאשר. אחרי זה אי אפשר לצפות בהם שוב.
                    </p>
                  </>
                )}

                {returning === key && (
                  <div className="mt-3">
                    <label
                      className="mb-1.5 block text-sm font-bold"
                      htmlFor={`note-${key}`}
                    >
                      מה לתקן?
                    </label>
                    <textarea
                      id={`note-${key}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="למשל: בסט השני הגב מתעגל. תוריד גובה טבעות ותצלם שוב."
                      className="w-full rounded-2xl px-3 py-2.5 text-sm"
                      style={{
                        background: "var(--soft-2)",
                        border: "1px solid var(--line)",
                      }}
                    />
                  </div>
                )}
              </div>

              {returning === key ? (
                <div className="grid grid-cols-2 gap-2 p-3 pt-0">
                  <button
                    type="button"
                    disabled={busy === key || !note.trim()}
                    onClick={() =>
                      decide(check, "/api/coach/initial-check/return", {
                        note: note.trim(),
                      })
                    }
                    className="min-h-12 rounded-2xl font-extrabold disabled:opacity-50"
                    style={{
                      background: "rgba(229,72,77,.14)",
                      border: "1px solid rgba(229,72,77,.4)",
                      color: "var(--danger-text)",
                    }}
                  >
                    {busy === key ? "שולח…" : "שלח להחזרה"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === key}
                    onClick={() => {
                      setReturning(null);
                      setNote("");
                    }}
                    className="min-h-12 rounded-2xl font-semibold disabled:opacity-50"
                    style={{
                      background: "var(--soft-2)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy === key}
                    onClick={() => decide(check, "/api/coach/initial-check", {})}
                    className="wood min-h-12 w-full font-extrabold text-[#f7ebda] disabled:opacity-60"
                  >
                    {busy === key ? "מאשר…" : "אשר והמשך את התוכנית"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === key}
                    onClick={() => {
                      setReturning(key);
                      setNote("");
                      setError("");
                    }}
                    className="min-h-11 w-full text-sm font-bold disabled:opacity-50"
                    style={{ color: "var(--danger-text)" }}
                  >
                    החזר לביצוע חוזר
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-[var(--danger-text)]">{error}</p>}
    </section>
  );
}
