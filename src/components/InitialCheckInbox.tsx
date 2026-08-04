"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Check = {
  traineeId: string;
  programId: string;
  traineeName: string;
  programTitle: string;
  waitingLabel: string;
  overdue: boolean;
};

export default function InitialCheckInbox({ checks }: { checks: Check[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!checks.length) return null;

  async function approve(check: Check) {
    const key = `${check.traineeId}:${check.programId}`;
    setBusy(key);
    setError("");
    const response = await fetch("/api/coach/initial-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traineeId: check.traineeId,
        programId: check.programId,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(data.error || "לא הצלחנו לאשר");
      return;
    }
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
              </div>
              <button
                type="button"
                disabled={busy === key}
                onClick={() => approve(check)}
                className="wood min-h-12 w-full font-extrabold text-[#f7ebda] disabled:opacity-60"
              >
                {busy === key ? "מאשר…" : "אשר והמשך את התוכנית"}
              </button>
            </article>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-[var(--danger-text)]">{error}</p>}
    </section>
  );
}
