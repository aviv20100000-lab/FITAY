"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProgramSetup({
  programId,
  sessionsPerWeek,
  exercisesDone,
  initialStatus,
}: {
  programId: string;
  sessionsPerWeek: number | null;
  exercisesDone: number;
  initialStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(url: string, body: object) {
    setBusy(true);
    setError("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-4 space-y-3">
      {!sessionsPerWeek && (
        <div className="rounded-[1.5rem] border border-[#b4854f]/35 bg-[#b4854f]/10 p-4">
          <p className="font-black">כמה פעמים נוח לך להתאמן?</p>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--dim)" }}>
            בשני המסלולים משלימים 24 אימונים. רק הקצב משתנה.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[3, 4].map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={busy}
                onClick={() =>
                  post("/api/client/program-settings", {
                    programId,
                    sessionsPerWeek: amount,
                  })
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 font-extrabold disabled:opacity-50"
              >
                {amount} בשבוע
                <span className="mt-0.5 block text-[10px] font-semibold" style={{ color: "var(--dim)" }}>
                  בערך {amount === 3 ? 8 : 6} שבועות
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {initialStatus === "not_ready" && exercisesDone >= 4 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => post("/api/client/initial-check", { programId })}
          className="wood w-full rounded-[1.4rem] px-4 py-4 text-right font-extrabold text-[#f7ebda] disabled:opacity-50"
        >
          האימון הראשון עבר בסדר
          <span className="mt-1 block text-xs font-semibold opacity-75">
            שלח דיווח אחד לאישור FITAY
          </span>
        </button>
      )}

      {initialStatus === "pending" && (
        <div className="rounded-[1.4rem] border border-[#b4854f]/30 bg-[#b4854f]/10 px-4 py-3.5">
          <p className="font-extrabold text-[var(--wood-1)]">ממתינים לאישור FITAY</p>
          <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
            הדיווח התקבל. תקבל עדכון כשאפשר להמשיך.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
    </div>
  );
}
