"use client";

/**
 * הכניסה ליומן האימונים ממסך הבית.
 *
 * זו דלת, לא תצוגת נתונים. קדמו לה ארבע גרסאות של רצועת שבוע — עיגולים,
 * ריבועים, אותיות עם קו, קו רציף — וכולן נכשלו מאותה סיבה: הן ניסו להציג
 * נתון זעום, כמה אימונים היו השבוע, ושום עיצוב לא מציל בלוק שאין לו מה
 * להגיד. הערך יושב בלוח החודשי שנפתח מכאן, שבו רואים לאורך חודש שלם מה
 * תוכנן ומה בוצע. זו הבקשה של המאמן, וזה מה שמגיע לו מאמץ עיצוב.
 *
 * הסיכום השבועי נשאר, אבל כשורת מצב בקצה הכותרת ולא כגרפיקה.
 *
 * הלוח נפתח כשכבה מעל המסך ולא בתוכו. חודש מלא היה דוחף את השער מתחת
 * לקיפול, וזה הפריט שכל המסך בנוי סביבו.
 */
import { useEffect, useState } from "react";
import TrainingCalendarSheet from "./TrainingCalendarSheet";


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

  return (
    <>
      {/*
        הכותרת עצמה היא הכפתור.

        קודם עמדה כאן כותרת "היומן שלי" ומתחתיה שורה קטנה שפותחת אותו,
        והשורה נבלעה: פריט משנה מתחת לכותרת, דחוס בין שני בלוקים חזקים.
        כשהכותרת היא הפעולה היא מקבלת את אותו משקל של "עכשיו ברמה 2"
        ושל "התוכניות שלי", ומפסיקה להיות פריט.

        גם הסיכום השבועי ירד. הוא ישב בקצה הקו כמו מספר הפריטים בכותרות
        המדריך, אבל שם הוא סופר תוכן שנמצא מתחת לכותרת — וכאן אין תוכן,
        יש דלת. מספר בקצה שלא סופר כלום נקרא כרעש.

        השורה שמתחת אומרת מה יש מאחורי הדלת. פעם עמדה כאן שורה שנבלעה,
        אבל היא אמרה "פתח את היומן", כלומר חזרה על הכותרת שמעליה. זו
        אותה תבנית של כותרת ומשפט אחד מתחתיה שיש לכל מקטע במדריך, ובאותם
        גדלים בדיוק.

        המשפט נוקב בשלושת הדברים שהיומן עושה: מה מסמנים, מה נכנס לבד, ומי
        רואה. בלי זה מתאמן פותח דלת ולא יודע לאן.

        החץ עומד במרכז שתי השורות ולא בשורת הכותרת. כשהוא נשאר למעלה
        והמשפט נפרס מתחתיו על כל הרוחב, הוא מרחף מעל פסקה וקורא כשני
        רכיבים שהודבקו. הכותרת, הקו והמשפט הם גוש אחד, והחץ הוא מה
        שהגוש הזה עושה.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-8 flex w-full items-center gap-3 text-right transition active:opacity-70"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-3">
            <span className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.03em]">
              פתיחת <span className="wood-text">היומן</span>
            </span>
            <span className="h-px min-w-3 flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
          </span>
          <span className="mt-1 block text-sm leading-6 text-[var(--dim)]">
            מסמנים באילו ימים מתאמנים, והימים שכבר בוצעו נכנסים לבד. המאמן
            רואה את היומן.
          </span>
        </span>
        <span
          className="shrink-0 text-2xl leading-none"
          aria-hidden="true"
          style={{ color: "var(--wood-1)" }}
        >
          ←
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
