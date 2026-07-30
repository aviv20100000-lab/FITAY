"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { programLevelName } from "@/lib/program-levels";

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
    if (!title.trim()) {
      setError("צריך לתת שם לתוכנית");
      return;
    }
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
        setError(data.error || "לא הצלחנו ליצור את התוכנית");
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
        type="button"
        onClick={() => setOpen(true)}
        className="wood flex w-full items-center gap-4 rounded-3xl px-5 py-4 text-right"
        style={{
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        <span
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl font-light"
          style={{ background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.2)" }}
        >
          +
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold">תוכנית חדשה</span>
          <span className="block text-xs font-medium opacity-80">
            יצירה מתבנית או מתוכנית ריקה
          </span>
        </span>
        <span aria-hidden="true" className="text-xl opacity-80">
          ←
        </span>
      </button>
    );
  }

  const field: React.CSSProperties = {
    background: "rgba(255,255,255,.05)",
    border: "1px solid var(--line)",
    color: "var(--text)",
  };

  return (
    <form
      className="glass rounded-3xl p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold">יצירת תוכנית חדשה</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
            תן שם ובחר אם להתחיל מתבנית קיימת.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
          style={{ background: "rgba(255,255,255,.055)", color: "var(--dim)" }}
          aria-label="סגירת הטופס"
        >
          ×
        </button>
      </div>

      <label className="mb-2 block text-sm font-bold">
        שם התוכנית
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-5 w-full rounded-2xl px-4 py-3.5 text-base outline-none"
        style={field}
        placeholder="לדוגמה: תוכנית אישית לדניאל"
        maxLength={80}
        autoFocus
      />

      {templates.length > 0 && (
        <>
          <label className="mb-2 block text-sm font-bold">
            נקודת התחלה
          </label>
          <select
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
            className="mb-5 w-full rounded-2xl px-4 py-3.5 outline-none"
            style={field}
          >
            <option value="">תוכנית ריקה</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                העתק מתוך: {t.title}
              </option>
            ))}
          </select>
        </>
      )}

      {copyFrom ? (
        <div
          className="mb-5 rounded-2xl px-4 py-3.5 text-sm leading-relaxed"
          style={{
            background: "rgba(180,133,79,.1)",
            border: "1px solid rgba(224,190,147,.25)",
            color: "var(--dim)",
          }}
        >
          האימונים והרמה יועתקו מהתבנית שבחרת. התוכנית החדשה תישמר בנפרד.
        </div>
      ) : (
        <>
          <label className="mb-2 block text-sm font-bold">
            רמה
          </label>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => setLevel(n)}
                className="rounded-2xl py-3 font-bold"
                style={{
                  background: level === n ? "rgba(180,133,79,.22)" : "rgba(255,255,255,.05)",
                  border: `1px solid ${level === n ? "rgba(224,190,147,.45)" : "var(--line)"}`,
                  color: level === n ? "var(--wood-1)" : "var(--dim)",
                }}
              >
                {programLevelName(n)}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsTemplate(!isTemplate)}
            className="mb-5 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-right"
            style={{
              background: isTemplate ? "rgba(180,133,79,.16)" : "rgba(255,255,255,.05)",
              border: `1px solid ${isTemplate ? "rgba(224,190,147,.4)" : "var(--line)"}`,
            }}
          >
            <span className="text-sm">
              <span className="block font-semibold">שמירה כתבנית</span>
              <span className="text-xs" style={{ color: "var(--dim)" }}>
                תבנית נשמרת כבסיס לתוכניות נוספות
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
        </>
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
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-2xl px-5 py-4 font-semibold"
          style={{ background: "rgba(255,255,255,.06)", color: "var(--dim)" }}
        >
          ביטול
        </button>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="wood flex-1 rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
          style={{
            color: "#f7ebda",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.28)",
          }}
        >
          {busy ? "יוצר…" : "צור תוכנית"}
        </button>
      </div>
    </form>
  );
}
