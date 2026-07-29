"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProgramForm({
  templates,
}: {
  templates: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState(1);
  const [isTemplate, setIsTemplate] = useState(true);
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/coach/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          level,
          isTemplate: copyFrom ? false : isTemplate,
          copyFrom: copyFrom || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "משהו השתבש");
        setBusy(false);
        return;
      }
      router.push(`/coach/programs/${data.id}`);
    } catch {
      setError("אין חיבור לרשת");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="wood w-full rounded-2xl py-4 text-lg font-extrabold"
        style={{
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        + תוכנית חדשה
      </button>
    );
  }

  const field: React.CSSProperties = {
    background: "rgba(255,255,255,.05)",
    border: "1px solid var(--line)",
    color: "var(--text)",
  };

  return (
    <div className="glass rounded-3xl p-6">
      <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
        שם התוכנית
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-5 w-full rounded-2xl px-4 py-3.5 text-lg outline-none"
        style={field}
      />

      <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
        רמה
      </label>
      <div className="mb-5 grid grid-cols-3 gap-2">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => setLevel(n)}
            className="rounded-2xl py-3 font-bold"
            style={{
              background: level === n ? "rgba(180,133,79,.22)" : "rgba(255,255,255,.05)",
              border: `1px solid ${level === n ? "rgba(224,190,147,.45)" : "var(--line)"}`,
              color: level === n ? "var(--wood-1)" : "var(--dim)",
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {templates.length > 0 && (
        <>
          <label className="mb-2 block text-sm" style={{ color: "var(--dim)" }}>
            לשכפל מתבנית (לא חובה)
          </label>
          <select
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
            className="mb-5 w-full rounded-2xl px-4 py-3.5 outline-none"
            style={field}
          >
            <option value="">— בונה מאפס —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </>
      )}

      {!copyFrom && (
        <button
          onClick={() => setIsTemplate(!isTemplate)}
          className="mb-5 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-right"
          style={{
            background: isTemplate ? "rgba(180,133,79,.16)" : "rgba(255,255,255,.05)",
            border: `1px solid ${isTemplate ? "rgba(224,190,147,.4)" : "var(--line)"}`,
          }}
        >
          <span className="text-sm">
            <span className="block font-semibold">תבנית</span>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              בסיס לשכפול, לא משויכת למתאמן
            </span>
          </span>
          <span
            className="relative h-7 w-12 shrink-0 rounded-full"
            style={{ background: isTemplate ? "var(--wood-2)" : "rgba(255,255,255,.16)" }}
          >
            <span
              className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
              style={{ insetInlineStart: isTemplate ? "1.75rem" : "0.25rem" }}
            />
          </span>
        </button>
      )}

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

      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="rounded-2xl px-5 py-4 font-semibold"
          style={{ background: "rgba(255,255,255,.06)", color: "var(--dim)" }}
        >
          ביטול
        </button>
        <button
          onClick={create}
          disabled={busy}
          className="wood flex-1 rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
          style={{
            color: "#f7ebda",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.28)",
          }}
        >
          {busy ? "רגע…" : "צור"}
        </button>
      </div>
    </div>
  );
}
