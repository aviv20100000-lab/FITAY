/**
 * ההקשיות, מקובצות לפי יום.
 *
 * קודם כל יום היה כרטיס צף משלו, והתרגילים בתוכו היו ענן של תגיות. ביום
 * עמוס זה הגיע לתשע עשרה תגיות זהות בשבע שורות, והמקטע הזה הפך לגוש הכי
 * כבד בלשונית בזמן שהוא מתאר יום אחד. אביב זיהה את זה נכון: ענן של
 * מלבנים קטנים זהים הוא החתימה של ממשק שנוצר אוטומטית, לא של עמוד
 * שמישהו עיצב.
 *
 * עכשיו זו שפת הכותרות של המדריך: כותרת יום בזהב עם קו שנמוג וספירה
 * שקטה בקצה, בדיוק כמו "לפני שמתחילים" בשאלות הנפוצות. יום עם תרגיל אחד
 * ויום עם תשעה עשר נראים אותו דבר, רק ארוכים אחרת, ולכן אין יותר שתי
 * צורות באותו מקטע.
 *
 * ובלי קופסה בכלל. הגרסה הראשונה שלי כאן עטפה את השורות במשטח העץ של
 * "ארבעה כללים", ואביב אמר שזה בדיוק המלבן שהוא לא אוהב. אז השורות
 * יושבות על הדף עצמו, מופרדות בקווי שיער בלבד. זה מוריד מהמקטע את
 * המשטח האחרון שהיה בו, ומשאיר טיפוגרפיה וקווים.
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
     * מפעם אחת, קיבל את אותו שם שלוש פעמים באותו כרטיס. זה מדויק ברמת
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

  return (
    <div>
      {days.map((day, dayIndex) => (
        <section key={day.dayKey} className={dayIndex ? "mt-8" : ""}>
          {/*
            אותה כותרת קבוצה של השאלות הנפוצות במדריך: מילה בעץ, קו שנמוג,
            וספירה שקטה בקצה. קטנה מהכותרת הראשית כדי שההיררכיה תישמר.
          */}
          <h3 className="mb-3 flex items-center gap-3">
            <span className="wood-text shrink-0 text-[1.15rem] font-black leading-tight tracking-[-.025em]">
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
            {day.entries.map((entry, index) => (
              <div
                key={`${entry.name}-${entry.dropped ? "band" : "step"}`}
                className="py-3"
                style={{
                  borderTop: index === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <p className="font-bold leading-snug">{entry.name}</p>
                {/*
                  שורת ההסבר רק בוויתור על הגומייה. כותרת המקטע כבר אומרת
                  "תרגילים שעלו דרגה", ולכן "עלית דרגה" מתחת לכל שורה היה
                  חוזר על עצמו תשע עשרה פעמים בלי להוסיף דבר.
                */}
                {entry.dropped && (
                  <p className="mt-0.5 text-xs" style={{ color: "var(--dim)" }}>
                    ויתרת על הגומייה
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
