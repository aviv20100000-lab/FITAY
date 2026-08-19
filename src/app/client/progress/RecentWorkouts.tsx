"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * האימונים האחרונים, כתיעוד שקט בסוף הדף.
 *
 * זה המקטע הכי פחות חשוב בלשונית, ולכן הוא גם הכי קצר. חמישה אימונים
 * גלויים ושאר החמישה עשר מאחורי כפתור: מתאמן ותיק קיבל כאן חמש עשרה
 * שורות כמעט זהות, וקיר הגלילה הזה הוא מה שהפך את חדר הגביעים לדוח.
 *
 * הקיצור מגיע מהסתרה, לא מכיווץ. הריווח בשורות נשאר כמו שהיה.
 *
 * אימון שהושלם נפתח למסך פירוט עם כל הסטים, כמו שיש למאמן.
 *
 * אימון שלא הסתיים נשאר שורה שלא נלחצת, ומוסיף מתחתיו שורה שאומרת איפה
 * המתאמן עצר. אביב ביקש את זה במפורש ב-19 באוגוסט 2026: לא לחזור
 * לאימון, רק לדעת.
 *
 * מאיפה מגיע המידע: לאימון שנקטע אין completion ואין סטים שמורים בשרת,
 * כי הסטים נכתבים למסד רק בסיום. המצב היחיד שקיים הוא זה ששמור בדפדפן
 * תחת fitay-workout-<id>, ומשם נקראים מספר התרגיל והסט. מהשרת מגיע רק
 * כמה תרגילים יש באימון.
 *
 * המגבלה שנובעת מזה: השורה יודעת לומר איפה עצרת רק במכשיר ובדפדפן שבהם
 * התאמנת. במכשיר אחר אין מה לקרוא, ואז לא מוצג כלום נוסף.
 */

export type RecentRow = {
  id: string;
  kind: "completed" | "abandoned";
  /** מזהה האימון, לשורה שנקטעה. בשורה שהושלמה אין בו צורך. */
  workoutId: string | null;
  /** כמה תרגילים יש באימון שנקטע, בשביל "תרגיל 4 מתוך 8". */
  items: number;
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
              {/*
                שם של אימון שהושלם נצבע בגוון החם של האפליקציה, וזה
                הסימן שאפשר לפתוח אותו. קודם ישב שם חץ יוניקוד בקצה
                השורה, תו מקלדת בתפקיד אייקון, בדיוק הדפוס שירד ממסך
                האימון. אימון שלא הסתיים נשאר עמום, כי אין לו מה לפתוח.
              */}
              <p
                className="truncate font-semibold"
                style={{
                  color:
                    row.kind === "abandoned" ? "var(--dim)" : "var(--wood-1)",
                }}
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
            </>
          );

          const style = { borderTop: i === 0 ? "none" : "1px solid var(--line)" };

          if (row.kind !== "completed") {
            return (
              <div key={`${row.kind}-${row.id}`} style={style}>
                <div className="flex items-center gap-3 py-3">{body}</div>
                <StoppedAt workoutId={row.workoutId} items={row.items} />
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
          {expanded ? "הצג פחות" : "הצג עוד"}
        </button>
      )}
    </>
  );
}

/**
 * "הפסקת בתרגיל 4 מתוך 8, סט 2".
 *
 * נקרא מהדפדפן ולא מהשרת, כי שם המידע נמצא. מסך האימון שומר את מצבו
 * תחת fitay-workout-<id> אחרי כל סט, וזה הרישום היחיד שקיים לאימון
 * שנקטע.
 *
 * הקריאה יושבת ב-useEffect ולא ברינדור: השרת אינו רואה localStorage,
 * וקריאה ישירה הייתה מייצרת פער בין מה שהשרת שלח למה שהדפדפן צייר.
 *
 * כשאין מה לקרוא לא מוצג כלום. זה קורה במכשיר אחר מזה שהתאמנו בו,
 * ושורה שאומרת "אין מידע" רק מוסיפה רעש למסך שהוא ממילא תיעוד.
 */
function StoppedAt({
  workoutId,
  items,
}: {
  workoutId: string | null;
  items: number;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!workoutId) return;
    try {
      const raw = window.localStorage.getItem(`fitay-workout-${workoutId}`);
      if (!raw) return;
      const state = JSON.parse(raw) as {
        index?: number;
        set?: number;
        stage?: string;
      };
      // index נשמר מאפס, והמתאמן סופר מאחד.
      const exercise = Number(state.index ?? 0) + 1;
      const set = Number(state.set ?? 0);
      if (state.stage !== "work") return;

      const where = items > 0 ? `תרגיל ${exercise} מתוך ${items}` : `תרגיל ${exercise}`;
      setText(set > 0 ? `הפסקת ב${where}, סט ${set}` : `הפסקת ב${where}`);
    } catch {
      // מצב שמור פגום אינו סיבה להפיל שורה בתיעוד.
    }
  }, [workoutId, items]);

  if (!text) return null;

  return (
    <p className="pb-3 text-xs" style={{ color: "var(--faint)" }}>
      {text}
    </p>
  );
}
