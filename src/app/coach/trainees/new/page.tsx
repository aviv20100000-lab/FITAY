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
  /** הפרטים כפי שנשמרו בפועל, לא כפי שהוקלדו. */
  const [created, setCreated] = useState<{ phone: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
      setCreated({ phone: String(data.phone), password: password.trim() });
      setBusy(false);
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

      <div className="relative z-10 mx-auto w-full max-w-md px-5 safe-top pb-10">
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

        {created ? (
          /* מציגים בדיוק את מה שנשמר. בלי המסך הזה איתי מוסר פרטים
             מהזיכרון, ומספיק רווח אחד כדי שהמתאמן לא יצליח להיכנס. */
          <div className="glass rounded-3xl p-6">
            <p className="mb-1 text-lg font-bold">{name} נוסף</p>
            <p className="mb-5 text-sm" style={{ color: "var(--dim)" }}>
              אלה הפרטים המדויקים לכניסה. תשלח לו אותם עכשיו.
            </p>

            <div
              className="mb-4 rounded-2xl px-4 py-4"
              style={{
                background: "rgba(180,133,79,.12)",
                border: "1px solid rgba(224,190,147,.28)",
              }}
            >
              <Detail label="טלפון" value={created.phone} />
              <Detail label="סיסמה" value={created.password} />
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(
                    `הכניסה לאפליקציה:\nfitay.vercel.app\nטלפון: ${created.phone}\nסיסמה: ${created.password}`
                  )
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
              className="wood mb-2.5 w-full rounded-2xl py-4 font-extrabold"
              style={{ color: "#f7ebda", boxShadow: "inset 0 1px 0 rgba(255,255,255,.28)" }}
            >
              {copied ? "הועתק" : "העתק הודעה לוואטסאפ"}
            </button>
            <Link
              href="/coach"
              className="block w-full rounded-2xl py-3.5 text-center text-sm font-semibold"
              style={{ background: "rgba(255,255,255,.05)", color: "var(--dim)" }}
            >
              סיימתי
            </Link>
          </div>
        ) : (
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
          {/* גלוי בכוונה — איתי צריך לקרוא אותה ולמסור אותה.
              autoCapitalize/autoCorrect כבויים: מקלדת אייפון הוסיפה כאן
              רווח ואות ראשית, והסיסמה נשמרה שונה ממה שהוא ראה. */}
          <input
            dir="ltr"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
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
        )}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm" style={{ color: "var(--dim)" }}>
        {label}
      </span>
      <span
        className="text-xl font-extrabold tabular-nums"
        dir="ltr"
        style={{ color: "var(--wood-1)" }}
      >
        {value}
      </span>
    </div>
  );
}
