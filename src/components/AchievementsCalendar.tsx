"use client";

/**
 * לוח הנוכחות בלשונית ההישגים.
 *
 * תמונה, לא כלי. הוא מסמן רק ימים שהתאמנת בהם, אין בו סימון של תכנון,
 * אין הדגשה של היום, ואין תגובה ללחיצה. זה מה שמפריד אותו מרצועת השבוע
 * שבמסך הבית, שהיא כלי התכנון: שני לוחות שנראים אותו דבר היו גורמים
 * למתאמן ללחוץ כאן כדי לסמן יום, ולא היה קורה כלום.
 *
 * הימים מחושבים בדפדפן ולא בשרת. מתאמן שסיים אימון בערב היה מקבל אחרת
 * את היום שאחריו, כי החותמת נשמרת ב-UTC.
 *
 * בלי כרטיס. הלוח הוא אחד משלושה מקטעי תיעוד בתחתית הלשונית, ושלושתם
 * יושבים על הדף עצמו. כשכל אחד מהם היה קופסה משלו, חמישה בלוקים באותו
 * משקל נערמו זה על זה ולא היה בעמוד דבר אחד שהעין נוחתת עליו.
 */
import { useEffect, useState } from "react";

const DAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function localDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AchievementsCalendar({
  completedAt,
}: {
  /** חותמות ISO של אימונים שהושלמו. ההמרה ליום נעשית כאן, בשעון המקומי. */
  completedAt: string[];
}) {
  // עד שהחודש נקבע בדפדפן אין ציור, אחרת הלוח היה מהבהב לחודש של השרת.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  if (!now) return <div className="h-72" />;

  const done = new Set(completedAt.map((iso) => localDay(new Date(iso))));
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const leadingBlanks = first.getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), i + 1);
    return { key: localDay(date), number: i + 1 };
  });
  const trained = days.filter((day) => done.has(day.key)).length;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="font-extrabold">
          {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
        </p>
        {/*
          * חודש בלי אימונים לא מקבל שורת ספירה. "עוד לא התאמנת החודש"
          * הוא משפט שמסתכל אחורה ומאשים, והלוח הריק כבר אומר את זה בלי
          * מילים.
          */}
        {trained > 0 && (
          <p className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
            {trained === 1 ? "אימון אחד החודש" : `${trained} אימונים החודש`}
          </p>
        )}
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
        {days.map((day) => {
          const isDone = done.has(day.key);
          return (
            <span
              key={day.key}
              className="grid h-10 place-items-center rounded-xl text-sm font-black tabular-nums"
              style={{
                // יום שהתאמנת בו מתמלא. יום ריק נשאר מספר דהוי, בלי
                // מסגרת ובלי צבע אזהרה. הלוח מראה נוכחות, והיעדרות
                // פשוט לא מצוירת.
                background: isDone ? "var(--wood-2)" : "transparent",
                color: isDone ? "var(--accent-contrast)" : "var(--faint)",
              }}
            >
              {day.number}
            </span>
          );
        })}
      </div>

      {/* המקרא קבוע, כדי שהלוח יובן בלי לנחש מה המשמעות של ריבוע מלא. */}
      <p className="mt-3 text-center text-xs" style={{ color: "var(--faint)" }}>
        הימים המלאים הם הימים שהתאמנת בהם
      </p>
    </div>
  );
}
