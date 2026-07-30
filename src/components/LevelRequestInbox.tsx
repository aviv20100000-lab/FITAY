"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PendingRequest = {
  id: string;
  traineeName: string;
  fromTitle: string;
  note: string;
  requestedAt: string;
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
      setError(d.error || "לא הצלחתי לשמור");
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
          {confirmDecline ? "בטוח?" : "עוד לא"}
        </button>
      </div>
    </div>
  );
}
