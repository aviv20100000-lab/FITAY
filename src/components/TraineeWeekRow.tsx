"use client";

/**
 * שורת השבוע בכרטיס המתאמן, בצד של המאמן.
 *
 * מציגה מה המתאמן סימן לעצמו ברצועת השבוע, ואם הוא מתאמן היום. קריאה
 * בלבד: איתי רואה ולא משנה, כי הסימון שייך למתאמן.
 *
 * החישוב נעשה כאן ולא בשרת, מאותה סיבה שברצועה עצמה. השרת יושב באזור זמן
 * אחר, ובלילה שבין שבת לראשון הוא היה מחשב שבוע אחר ממה שאיתי רואה בשעון.
 */
import { useEffect, useState } from "react";

const DAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function localDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function TraineeWeekRow({
  planned,
  completedAt,
}: {
  planned: string[];
  completedAt: string[];
}) {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localDay(new Date())), []);

  // עד שהיום נקבע אין מה לצייר, אחרת השורה מהבהבת ליום שגוי.
  if (!today) return null;

  const marked = new Set(planned);
  const done = new Set(completedAt.map((iso) => localDay(new Date(iso))));

  const base = new Date(`${today}T00:00:00`);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay());

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return { key: localDay(date), letter: DAY_LETTERS[index] };
  });

  const plannedCount = days.filter((d) => marked.has(d.key)).length;
  const trainedToday = done.has(today);
  const plansToday = marked.has(today);

  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex gap-0.5" aria-hidden="true">
        {days.map((day) => {
          const isDone = done.has(day.key);
          const isPlanned = marked.has(day.key);
          const isToday = day.key === today;
          return (
            <span
              key={day.key}
              className="grid h-4 w-4 place-items-center rounded text-[9px] font-black"
              style={{
                // אותה שפה של הרצועה אצל המתאמן: מילוי הוא עובדה, מסגרת
                // מקווקוות היא כוונה.
                background: isDone ? "rgba(180,133,79,.22)" : "transparent",
                border: isDone
                  ? "1px solid rgba(224,190,147,.32)"
                  : isPlanned
                    ? "1px dashed rgba(224,190,147,.45)"
                    : "1px solid transparent",
                color: isDone || isPlanned ? "var(--wood-1)" : "var(--faint)",
                textDecoration: isToday ? "underline" : "none",
              }}
            >
              {day.letter}
            </span>
          );
        })}
      </div>

      <span className="text-[11px] font-bold" style={{ color: "var(--dim)" }}>
        {/*
          מה שאיתי באמת שואל כשהוא מסתכל על השורה הוא מה קורה היום. שאר
          השבוע הוא רקע, ולכן הוא באותיות והתשובה הזאת במילים.
        */}
        {trainedToday
          ? "התאמן היום"
          : plansToday
            ? "מתאמן היום"
            : plannedCount === 0
              ? "לא סימן ימים השבוע"
              : plannedCount === 1
                ? "סימן יום אחד השבוע"
                : `סימן ${plannedCount} ימים השבוע`}
      </span>
    </div>
  );
}
