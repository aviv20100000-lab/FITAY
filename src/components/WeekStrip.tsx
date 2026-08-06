"use client";

/**
 * רצועת השבוע: המתאמן מסמן לעצמו מתי הוא מתכנן להתאמן.
 *
 * שבוע קלנדרי קבוע, ראשון עד שבת, ולא שבעה ימים מתגלגלים. הקצב מנוסח
 * "3 בשבוע", וחלון מתגלגל הופך את הספירה הזאת ללא ניתנת לאימות בעין.
 *
 * שבעה תאים נכנסים ברוחב המסך, ולכן אין כאן גלילה. רצועה נגללת ב-RTL היא
 * מקור קבוע לבאגים של מיקום התחלתי, ואין שום סיבה לשלם על זה.
 *
 * משקל של כרטיס ולא של פאנל, ובלי צל. הצל הצבעוני שמור לכרטיס "הבא בתור",
 * והוא צריך להישאר הסימן החזק ביותר במסך.
 */
import { useEffect, useState } from "react";

const DAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

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
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setToday(localDay(new Date())), []);
  useEffect(() => setMarked(new Set(planned)), [planned]);

  if (!today) return null;

  const done = new Set(completedAt.map((iso) => localDay(new Date(iso))));

  // ראשון של השבוע הנוכחי. getDay מחזיר 0 לראשון, ולכן זו חסירה פשוטה.
  const base = new Date(`${today}T00:00:00`);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay());

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return { key: localDay(date), letter: DAY_LETTERS[index], number: date.getDate() };
  });

  const plannedThisWeek = days.filter((d) => marked.has(d.key)).length;

  async function toggle(day: string) {
    if (done.has(day)) return; // יום שכבר בוצע הוא עובדה, ואין מה לתכנן בו.
    const next = !marked.has(day);

    // עדכון מיידי ואז שליחה. מתאמן שמסמן שלושה ימים ברצף לא צריך לחכות
    // לרשת בין לחיצה ללחיצה.
    setMarked((current) => {
      const copy = new Set(current);
      if (next) copy.add(day);
      else copy.delete(day);
      return copy;
    });
    setBusy(day);

    try {
      const response = await fetch("/api/client/training-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, planned: next }),
      });
      if (!response.ok) throw new Error();
    } catch {
      // החזרה למצב הקודם. סימון שנשאר על המסך בלי שנשמר הוא גרוע יותר
      // מסימון שנעלם, כי המתאמן סומך עליו.
      setMarked((current) => {
        const copy = new Set(current);
        if (next) copy.delete(day);
        else copy.add(day);
        return copy;
      });
    }
    setBusy(null);
  }

  return (
    <section
      className="mb-5 rounded-[1.6rem] px-4 py-3.5"
      style={{ background: "var(--soft-1)", border: "1px solid var(--line)" }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-extrabold">השבוע שלי</h2>
        <p className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
          {plannedThisWeek === 0
            ? "סמן מתי אתה מתכנן להתאמן"
            : `סימנת ${plannedThisWeek} ימים`}
        </p>
      </div>

      <div className="flex gap-1">
        {days.map((day) => {
          const isDone = done.has(day.key);
          const isPlanned = marked.has(day.key);
          const isToday = day.key === today;
          const isPast = day.key < today;

          return (
            <button
              key={day.key}
              type="button"
              disabled={isDone || busy === day.key}
              onClick={() => toggle(day.key)}
              aria-pressed={isPlanned}
              aria-label={`${day.letter}, ${day.number}${
                isDone ? ", בוצע" : isPlanned ? ", מתוכנן" : ""
              }`}
              className="min-h-[52px] flex-1 rounded-xl transition active:scale-[.97]"
              style={{
                /*
                  מילוי הוא עובדה, מסגרת מקווקוות היא כוונה. זה ההבדל היחיד
                  שצריך, והוא נקרא נכון בלי מקרא.
                */
                background: isDone ? "rgba(180,133,79,.2)" : "transparent",
                border: isDone
                  ? "1px solid rgba(224,190,147,.32)"
                  : isPlanned
                    ? "1px dashed rgba(224,190,147,.45)"
                    : "1px solid var(--line)",
                // יום שעבר בלי אימון מעומעם ותו לא. אין במסך הזה שום מצב
                // שמאשים את המתאמן, ולוח שנה הוא בדיוק המקום שזה מתגנב בו.
                opacity: isPast && !isDone && !isPlanned ? 0.45 : 1,
              }}
            >
              <span
                className="block text-[10px] font-bold"
                style={{
                  color: isDone || isPlanned ? "var(--wood-1)" : "var(--faint)",
                }}
              >
                {day.letter}
              </span>
              <span
                className="block text-sm font-black tabular-nums"
                style={{
                  color: isDone || isPlanned ? "var(--wood-1)" : "var(--dim)",
                }}
              >
                {isDone ? "✓" : day.number}
              </span>
              {/* אותו קו של הלשונית הפעילה בניווט התחתון. אפס למידה חדשה. */}
              <span
                aria-hidden="true"
                className="mx-auto mt-1 block h-0.5 w-4 rounded-full"
                style={{ background: isToday ? "var(--wood-2)" : "transparent" }}
              />
            </button>
          );
        })}
      </div>

      {/*
        המתאמן צריך לדעת שאיתי רואה. סימון שנראה פרטי ובעצם מוצג למאמן הוא
        בדיוק מה שגורם למישהו להפסיק לסמן ברגע שהוא מגלה.
      */}
      <p className="mt-2.5 text-[11px]" style={{ color: "var(--faint)" }}>
        FITAY רואה את הימים שסימנת. הוא לא יכול לשנות אותם.
      </p>
    </section>
  );
}
