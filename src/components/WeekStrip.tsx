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
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => setToday(localDay(new Date())), []);
  useEffect(() => setMarked(new Set(planned)), [planned]);

  // הודעת "נשמר" נעלמת מעצמה, כדי שהמתאמן ידע שהלחיצה הצליחה בלי לחסום אותו.
  useEffect(() => {
    if (!savedToast) return;
    const timer = setTimeout(() => setSavedToast(false), 1800);
    return () => clearTimeout(timer);
  }, [savedToast]);

  if (!today) return null;

  const done = new Set(completedAt.map((iso) => localDay(new Date(iso))));

  // ראשון של השבוע הנוכחי. getDay מחזיר 0 לראשון, ולכן זו חסירה פשוטה.
  const base = new Date(`${today}T00:00:00`);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay());

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return { key: localDay(date), letter: DAY_LETTERS[index] };
  });

  const plannedThisWeek = days.filter((d) => marked.has(d.key)).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass mb-5 block w-full rounded-3xl px-4 py-3.5 text-right transition active:scale-[.99]"
      >
        <span className="mb-3 flex items-center gap-2">
          <span className="shrink-0 text-sm font-extrabold">
            השבוע <span className="wood-text">שלי</span>
          </span>
          <span className="h-px min-w-3 flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="truncate text-xs font-semibold"
              style={{ color: "var(--dim)" }}
            >
              {plannedThisWeek === 0
                ? "עוד לא סימנת"
                : plannedThisWeek === 1
                  ? "סימנת יום אחד"
                  : `סימנת ${plannedThisWeek} ימים`}
            </span>
            {/*
              ההזמנה לפתוח יושבת כאן ולא בשורה נפרדת בתחתית. שורה שלמה
              רק בשביל המשפט הזה עלתה בגובה שדוחף את התוכניות מטה.
            */}
            <span
              className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold"
              style={{
                background: "rgba(180,133,79,.12)",
                border: "1px solid rgba(180,133,79,.4)",
                color: "var(--wood-1)",
              }}
            >
              פתיחת היומן
            </span>
          </span>
        </span>

        {/*
          שורת סמנים, לא שורת תאים.
          קודם כל יום היה תא ממוסגר עם אות ומספר, ושבעה תאים כאלה נקראים
          כשבעה כפתורים: מסגרת סביב פריט קטן היא הסימן המוסכם ללחיצה,
          וקו מקווקו הוא המוסכמה של משבצת ריקה שמזמינה להוסיף. המתאמן היה
          לוחץ על יום ומקבל את היומן במקום סימון. עכשיו אין מסגרות ואין
          מספרי חודש, שהם מה שהופך שורה ללוח שנה, ונשארים רק אות היום
          וסמן המצב שמתחתיה. הסימון עצמו קורה ביומן שנפתח בלחיצה.
        */}
        <span className="flex" aria-hidden="true">
          {days.map((day) => {
            const isDone = done.has(day.key);
            const isPlanned = marked.has(day.key);
            const isToday = day.key === today;

            return (
              <span
                key={day.key}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <span
                  className={`text-[13px] leading-none ${isToday ? "font-black" : "font-bold"}`}
                  style={{ color: isToday ? "var(--wood-1)" : "var(--faint)" }}
                >
                  {day.letter}
                </span>
                {/*
                  טבעת שמתמלאת. תוכנן הוא טבעת ריקה בקו רציף, ובוצע הוא
                  אותה טבעת מלאה. הקו הרציף נקרא כמצב, והמעבר בין השניים
                  הוא בדיוק הצורה של האפליקציה.
                */}
                <span
                  className="grid h-6 w-6 place-items-center rounded-full"
                  style={
                    isToday
                      ? { boxShadow: "0 0 0 3px rgba(224,190,147,.14)" }
                      : undefined
                  }
                >
                  {isDone ? (
                    <span
                      className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-black"
                      style={{
                        background: "var(--wood-2)",
                        color: "var(--accent-contrast)",
                        boxShadow: "0 0 12px rgba(224,190,147,.28)",
                      }}
                    >
                      ✓
                    </span>
                  ) : isPlanned ? (
                    <span
                      className="h-6 w-6 rounded-full"
                      style={{ border: "2px solid rgba(224,190,147,.6)" }}
                    />
                  ) : (
                    // יום רגיל מקבל נקודה זעירה, רק כדי שהשורה תישאר רציפה.
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--line)" }}
                    />
                  )}
                </span>
              </span>
            );
          })}
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
            setSavedToast(true);
          }}
        />
      )}

      {savedToast && (
        <div
          className="fixed inset-x-0 bottom-24 z-[70] flex justify-center"
          role="status"
          aria-live="polite"
        >
          <span
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={{ background: "var(--wood-2)", color: "var(--accent-contrast)" }}
          >
            נשמר
          </span>
        </div>
      )}
    </>
  );
}
