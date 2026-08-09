"use client";

import { useState } from "react";

/**
 * האימונים האחרונים, כתיעוד שקט בסוף הדף.
 *
 * זה המקטע הכי פחות חשוב בלשונית, ולכן הוא גם הכי קצר. חמישה אימונים
 * גלויים ושאר החמישה עשר מאחורי כפתור: מתאמן ותיק קיבל כאן חמש עשרה
 * שורות כמעט זהות, וקיר הגלילה הזה הוא מה שהפך את חדר הגביעים לדוח.
 *
 * הקיצור מגיע מהסתרה, לא מכיווץ. הריווח בשורות נשאר כמו שהיה.
 */

export type RecentRow = {
  title: string;
  /** התאריך מעוצב בשרת, כדי שהשרת והדפדפן יראו את אותו יום. */
  date: string;
  /** דקות שלמות. null כשהמשך לא נמדד או קצר מדקה. */
  minutes: number | null;
  mood: string | null;
};

const VISIBLE = 5;

export default function RecentWorkouts({ rows }: { rows: RecentRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, VISIBLE);
  const hidden = rows.length - VISIBLE;

  return (
    <>
      <div className="glass rounded-3xl p-2">
        {shown.map((row, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3.5 py-3"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{row.title}</p>
              <p className="text-xs" style={{ color: "var(--dim)" }}>
                {row.date}
                {row.minutes ? ` · ${row.minutes} דק׳` : ""}
              </p>
            </div>
            {row.mood && (
              <span
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  background: "var(--soft-2)",
                  border: "1px solid var(--line)",
                  color: "var(--dim)",
                }}
              >
                {row.mood}
              </span>
            )}
          </div>
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-3 w-full rounded-2xl py-3 text-sm font-bold"
          style={{
            border: "1px solid var(--line)",
            background: "var(--soft-2)",
            color: "var(--wood-1)",
          }}
        >
          {expanded
            ? "הצג פחות"
            : hidden === 1
              ? "הצג עוד אימון אחד"
              : `הצג עוד ${hidden} אימונים`}
        </button>
      )}
    </>
  );
}
