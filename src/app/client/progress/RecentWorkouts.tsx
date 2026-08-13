"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * האימונים האחרונים, כתיעוד שקט בסוף הדף.
 *
 * זה המקטע הכי פחות חשוב בלשונית, ולכן הוא גם הכי קצר. חמישה אימונים
 * גלויים ושאר החמישה עשר מאחורי כפתור: מתאמן ותיק קיבל כאן חמש עשרה
 * שורות כמעט זהות, וקיר הגלילה הזה הוא מה שהפך את חדר הגביעים לדוח.
 *
 * הקיצור מגיע מהסתרה, לא מכיווץ. הריווח בשורות נשאר כמו שהיה.
 *
 * אימון שהושלם נפתח למסך פירוט עם כל הסטים, כמו שיש למאמן. אימון שלא
 * הסתיים נשאר שורה מתה: אין לו completion ואין לו סטים שמורים.
 */

export type RecentRow = {
  id: string;
  kind: "completed" | "abandoned";
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
      {/*
        בלי כרטיס, כמו הלוח והתרגילים שעלו דרגה. שלושת מקטעי התיעוד
        חולקים שפה אחת: כותרת שקטה, ואז שורות על הדף עם קו מפריד דק.
      */}
      <div>
        {shown.map((row, i) => {
          const body = (
            <>
            <div className="min-w-0 flex-1">
              <p
                className="truncate font-semibold"
                style={{ color: row.kind === "abandoned" ? "var(--dim)" : undefined }}
              >
                {row.title}
              </p>
              <p
                className="text-xs"
                style={{ color: row.kind === "abandoned" ? "var(--faint)" : "var(--dim)" }}
              >
                {row.date}
                {row.minutes ? ` · ${row.minutes} דק׳` : ""}
              </p>
            </div>
            {row.kind === "completed" && row.mood && (
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
            </>
          );

          const style = { borderTop: i === 0 ? "none" : "1px solid var(--line)" };

          if (row.kind !== "completed") {
            return (
              <div
                key={`${row.kind}-${row.id}`}
                className="flex items-center gap-3 py-3"
                style={style}
              >
                {body}
              </div>
            );
          }

          return (
            <Link
              key={`${row.kind}-${row.id}`}
              href={`/client/progress/${row.id}`}
              className="flex items-center gap-3 py-3 transition active:scale-[.995]"
              style={style}
            >
              {body}
              <span
                className="shrink-0 text-sm"
                style={{ color: "var(--wood-1)" }}
                aria-hidden="true"
              >
                ←
              </span>
            </Link>
          );
        })}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 min-h-9 text-xs font-bold"
          style={{ color: "var(--wood-1)" }}
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
