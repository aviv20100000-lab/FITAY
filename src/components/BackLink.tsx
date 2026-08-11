"use client";

/**
 * כפתור חזרה שמחזיר למקום שממנו יצאת, ולא לראש הדף.
 *
 * קודם זה היה Link רגיל. Link הוא ניווט קדימה, וניווט קדימה ב-Next תמיד
 * מתחיל בראש הדף — כלומר מתאמן שגלל עד כרטיס התוכנית, נכנס לאימון ויצא,
 * חזר לראש המסך וצריך לגלול שוב. חזרה אמיתית של הדפדפן משחזרת את מיקום
 * הגלילה לבד.
 *
 * ה-href נשאר כרשת ביטחון: מי שהגיע ישירות מהתראה או מקישור חיצוני אין
 * לו להיכן לחזור, ואז עוברים ליעד המפורש במקום להישאר תקועים.
 */
import { useRouter } from "next/navigation";
import { canGoBack } from "./NavHistory";

export default function BackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  function go() {
    /*
      לא לפי history.length. לשונית חדשה נפתחת עם about:blank בהיסטוריה,
      ולכן כניסה ישירה לכתובת נותנת אורך 2 ונראית כמו ניווט פנימי —
      וזה שלח מתאמן שנכנס מהתראה אל about:blank במקום למסך הבית.
      canGoBack סופר ניווטים בתוך האפליקציה, וזה הדבר היחיד שאמין.
    */
    if (canGoBack()) {
      router.back();
      return;
    }
    router.push(href);
  }

  return (
    <button
      type="button"
      onClick={go}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition active:scale-[.98] ${className}`}
      style={{
        color: "var(--text)",
        background: "var(--surface-2)",
        border: "1px solid rgba(224,190,147,.2)",
        boxShadow: "inset 0 1px 0 var(--glass-inset-top)",
      }}
    >
      <span aria-hidden="true" className="text-lg leading-none wood-text">
        →
      </span>
      <span>{children}</span>
    </button>
  );
}
