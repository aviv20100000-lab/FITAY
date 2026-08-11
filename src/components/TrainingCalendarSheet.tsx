"use client";

/**
 * הלוח החודשי שבו המתאמן מסמן מתי הוא מתכנן להתאמן.
 *
 * נפתח כשכבה מעל המסך ולא בתוכו. חודש מלא הוא כ-320 פיקסלים גובה, ובתוך
 * מסך הבית הוא היה דוחף את כרטיס "הבא בתור" מתחת לקיפול, וזה הפריט שכל
 * המסך בנוי סביבו.
 *
 * הסימונים חיים כאן עד לחיצה על שמור. לכן יש גם ביטול, ולכן סגירה בלי
 * שמירה שואלת לפני שהיא זורקת עבודה.
 */
import { useEffect, useState } from "react";
import { useOverlay } from "@/lib/useOverlay";

const DAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

/** כמה חודשים קדימה מותר לדפדף. סימון של חצי שנה קדימה אינו תכנון אימונים. */
const MONTHS_FORWARD = 3;

function localDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function TrainingCalendarSheet({
  planned,
  completed,
  today,
  onClose,
  onSaved,
}: {
  planned: Set<string>;
  /** ימים שכבר התאמן בהם. עובדה, ולכן לא ניתנים לסימון. */
  completed: Set<string>;
  today: string;
  onClose: () => void;
  onSaved: (days: Set<string>) => void;
}) {
  const [marked, setMarked] = useState<Set<string>>(new Set(planned));
  // רק חודשים שנגעו בהם נשלחים לשמירה. דפדוף בלבד לא ימחק כלום.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  // כל עוד הלוח פתוח, הסרגלים הקבועים מתחתיו מסתתרים.
  useOverlay();

  // מקש Escape סוגר, כמו כל חלון. עובר דרך אותה בדיקה של שינויים.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") attemptClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const base = new Date(`${today}T00:00:00`);
  const viewed = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const monthKey = `${viewed.getFullYear()}-${String(viewed.getMonth() + 1).padStart(2, "0")}`;

  const daysInMonth = new Date(
    viewed.getFullYear(),
    viewed.getMonth() + 1,
    0
  ).getDate();
  // כמה תאים ריקים לפני היום הראשון, כדי שהוא ינחת על העמודה הנכונה.
  const leadingBlanks = viewed.getDay();

  const dirty = touched.size > 0;

  function toggle(day: string) {
    if (completed.has(day)) return; // עובדה, לא כוונה.
    if (day < today) return; // אין טעם לתכנן אחורה.
    setError("");
    setMarked((current) => {
      const copy = new Set(current);
      if (copy.has(day)) copy.delete(day);
      else copy.add(day);
      return copy;
    });
    setTouched((current) => new Set(current).add(monthKey));
  }

  function attemptClose() {
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmClose(true);
  }

  async function save() {
    setBusy(true);
    setError("");
    const months = [...touched];
    const days = [...marked].filter((day) => months.includes(day.slice(0, 7)));

    try {
      const response = await fetch("/api/client/training-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months, days }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "השמירה נכשלה");
      }
      onSaved(marked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "השמירה נכשלה");
      setBusy(false);
    }
  }

  return (
    /*
      z-[60] ולא z-50. סרגל הניווט התחתון יושב על z-50 ומצויר אחרי תוכן
      המסך, ולכן בשכבה זהה הוא כיסה בדיוק את תחתית היומן, כלומר את כפתור
      השמירה. אותה שכבה גם מכסה אותו עכשיו, וזה הנכון: כל עוד היומן פתוח
      אין לאן לנווט.
    */
    /*
      גובה של 100dvh ולא inset-0.
      inset-0 נמדד מול חלון הפריסה, ובספארי באייפון הוא נמשך אל מתחת
      לסרגל הכתובת התחתון. הפאנל נצמד לתחתית שלו, כלומר אל מאחורי הסרגל,
      ותחתיתו נשארת מחוץ לתצוגה. יחידת dvh היא הגובה הנראה בפועל.
    */
    <div
      className="fixed inset-x-0 top-0 z-[60] flex h-[100dvh] flex-col justify-end"
      style={{ background: "rgba(0,0,0,.6)" }}
      onClick={attemptClose}
    >
      {/*
        הפאנל חסום בגובה המסך והלוח גולל בתוכו, כשהכותרת והשמירה נשארות
        במקומן. חודש שמתחיל בשבת נפרש על שש שורות, ובמסך נמוך הוא היה
        דוחף את כפתור השמירה אל מחוץ לתצוגה.
      */}
      <div
        className="mx-auto flex max-h-full w-full max-w-md flex-col rounded-t-[2rem]"
        style={{
          background: "var(--panel)",
          borderTop: "1px solid rgba(224,190,147,.28)",
          boxShadow: "var(--panel-shadow)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-4 pt-5">
          <h2 className="text-lg font-black">מתי מתאמנים</h2>
          <button
            type="button"
            onClick={attemptClose}
            className="rounded-xl px-3 py-1.5 text-sm font-bold"
            style={{ background: "var(--surface-2)", color: "var(--dim)" }}
          >
            סגירה
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
        {/*
          בניווט החודשים החץ ימינה מוביל אחורה בזמן, כמו כל תנועה ב-RTL.
        */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={offset >= MONTHS_FORWARD}
            onClick={() => setOffset((o) => o + 1)}
            className="min-h-11 min-w-11 rounded-xl text-lg font-black disabled:opacity-30"
            style={{ background: "var(--surface-2)", color: "var(--wood-1)" }}
            aria-label="החודש הבא"
          >
            ‹
          </button>
          <p className="text-sm font-extrabold">
            {MONTH_NAMES[viewed.getMonth()]} {viewed.getFullYear()}
          </p>
          <button
            type="button"
            disabled={offset <= 0}
            onClick={() => setOffset((o) => o - 1)}
            className="min-h-11 min-w-11 rounded-xl text-lg font-black disabled:opacity-30"
            style={{ background: "var(--surface-2)", color: "var(--wood-1)" }}
            aria-label="החודש הקודם"
          >
            ›
          </button>
        </div>

        <div className="mb-1.5 grid grid-cols-7 gap-1">
          {DAY_LETTERS.map((letter) => (
            <span
              key={letter}
              className="text-center text-[11px] font-bold"
              style={{ color: "var(--faint)" }}
            >
              {letter}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = new Date(viewed.getFullYear(), viewed.getMonth(), i + 1);
            const key = localDay(date);
            const isDone = completed.has(key);
            const isPlanned = marked.has(key);
            const isToday = key === today;
            const isPast = key < today;

            return (
              <button
                key={key}
                type="button"
                disabled={isDone || isPast}
                onClick={() => toggle(key)}
                aria-pressed={isPlanned}
                className="min-h-[44px] rounded-xl text-sm font-black tabular-nums transition active:scale-[.95] disabled:active:scale-100"
                style={{
                  // מילוי הוא עובדה, מסגרת מקווקוות היא כוונה.
                  background: isDone
                    ? "rgba(180,133,79,.2)"
                    : isPlanned
                      ? "rgba(180,133,79,.1)"
                      : "transparent",
                  border: isDone
                    ? "1px solid rgba(224,190,147,.32)"
                    : isPlanned
                      ? "1px dashed rgba(224,190,147,.55)"
                      : "1px solid var(--line)",
                  color:
                    isDone || isPlanned ? "var(--wood-1)" : "var(--dim)",
                  // יום שעבר מעומעם ותו לא. אין כאן שום דבר שמאשים.
                  opacity: isPast && !isDone ? 0.35 : 1,
                  textDecoration: isToday ? "underline" : "none",
                }}
              >
                {isDone ? "✓" : i + 1}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs leading-5" style={{ color: "var(--dim)" }}>
          לוחצים על יום כדי לסמן אימון מתוכנן. ימים שכבר תיעדת בהם
          אימון מסומנים בוי ואי אפשר לשנות אותם.
        </p>

        {error && (
          <p className="mt-2 text-sm" style={{ color: "var(--danger-text)" }}>
            {error}
          </p>
        )}
        </div>

        {/* השמירה מרותקת לתחתית הפאנל, מחוץ לאזור הגלילה של הלוח. */}
        <div
          className="shrink-0 px-5 pt-3"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
        {confirmClose ? (
          <div>
            <p className="mb-2 text-sm font-bold">לצאת בלי לשמור?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-12 rounded-2xl font-bold"
                style={{
                  background: "rgba(229,72,77,.14)",
                  border: "1px solid rgba(229,72,77,.4)",
                  color: "var(--danger-text)",
                }}
              >
                יציאה בלי שמירה
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="min-h-12 rounded-2xl font-semibold"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                }}
              >
                אחורה
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={save}
            className="wood min-h-12 w-full rounded-2xl font-extrabold text-[var(--on-wood)] disabled:opacity-40"
          >
            {busy ? "שומרים…" : dirty ? "שמירה" : "אין שינויים לשמור"}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
