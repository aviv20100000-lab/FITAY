"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type HardeningSet = {
  setNumber: number;
  value: number;
  untouched: boolean;
};

export type PendingHardening = {
  id: string;
  traineeName: string;
  exerciseName: string;
  kind: "harder" | "drop-band";
  createdAt: string;
  /** יחידת המדידה של התרגיל, חזרות או שניות. */
  unit: string;
  sets: HardeningSet[];
};

/**
 * הקשיות שממתינות להכרעה.
 *
 * יושב מתחת לבקשות מעבר הרמה, כי בקשת מעבר חוסמת מתאמן מלהתקדם והקשיה
 * שממתינה רק מחזיקה אותו בדרגה הנוכחית עוד קצת.
 *
 * לכאן מגיעים רק מקרים שבהם כל הסטים אושרו בלי נגיעה במספר שהאפליקציה
 * הציעה. מי שרשם באמת הוקשה אוטומטית ולא מופיע כאן.
 */
export default function HardeningInbox({
  requests,
  reasons,
}: {
  requests: PendingHardening[];
  /** הסיבות המוכנות לדחייה, כפי שהן שמורות במסד. */
  reasons: string[];
}) {
  if (requests.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-lg font-bold">
        הקשיות שממתינות
        <span
          className="mr-2 text-sm font-semibold"
          style={{ color: "var(--wood-1)" }}
        >
          {requests.length}
        </span>
      </h2>
      <p className="text-xs leading-5" style={{ color: "var(--dim)" }}>
        בכל אחת מאלה המתאמן הגיע ליעד בכל הסטים בלי לשנות אף מספר. אין כאן
        ראיה שהרישום אמיתי, ולכן הדרגה מחכה להחלטה שלך.
      </p>
      {requests.map((request) => (
        <HardeningCard key={request.id} request={request} reasons={reasons} />
      ))}
    </div>
  );
}

function HardeningCard({
  request,
  reasons,
}: {
  request: PendingHardening;
  reasons: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  async function decide(approve: boolean) {
    setError("");
    setBusy(true);
    const res = await fetch("/api/coach/progression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: request.id, approve, note: note.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    setDeclining(false);
    setNote("");
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
        {request.exerciseName} ·{" "}
        {request.kind === "drop-band"
          ? "הגיע ליעד עם גומייה"
          : "הגיע ליעד בכל הסטים"}
        {" · "}
        {new Date(request.createdAt).toLocaleDateString("he-IL")}
      </p>

      {/*
        הסטים כפי שנרשמו, עם סימון מה אושר בלי נגיעה. זו כל הראיה שיש,
        והיא מה שמאפשר לאיתי להחליט במקום לנחש.
      */}
      <div
        className="mb-3 rounded-2xl px-4 py-3"
        style={{ background: "rgba(255,255,255,.05)" }}
      >
        {request.sets.map((set) => (
          <div
            key={set.setNumber}
            className="flex items-center justify-between py-1 text-sm"
          >
            <span style={{ color: "var(--dim)" }}>סט {set.setNumber}</span>
            <span className="font-bold tabular-nums">
              {set.value} {request.unit}
              <span
                className="mr-2 text-xs font-semibold"
                style={{ color: set.untouched ? "#ffb4b6" : "var(--dim)" }}
              >
                {set.untouched ? "אושר בלי נגיעה" : "נרשם ידנית"}
              </span>
            </span>
          </div>
        ))}
      </div>

      {declining && (
        <div className="mb-3 space-y-2">
          {reasons.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => setNote(reason)}
              className="w-full rounded-2xl px-4 py-3 text-right text-sm leading-relaxed"
              style={{
                background:
                  note === reason ? "rgba(180,133,79,.2)" : "rgba(255,255,255,.05)",
                border: `1px solid ${
                  note === reason ? "rgba(224,190,147,.5)" : "var(--line)"
                }`,
                color: "var(--text)",
              }}
            >
              {reason}
            </button>
          ))}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="או כתוב משלך"
            className="w-full resize-none rounded-2xl px-4 py-3 text-sm leading-relaxed outline-none"
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid var(--line)",
              color: "var(--text)",
            }}
          />
          <p className="text-xs" style={{ color: "var(--dim)" }}>
            הטקסט הזה מוצג למתאמן כמו שהוא. בחר אחד מהמוכנים או שנה אותו.
          </p>
        </div>
      )}

      {error && (
        <p className="mb-3 text-sm" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}

      {declining ? (
        <div className="flex gap-2">
          <button
            onClick={() => decide(false)}
            disabled={busy || !note.trim()}
            className="flex-1 rounded-2xl py-3.5 font-extrabold disabled:opacity-50"
            style={{
              background: "rgba(229,72,77,.16)",
              border: "1px solid rgba(229,72,77,.45)",
              color: "#ffb4b6",
            }}
          >
            {busy ? "שולח…" : "שלח למתאמן"}
          </button>
          <button
            onClick={() => {
              setDeclining(false);
              setNote("");
              setError("");
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
        <div className="flex gap-2">
          <button
            onClick={() => decide(true)}
            disabled={busy}
            className="wood flex-1 rounded-2xl py-3.5 font-extrabold disabled:opacity-60"
            style={{ color: "#f7ebda" }}
          >
            {busy ? "…" : "אשר הקשיה"}
          </button>
          <button
            onClick={() => {
              setDeclining(true);
              setError("");
            }}
            disabled={busy}
            className="rounded-2xl px-4 text-sm font-semibold disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,.05)",
              border: "1px solid var(--line)",
              color: "var(--dim)",
            }}
          >
            לא עכשיו
          </button>
        </div>
      )}
    </div>
  );
}
