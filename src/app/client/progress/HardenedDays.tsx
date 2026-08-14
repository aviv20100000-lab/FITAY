"use client";

import { useState } from "react";

/**
 * התרגילים שהוקשו, מקובצים לפי תרגיל.
 *
 * שש גרסאות נפסלו כאן. הראשונה עטפה כל יום בכרטיס והציגה את התרגילים
 * כענן תגיות, והיו ביום עמוס תשע עשרה מלבנים זהים בשבע שורות. השנייה
 * הורידה את הכרטיס ואת התגיות והשאירה שורה מלאה לכל שם, וזה החליף בלגן
 * באורך. שתי עמודות נפסלו כי שמות באורכים שונים בלי מסגרת נראו כמילים
 * מפוזרות. אחר כך ירדו הקו הדוהה וגודל הכותרת מכותרות הימים.
 *
 * כל אלה עסקו באיך השורות נראות, ואף אחת מהן לא שאלה לפי מה הן מקובצות.
 * זה היה הכשל: הכותרת מבטיחה "אילו תרגילים עלו דרגה", והקיבוץ לפי יום
 * ענה "מתי". מתאמן עם היסטוריה קיבל את חתירה רחבה פעמיים בשתי קבוצות
 * ואת פרפר פעמיים, כי אותו תרגיל באמת הוקשה ביותר מיום אחד, והמקטע
 * נמתח על שני מסכי טלפון מלאים בעשרים שורות באותו משקל.
 *
 * עכשיו שורה אחת לכל תרגיל. אין כפילויות, האורך הוא מספר התרגילים
 * השונים ולא מספר האירועים, ולכל שורה יש מה לומר: כמה פעמים ומתי
 * לאחרונה. יום שבו הושלמה תוכנית והכל עלה יחד מפסיק לבלוע את המקטע.
 *
 * הסדר הוא לפי מה שקרה לאחרונה, כי זה מה שהמתאמן מחפש כשהוא נכנס.
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

type Exercise = {
  name: string;
  /** כמה ימים שונים התרגיל עלה בהם דרגה. */
  steps: number;
  /** האם ויתר על הגומייה, ולו פעם אחת. */
  droppedBand: boolean;
  /** התאריך האחרון שקרה בו משהו, כפי שהוא מוצג. */
  lastHeading: string;
};

/** כמה תרגילים מוצגים לפני שהשאר נחתכים. */
const VISIBLE = 6;

function groupByExercise(rows: HardeningRow[]): Exercise[] {
  const byName = new Map<string, Exercise>();
  const seenDays = new Map<string, Set<string>>();
  const order: string[] = [];

  // השורות מגיעות ממוינות מהחדש לישן, ולכן סדר ההופעה הוא כבר הסדר הנכון.
  for (const row of rows) {
    let exercise = byName.get(row.name);
    if (!exercise) {
      exercise = {
        name: row.name,
        steps: 0,
        droppedBand: false,
        lastHeading: row.heading,
      };
      byName.set(row.name, exercise);
      seenDays.set(row.name, new Set());
      order.push(row.name);
    }
    if (row.kind === "drop-band") {
      exercise.droppedBand = true;
      continue;
    }
    /*
     * יום אחד נספר פעם אחת.
     *
     * מתאמן שביצע את שני האימונים באותו יום, או שהתרגיל שלו הוקשה יותר
     * מפעם אחת באותו יום, קיבל את אותה עלייה שלוש פעמים. זה מדויק ברמת
     * הנתונים ונקרא כתקלה ברמת המסך.
     */
    const days = seenDays.get(row.name)!;
    if (days.has(row.dayKey)) continue;
    days.add(row.dayKey);
    exercise.steps += 1;
  }

  return order.map((name) => byName.get(name)!);
}

/** "עלה דרגה פעמיים · לאחרונה 14 באוגוסט 2026" */
function describe(exercise: Exercise): string {
  const parts: string[] = [];
  if (exercise.steps === 1) parts.push("עלה דרגה פעם אחת");
  else if (exercise.steps === 2) parts.push("עלה דרגה פעמיים");
  else if (exercise.steps > 2) parts.push(`עלה דרגה ${exercise.steps} פעמים`);
  if (exercise.droppedBand) parts.push("ויתר על הגומייה");
  parts.push(`לאחרונה ${exercise.lastHeading}`);
  return parts.join(" · ");
}

export default function HardenedDays({ rows }: { rows: HardeningRow[] }) {
  const exercises = groupByExercise(rows);
  const [open, setOpen] = useState(false);
  const shown = open ? exercises : exercises.slice(0, VISIBLE);
  const hidden = exercises.length - shown.length;

  return (
    <div>
      {shown.map((exercise, index) => (
        <div
          key={exercise.name}
          className="py-2.5"
          style={{ borderTop: index === 0 ? "none" : "1px solid var(--line)" }}
        >
          <p className="truncate text-sm font-bold leading-snug">
            {exercise.name}
          </p>
          {/*
            שורת המשנה נושאת את מה שקרה. קודם עמד כאן שם בלבד, ואז שורה
            שאומרת רק "עלה דרגה" הייתה חוזרת על כותרת המקטע. עכשיו היא
            אומרת כמה ומתי, וזה מה שכותרת המקטע לא יכולה לומר.
          */}
          <p className="text-[11px] leading-5" style={{ color: "var(--dim)" }}>
            {describe(exercise)}
          </p>
        </div>
      ))}

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
