"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type P = { id: string; title: string; level: number; isTemplate: boolean };

export default function AssignPrograms({
  traineeId,
  assignedIds,
  programs,
}: {
  traineeId: string;
  assignedIds: string[];
  programs: P[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(programId: string, isAssigned: boolean) {
    setBusy(programId);
    if (isAssigned) {
      await fetch(
        `/api/coach/assignments?traineeId=${traineeId}&programId=${programId}`,
        { method: "DELETE" }
      );
    } else {
      await fetch("/api/coach/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traineeId, programId }),
      });
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <>
      <h2 className="mb-1 text-lg font-bold">התוכניות שלו</h2>
      <p className="mb-3 text-sm" style={{ color: "var(--dim)" }}>
        רק מה שמסומן מופיע אצלו באפליקציה
      </p>

      {programs.length === 0 ? (
        <p
          className="glass rounded-3xl px-6 py-8 text-center text-sm"
          style={{ color: "var(--dim)" }}
        >
          עוד לא בנית תוכניות
        </p>
      ) : (
        <div className="glass rounded-3xl p-2">
          {programs.map((p, i) => {
            const on = assignedIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id, on)}
                disabled={busy === p.id}
                className="flex w-full items-center gap-3 px-3 py-3.5 text-right disabled:opacity-50"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold"
                  style={{
                    background: on ? "var(--wood-2)" : "rgba(255,255,255,.06)",
                    border: `1px solid ${on ? "var(--wood-1)" : "var(--line)"}`,
                    color: on ? "#2a1c0b" : "transparent",
                  }}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="text-xs" style={{ color: "var(--dim)" }}>
                    רמה {p.level}
                    {p.isTemplate && " · תבנית"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
