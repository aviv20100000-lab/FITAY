"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { welcomeMessage } from "@/lib/welcome-message";

const field: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-1)",
  color: "var(--text)",
};

export default function NewTraineePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** הפרטים כפי שנשמרו בפועל, לא כפי שהוקלדו. */
  const [created, setCreated] = useState<{ phone: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // ההודעה נגזרת ממה שנשמר בפועל ולא ממה שהוקלד, כדי שלא תישלח
  // סיסמה שונה ממה שבמסד.
  const message = created
    ? welcomeMessage({ name, phone: created.phone, password: created.password })
    : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/coach/trainees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "לא הצלחנו להוסיף את המתאמן");
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

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
        <BackLink href="/coach" className="mb-6">
          חזרה לדף הראשי
        </BackLink>

        <h1 className="mb-1 text-3xl font-bold tracking-tight">מתאמן חדש</h1>
        <p className="mb-7 text-sm" style={{ color: "var(--dim)" }}>
          הפרטים שתיתן לו כדי להיכנס
        </p>

        {created ? (
          /* מציגים בדיוק את מה שנשמר. בלי המסך הזה מאמן FITAY מוסר פרטים
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

            {/* ההודעה המלאה, לפני ההעתקה. מאמן FITAY רואה בדיוק מה הוא שולח
                ולא מעתיק בעיוורון. */}
            <details className="mb-3">
              <summary
                className="cursor-pointer text-sm font-semibold"
                style={{ color: "var(--wood-1)" }}
              >
                מה ההודעה מכילה
              </summary>
              <pre
                className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl px-4 py-3 text-xs leading-relaxed"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-1)",
                  color: "var(--dim)",
                  fontFamily: "inherit",
                }}
              >
                {message}
              </pre>
            </details>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(message)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
              className="wood mb-2.5 w-full rounded-2xl py-4 font-extrabold"
              style={{ color: "var(--on-wood)", boxShadow: "var(--button-shadow)" }}
            >
              {copied ? "הועתק" : "העתק הודעה לוואטסאפ"}
            </button>

            {/* פותח ישירות את וואטסאפ עם ההודעה מוכנה. חוסך את ההדבקה,
                וגם מונע מצב שההעתקה נכשלה בשקט והוא שלח הודעה ריקה. */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="mb-2.5 block w-full rounded-2xl py-3.5 text-center font-semibold"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-1)",
                color: "var(--wood-1)",
              }}
            >
              פתח בוואטסאפ
            </a>
            <Link
              href="/coach"
              className="block w-full rounded-2xl py-3.5 text-center text-sm font-semibold"
              style={{ background: "var(--surface-2)", color: "var(--dim)" }}
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
          {/* גלוי בכוונה — מאמן FITAY צריך לקרוא אותה ולמסור אותה.
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

          {/*
            מתג מצב השיקום הוסר.
            הוא רק פתח דיווח כאב, ודיווח הכאב נמצא עכשיו אצל כל מתאמן
            בסוף כל אימון. מעבר לזה לא היה מאחוריו כלום: אפס תרגילי שיקום
            בספרייה, ואין תוכן שיקום בחוברת של FITAY.
            העמודה במסד נשארה, ולא נמחק שום נתון.
          */}

          {error && (
            <p
              className="mb-4 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(229,72,77,.12)",
                border: "1px solid rgba(229,72,77,.3)",
                color: "var(--danger-text)",
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
              color: "var(--on-wood)",
              boxShadow: "var(--button-shadow)",
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
