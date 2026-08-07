"use client";

/**
 * רצועת השבוע במסך הבית.
 *
 * תצוגה בלבד: מראה את השבוע הנוכחי במבט אחד, והלחיצה פותחת את הלוח
 * החודשי שבו מסמנים. בגרסה הראשונה סימנו ישירות על הרצועה, וזה לא היה
 * מובן, אין שום דבר שאומר שהתאים לחיצים, ושבוע אחד קצר מדי לתכנון. עכשיו
 * כל הרצועה כפתור אחד גדול עם הזמנה מפורשת לפתוח.
 *
 * הלוח נפתח כשכבה מעל המסך ולא בתוכו. חודש מלא היה דוחף את כרטיס
 * "הבא בתור" מתחת לקיפול, וזה הפריט שכל המסך בנוי סביבו.
 */
import { useEffect, useState } from "react";
import TrainingCalendarSheet from "./TrainingCalendarSheet";

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
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-5 block w-full rounded-[1.6rem] px-4 py-3.5 text-right transition active:scale-[.99]"
        style={{ background: "var(--soft-1)", border: "1px solid var(--line)" }}
      >
        <span className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-sm font-extrabold">השבוע שלי</span>
          <span className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
            {plannedThisWeek === 0
              ? "עוד לא סימנת השבוע"
              : `סימנת ${plannedThisWeek} ימים השבוע`}
          </span>
        </span>

        {/* תצוגה בלבד. הסימון עצמו קורה בלוח החודשי שנפתח בלחיצה. */}
        <span className="flex gap-1" aria-hidden="true">
          {days.map((day) => {
            const isDone = done.has(day.key);
            const isPlanned = marked.has(day.key);
            const isToday = day.key === today;
            const isPast = day.key < today;

            return (
              <span
                key={day.key}
                className="min-h-[52px] flex-1 rounded-xl pt-1.5"
                style={{
                  // מילוי הוא עובדה, מסגרת מקווקוות היא כוונה.
                  background: isDone ? "rgba(180,133,79,.2)" : "transparent",
                  border: isDone
                    ? "1px solid rgba(224,190,147,.32)"
                    : isPlanned
                      ? "1px dashed rgba(224,190,147,.45)"
                      : "1px solid var(--line)",
                  // יום שעבר בלי אימון מעומעם ותו לא, בלי אדום ובלי האשמות.
                  opacity: isPast && !isDone && !isPlanned ? 0.45 : 1,
                }}
              >
                <span
                  className="block text-center text-[10px] font-bold"
                  style={{
                    color: isDone || isPlanned ? "var(--wood-1)" : "var(--faint)",
                  }}
                >
                  {day.letter}
                </span>
                <span
                  className="block text-center text-sm font-black tabular-nums"
                  style={{
                    color: isDone || isPlanned ? "var(--wood-1)" : "var(--dim)",
                  }}
                >
                  {isDone ? "✓" : day.number}
                </span>
                {/* אותו קו של הלשונית הפעילה בניווט התחתון. */}
                <span
                  className="mx-auto mt-1 block h-0.5 w-4 rounded-full"
                  style={{ background: isToday ? "var(--wood-2)" : "transparent" }}
                />
              </span>
            );
          })}
        </span>

        {/* ההזמנה לפעולה. בלעדיה הרצועה נראית כמו עוד תצוגה. */}
        <span
          className="mt-2.5 block text-center text-xs font-bold"
          style={{ color: "var(--wood-1)" }}
        >
          לחץ לפתיחת היומן וסימון ימי האימון שלך ←
        </span>
      </button>

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
          }}
        />
      )}
    </>
  );
}
