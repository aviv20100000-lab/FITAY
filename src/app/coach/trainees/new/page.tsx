"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const field: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid var(--line)",
  color: "var(--text)",
};

export default function NewTraineePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [rehabMode, setRehabMode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/coach/trainees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password, rehabMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "משהו השתבש");
        setBusy(false);
        return;
      }
      router.push("/coach");
      router.refresh();
    } catch {
      setError("אין חיבור לרשת");
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-7 pb-10">
        <Link
          href="/coach"
          className="mb-6 inline-block text-sm"
          style={{ color: "var(--dim)" }}
        >
          ← חזרה
        </Link>

        <h1 className="mb-1 text-3xl font-bold tracking-tight">מתאמן חדש</h1>
        <p className="mb-7 text-sm" style={{ color: "var(--dim)" }}>
          הפרטים שתיתן לו כדי להיכנס
        </p>

        <form onSubmit={submit} className="glass rounded-3xl p-6">
          <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
            שם מלא
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-5 w-full rounded-2xl px-4 py-4 text-lg outline-none"
            style={field}
          />

          <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
            טלפון
          </label>
          <input
            type="tel"
            inputMode="numeric"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mb-5 w-full rounded-2xl px-4 py-4 text-lg outline-none"
            style={field}
          />

          <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
            סיסמה ראשונית
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-2xl px-4 py-4 text-lg outline-none"
            style={field}
          />

          <button
            type="button"
            onClick={() => setRehabMode(!rehabMode)}
            className="mb-6 flex w-full items-center justify-between rounded-2xl px-4 py-4 text-right"
            style={{
              background: rehabMode ? "rgba(107,143,181,.14)" : "rgba(255,255,255,.05)",
              border: `1px solid ${rehabMode ? "rgba(107,143,181,.45)" : "var(--line)"}`,
            }}
          >
            <span>
              <span className="block font-semibold">מצב שיקום</span>
              <span className="text-xs" style={{ color: "var(--dim)" }}>
                מוסיף דיווח כאב אחרי אימון
              </span>
            </span>
            <span
              className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
              style={{
                background: rehabMode ? "var(--rehab)" : "rgba(255,255,255,.16)",
              }}
            >
              <span
                className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
                style={{ insetInlineStart: rehabMode ? "1.75rem" : "0.25rem" }}
              />
            </span>
          </button>

          {error && (
            <p
              className="mb-4 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(229,72,77,.12)",
                border: "1px solid rgba(229,72,77,.3)",
                color: "#ffb4b6",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="wood w-full rounded-2xl py-5 text-lg font-extrabold disabled:opacity-60"
            style={{
              color: "#f7ebda",
              boxShadow:
                "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
            }}
          >
            {busy ? "רגע…" : "הוסף מתאמן"}
          </button>
        </form>
      </div>
    </main>
  );
}
