"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { programLevelName } from "@/lib/program-levels";

type P = { id: string; title: string; description: string; level: number; isTemplate: boolean };

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
    // בלי התפיסה הזאת כשל רשת השאיר את השורה מושבתת לצמיתות, בלי הודעה
    // ובלי שהשיוך באמת נשמר.
    try {
      const res = isAssigned
        ? await fetch(
            `/api/coach/assignments?traineeId=${traineeId}&programId=${programId}`,
            { method: "DELETE" }
          )
        : await fetch("/api/coach/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ traineeId, programId }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "לא הצלחנו לעדכן את השיוך");
      }
    } catch {
      alert("אין חיבור לרשת. נסה שוב.");
    } finally {
      setBusy(null);
    }
    router.refresh();
  }

  return (
    <section className="mt-8 rounded-3xl p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--border-1)" }}>
      <h2 className="mb-1 text-lg font-bold">שיוך תוכניות</h2>
      <p className="mb-3 text-sm" style={{ color: "var(--dim)" }}>
        זו רשימת התוכניות הזמינות. רק מה שמסומן מופיע אצל המתאמן.
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
                type="button"
                onClick={() => toggle(p.id, on)}
                disabled={busy === p.id}
                aria-pressed={on}
                className="flex w-full items-center gap-3 px-3 py-3.5 text-right disabled:opacity-50"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
              >
                <span
                  aria-hidden="true"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold"
                  style={{
                    background: on ? "var(--wood-2)" : "var(--surface-2)",
                    border: `1px solid ${on ? "var(--wood-1)" : "var(--border-1)"}`,
                    color: on ? "var(--accent-contrast)" : "transparent",
                  }}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="text-xs" style={{ color: "var(--dim)" }}>
                    {programLevelName(p.level)}
                    {p.isTemplate && " · תבנית"}
                  </span>
                  {p.description && (
                    <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: "var(--faint)" }}>
                      {p.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
