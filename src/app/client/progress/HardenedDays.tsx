"use client";

import { useState } from "react";

/**
 * ההקשיות, מקובצות לפי יום.
 *
 * שתי גרסאות נפסלו כאן לפני זו. הראשונה עטפה כל יום בכרטיס והציגה את
 * התרגילים כענן תגיות: ביום עמוס זה היה תשע עשרה מלבנים זהים בשבע
 * שורות, והחתימה הזאת של ממשק שנוצר אוטומטית היא מה שאביב זיהה מיד.
 * השנייה הורידה את הכרטיס ואת התגיות והשאירה שורה מלאה לכל שם, וזה
 * החליף בלגן באורך: ארבעה עשר שמות אחד מתחת לשני, חצי עמוד של רשימה
 * שקטה שאין בה כלום. חיסור לבד לא מייצר עמוד מעוצב.
 *
 * גם שתי עמודות נפסלו. שמות באורכים שונים בשני טורים בלי מסגרת נראו
 * כמילים מפוזרות על הדף, בלי שורות ובלי יישור, וזה קרא גרוע יותר מכל
 * הגרסאות הקודמות.
 *
 * מה שנשאר: טור אחד, שורות צפופות עם קו מפריד דק, וקצה. התרגילים כאן
 * הם תיעוד ולא הגיבור של הלשונית, ולכן מגיע להם משקל של תיעוד — קריא,
 * קומפקטי, ולא תובע את המסך. יום ארוך נחתך אחרי חמישה שמות ונפתח
 * בלחיצה, בדיוק כמו רשימת האימונים האחרונים באותה לשונית.
 *
 * כותרת היום היא שפת הכותרות של המדריך: מילה בזהב, קו שנמוג, וספירה
 * שקטה בקצה.
 *
 * ויתור על הגומייה שומר ניסוח משלו. זה הישג אחר מעליית דרגה, ומיזוג של
 * השניים תחת מילה אחת היה מוחק את ההבדל.
 */

export type HardeningRow = {
  name: string;
  /** "drop-band" הוא ויתור על הגומייה. כל השאר הם עליית דרגה. */
  kind: string;
  /** מפתח היום, מעוצב בשרת כדי שהקיבוץ והתצוגה ידברו על אותו יום. */
  dayKey: string;
  /** התאריך כפי שהוא מוצג, למשל 7 באוגוסט 2026. */
  heading: string;
};

type Entry = { name: string; dropped: boolean };

type Day = {
  dayKey: string;
  heading: string;
  entries: Entry[];
};

/** כמה שמות מוצגים ביום לפני שהשאר נחתכים. */
const VISIBLE = 5;

function groupByDay(rows: HardeningRow[]): Day[] {
  const days: Day[] = [];
  const byKey = new Map<string, Day>();
  // השורות מגיעות ממוינות מהחדש לישן, ולכן סדר ההופעה נשמר מעצמו.
  for (const row of rows) {
    let day = byKey.get(row.dayKey);
    if (!day) {
      day = { dayKey: row.dayKey, heading: row.heading, entries: [] };
      byKey.set(row.dayKey, day);
      days.push(day);
    }
    /*
     * אותו תרגיל פעם אחת ביום.
     *
     * מתאמן שביצע את שני האימונים באותו יום, או שהתרגיל שלו הוקשה יותר
     * מפעם אחת, קיבל את אותו שם שלוש פעמים באותו יום. זה מדויק ברמת
     * הנתונים ונקרא כתקלה ברמת המסך.
     */
    const dropped = row.kind === "drop-band";
    const seen = day.entries.some(
      (entry) => entry.name === row.name && entry.dropped === dropped
    );
    if (!seen) day.entries.push({ name: row.name, dropped });
  }
  return days;
}

export default function HardenedDays({ rows }: { rows: HardeningRow[] }) {
  const days = groupByDay(rows);
  const [openDays, setOpenDays] = useState<string[]>([]);

  return (
    <div>
      {days.map((day, dayIndex) => {
        const open = openDays.includes(day.dayKey);
        const shown = open ? day.entries : day.entries.slice(0, VISIBLE);
        const hidden = day.entries.length - shown.length;

        return (
          <section key={day.dayKey} className={dayIndex ? "mt-6" : ""}>
            {/*
              אותה כותרת קבוצה של השאלות הנפוצות במדריך: מילה בעץ, קו
              שנמוג, וספירה שקטה בקצה.
            */}
            <h3 className="mb-2 flex items-center gap-3">
              <span className="wood-text shrink-0 text-[1.05rem] font-black leading-tight tracking-[-.025em]">
                {day.heading}
              </span>
              <span
                className="h-px flex-1"
                style={{
                  background:
                    "linear-gradient(to left, var(--wood-border), transparent)",
                }}
              />
              <span className="shrink-0 text-[11px] font-black tabular-nums text-[var(--faint)]">
                {day.entries.length}
              </span>
            </h3>

            <div>
              {shown.map((entry, index) => (
                <div
                  key={`${entry.name}-${entry.dropped ? "band" : "step"}`}
                  className="py-2"
                  style={{
                    borderTop: index === 0 ? "none" : "1px solid var(--line)",
                  }}
                >
                  <p className="truncate text-sm font-bold leading-snug">
                    {entry.name}
                  </p>
                  {/*
                    שורת ההסבר רק בוויתור על הגומייה. כותרת המקטע כבר
                    אומרת "שעלו דרגה", ולכן "עלית דרגה" מתחת לכל שם היה
                    חוזר על עצמו ארבעה עשר פעמים בלי להוסיף דבר.
                  */}
                  {entry.dropped && (
                    <p className="text-[11px]" style={{ color: "var(--dim)" }}>
                      בלי גומייה
                    </p>
                  )}
                </div>
              ))}
            </div>

            {(hidden > 0 || open) && (
              <button
                type="button"
                onClick={() =>
                  setOpenDays((list) =>
                    open
                      ? list.filter((key) => key !== day.dayKey)
                      : [...list, day.dayKey]
                  )
                }
                className="mt-1.5 min-h-9 text-xs font-bold"
                style={{ color: "var(--wood-1)" }}
              >
                {open ? "הצג פחות" : `ועוד ${hidden}`}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
