"use client";

/**
 * הכניסה ליומן האימונים ממסך הבית.
 *
 * זו דלת, לא תצוגת נתונים. קדמו לה ארבע גרסאות של רצועת שבוע — עיגולים,
 * ריבועים, אותיות עם קו, קו רציף — וכולן נכשלו מאותה סיבה: הן ניסו להציג
 * נתון זעום, כמה אימונים היו השבוע, ושום עיצוב לא מציל בלוק שאין לו מה
 * להגיד. הערך יושב בלוח החודשי שנפתח מכאן, שבו רואים לאורך חודש שלם מה
 * תוכנן ומה בוצע. זו הבקשה של המאמן, וזה מה שמגיע לו מאמץ עיצוב.
 *
 * הסיכום השבועי נשאר, אבל כשורת מצב בקצה הכותרת ולא כגרפיקה.
 *
 * הלוח נפתח כשכבה מעל המסך ולא בתוכו. חודש מלא היה דוחף את השער מתחת
 * לקיפול, וזה הפריט שכל המסך בנוי סביבו.
 */
import { useEffect, useState } from "react";
import TrainingCalendarSheet from "./TrainingCalendarSheet";


/** YYYY-MM-DD לפי השעון של המשתמש, ולא לפי UTC. */
function localDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function WeekStrip({
  planned,
  completedAt,
}: {
  planned: string[];
  /** חותמות ISO של אימונים שבוצעו. ההמרה לתאריך נעשית כאן, בשעון המקומי. */
  completedAt: string[];
}) {
  /*
   * "היום" נקבע אחרי ההרכבה ולא בשרת. הברכה בראש המסך רצה על זמן השרת וזה
   * בסדר עבורה, אבל כאן זה היה מדגיש את היום הלא נכון למי שנמצא באזור זמן
   * אחר. עד שזה נקבע הרצועה לא מוצגת, כדי שלא תהבהב ליום שגוי.
   */
  const [today, setToday] = useState<string | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set(planned));
  const [open, setOpen] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => setToday(localDay(new Date())), []);
  useEffect(() => setMarked(new Set(planned)), [planned]);

  // הודעת "נשמר" נעלמת מעצמה, כדי שהמתאמן ידע שהלחיצה הצליחה בלי לחסום אותו.
  useEffect(() => {
    if (!savedToast) return;
    const timer = setTimeout(() => setSavedToast(false), 1800);
    return () => clearTimeout(timer);
  }, [savedToast]);

  if (!today) return null;

  const done = new Set(completedAt.map((iso) => localDay(new Date(iso))));

  // ראשון של השבוע הנוכחי. getDay מחזיר 0 לראשון, ולכן זו חסירה פשוטה.
  const base = new Date(`${today}T00:00:00`);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay());

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return { key: localDay(date) };
  });

  const plannedThisWeek = days.filter((d) => marked.has(d.key)).length;
  const doneThisWeek = days.filter((d) => done.has(d.key)).length;

  /**
   * הסיכום יושב בקצה הקו הדוהה, כמו המספר בכותרות קבוצות השאלות במדריך.
   * גרסה עם משפט מלא מתחת לרצועה נקראה כפסקה שהודבקה: היא לא חלק
   * מהמערכת הטיפוגרפית, והיא הורידה את כל הבלוק.
   *
   * המספרים הם מה שקרה בפועל, בלי ניסוח שמעניש: מי שלא תכנן כלום מקבל
   * הזמנה לתכנן, ולא ספירה של אפס.
   */
  const summary =
    plannedThisWeek === 0
      ? doneThisWeek === 0
        ? "עוד לא סימנת ימים"
        : doneThisWeek === 1
          ? "אימון אחד השבוע"
          : `${doneThisWeek} אימונים השבוע`
      : `${doneThisWeek} מתוך ${plannedThisWeek} שתכננת`;

  return (
    <>
      <section className="mb-7">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="shrink-0 text-[1.15rem] font-black leading-tight tracking-[-.025em]">
            היומן <span className="wood-text">שלי</span>
          </h2>
          <span className="h-px min-w-3 flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
          <span className="shrink-0 text-[11px] font-bold text-[var(--faint)]">
            {summary}
          </span>
        </div>

        {/*
          שורה אחת שפותחת את החודש, ולא תצוגה מוקטנת שלו.
          ארבע גרסאות של רצועת שבוע נכשלו מאותה סיבה: הן ניסו להציג נתון
          זעום — כמה אימונים היו השבוע — ושום עיצוב לא מציל בלוק שאין לו
          מה להגיד. הערך האמיתי יושב בלוח החודשי שנפתח מכאן, שם רואים מה
          תוכנן ומה בוצע לאורך חודש שלם. זו הבקשה של המאמן.
          לכן במסך הבית זו דלת, ומאמץ העיצוב עובר ללוח עצמו.
        */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3.5 px-1 py-5 text-right transition active:opacity-70"
          style={{ borderTop: "1px solid var(--wood-border)", borderBottom: "1px solid var(--wood-border)" }}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-black tracking-[-.02em]">פתיחת היומן</span>
            <span className="mt-1 block text-xs" style={{ color: "var(--dim)" }}>
              סימון ימי האימון של החודש
            </span>
          </span>
          <span
            className="shrink-0 text-2xl leading-none"
            aria-hidden="true"
            style={{ color: "var(--wood-1)" }}
          >
            ←
          </span>
        </button>
      </section>

      {open && (
        <TrainingCalendarSheet
          planned={marked}
          completed={done}
          today={today}
          onClose={() => setOpen(false)}
          onSaved={(days) => {
            // מה שנשמר הוא מה שמוצג, בלי לחכות לרענון מהשרת.
            setMarked(new Set(days));
            setOpen(false);
            setSavedToast(true);
          }}
        />
      )}

      {savedToast && (
        <div
          className="fixed inset-x-0 bottom-24 z-[70] flex justify-center"
          role="status"
          aria-live="polite"
        >
          <span
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={{ background: "var(--wood-2)", color: "var(--accent-contrast)" }}
          >
            נשמר
          </span>
        </div>
      )}
    </>
  );
}
