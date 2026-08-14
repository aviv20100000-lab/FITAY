"use client";

import { useState } from "react";

/**
 * אז והיום: הסט הראשון שנרשם אי פעם מול השיא הנוכחי.
 *
 * זה המקטע היחיד בלשונית שאומר איפה הגוף עומד ולא מה נעשה. מספר האימונים
 * המצטבר גדל גם בשבוע גרוע, ולכן הוא לא חדשות אחרי הפעם השנייה. "התחלת
 * ב-8 והיום 75" הוא הוכחה שאי אפשר לזייף, והוא מתעדכן מעצמו.
 *
 * שלושה כללים שנקבעו אחרי בדיקה על נתונים אמיתיים, ובלעדיהם השורות משקרות:
 *
 * עליית דרגה גוברת על המספר. מתאמן שעלה שתי דרגות מנח ורושם עכשיו פחות
 * חזרות מבעבר התקדם, ולא נסוג. בבדיקה זה קרה בשלושה תרגילים מתוך עשרים
 * וחמישה, ובלי הכלל הזה המסך היה מציג להם "12 ← 11".
 *
 * השיא ולא הסט האחרון. סט אחרון יכול להיות יום גרוע, וסט אחד גרוע היה
 * מוחק חודשיים של עבודה מהמסך.
 *
 * מי שלא זז לא מופיע. שורה שאומרת "10 ← 10" היא רעש, וחמישה תרגילים
 * נפלו לשם בבדיקה.
 *
 * היחידה נאמרת פעם אחת בסוף וחלה על שני המספרים. בלעדיה "התחלת ב-20
 * והיום 30" לא אומר אם מדובר בחזרות או בשניות, ואלה שני דברים שונים.
 */

export type ThenNowRow = {
  name: string;
  /** הערך בסט הראשון שנרשם אי פעם. */
  first: number;
  /** השיא בדרגת הקושי הנוכחית. */
  best: number;
  /** כמה דרגות מנח עלה מאז הסט הראשון. אפס כשלא עלה. */
  stepsUp: number;
  /** חזרות או שניות. */
  unit: "reps" | "seconds";
};

/** כמה תרגילים מוצגים לפני שהשאר נחתכים. */
const VISIBLE = 6;

/** "דרגה" ליחיד, "שתי דרגות" לזוג, ומשם במספר. */
function stepsLabel(count: number): string {
  if (count === 1) return "עלית דרגת מנח";
  if (count === 2) return "עלית שתי דרגות מנח";
  return `עלית ${count} דרגות מנח`;
}

export default function ThenAndNow({ rows }: { rows: ThenNowRow[] }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  const shown = open ? rows : rows.slice(0, VISIBLE);
  const hidden = rows.length - shown.length;

  return (
    <div>
      {shown.map((row, index) => {
        const unit = row.unit === "reps" ? "חזרות" : "שניות";
        return (
          <div
            key={row.name}
            className="py-2.5"
            style={{ borderTop: index === 0 ? "none" : "1px solid var(--line)" }}
          >
            <p className="truncate text-sm font-extrabold leading-snug">{row.name}</p>
            <p className="text-xs leading-5" style={{ color: "var(--dim)" }}>
              {row.stepsUp > 0 ? (
                <>
                  <span className="font-bold" style={{ color: "var(--wood-1)" }}>
                    {stepsLabel(row.stepsUp)}
                  </span>
                  {` · ${row.best} ${unit} בדרגה הנוכחית`}
                </>
              ) : (
                <>
                  {`התחלת ב-${row.first} · היום `}
                  <span className="font-bold" style={{ color: "var(--wood-1)" }}>
                    {row.best} {unit}
                  </span>
                </>
              )}
            </p>
          </div>
        );
      })}

      {(hidden > 0 || open) && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-1.5 min-h-9 text-xs font-bold"
          style={{ color: "var(--wood-1)" }}
        >
          {open ? "הצג פחות" : `ועוד ${hidden}`}
        </button>
      )}
    </div>
  );
}
