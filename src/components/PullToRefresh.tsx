"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type TouchEvent,
} from "react";

/**
 * useLayoutEffect מתריע כשהוא רץ בשרת, והרכיב הזה נבנה גם שם לפני שהוא
 * מגיע לדפדפן. בשרת אין פריסה למדוד ואין מה לעשות לפני הציור, ולכן שם
 * הוא מתחלף ב-useEffect שאין לו על מה להתלונן.
 */
const useLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * משיכה למטה לרענון.
 *
 * המסכים של FITAY הם server components, ולכן אין כאן פונקציית טעינה
 * לקרוא לה. הרענון עובר דרך router.refresh, שמבקש מהשרת לבנות את המסך
 * מחדש. זו גם הדרך היחידה לעקוף את staleTimes שמוגדר ב-next.config,
 * שבלעדיו חזרה למסך מציגה עותק שמור עד חמש דקות.
 *
 * useTransition נותן לנו לדעת מתי הרענון באמת נגמר. בלעדיו היינו צריכים
 * לנחש זמן קבוע ולהציג סימן טעינה שמשקר.
 *
 * בלי framer-motion. הסיבוב והמיקום נעשים ב-transform, וזה גם מה שהדפדפן
 * הכי טוב בו.
 */

/** כמה צריך למשוך כדי שהרענון יופעל. */
const THRESHOLD = 80;

/**
 * התנגדות. האצבע זזה יותר מהמסך, וזה מה שנותן את התחושה שמושכים משהו
 * ולא גוררים אותו. בלי זה המסך רץ אחרי האצבע ומרגיש שבור.
 */
const RESISTANCE = 0.5;

/** תקרה, כדי שמשיכה ארוכה לא תעיף את התוכן אל מחוץ למסך. */
const MAX_PULL = 110;

/**
 * המסכים שבהם המשיכה חסומה. בכל השאר היא פעילה.
 *
 * רשימת חסימה ולא רשימת היתר, כי מסך חדש צריך לקבל את זה כברירת מחדל.
 * ברשימת היתר כל מסך שנוסף היה נשכח בשקט.
 *
 * המשותף לשלושה: יש בהם קלט שעדיין לא נשמר לשרת. במסך האימון אלה סטים
 * שהמתאמן הרגע ביצע, ובשניים האחרים טופס פתוח של המאמן. רענון באמצע
 * היה מוחק אותם.
 */
const BLOCKED_PATHS = [
  "/client/workout/",
  "/coach/programs/",
  "/coach/trainees/new",
];

export default function PullToRefresh({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const [pending, startTransition] = useTransition();
  const startY = useRef(0);
  const active = !BLOCKED_PATHS.some((blocked) => pathname.startsWith(blocked));

  /**
   * האם ה-transform על עטיפת התוכן חי ברגע זה.
   *
   * זה הלב של התיקון. אלמנט עם transform כלשהו הופך לנקודת הייחוס של כל
   * צאצא שמוגדר position: fixed, וגם translateY(0px) נחשב transform. כל עוד
   * הערך היה כתוב כאן תמיד, כל fixed בתוך המסכים של המתאמן נמדד מול העטיפה
   * הזאת, שגובהה כגובה העמוד כולו, במקום מול חלון הדפדפן. היומן החודשי נחת
   * בתחתית העמוד והמתאמן היה צריך לגלול אליו, וסרגל הפעולה במסך האימון
   * הפסיק להיצמד לתחתית המסך.
   *
   * עכשיו ה-transform קיים רק בזמן המשיכה ובזמן שהתוכן חוזר למקומו, ובמנוחה
   * הוא מוסר. ההשהיה למטה חייבת להיות ארוכה לפחות כמו המעבר, אחרת ההסרה
   * קוטעת את החזרה באמצע.
   */
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setSettling(true);
    settleTimer.current = setTimeout(() => setSettling(false), 300);
  }, []);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  /**
   * אישור קצר בסיום.
   *
   * רענון שלא שינה כלום נראה בדיוק כמו מסך שלא קרה בו כלום, ואז אי אפשר
   * לדעת אם המשיכה בכלל עשתה משהו. השורה הזאת היא ההוכחה שהנתונים נמשכו
   * מחדש, גם כשהם יצאו זהים.
   */
  const [confirmed, setConfirmed] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setConfirmed(true);
      const timer = setTimeout(() => setConfirmed(false), 1600);
      wasPending.current = pending;
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending]);

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!active || pending) return;
    // רק כשבאמת בראש המסך. אחרת כל גלילה למעלה הייתה מפעילה רענון.
    if (window.scrollY > 0) {
      startY.current = 0;
      return;
    }
    startY.current = event.touches[0].clientY;
    setPull(0);
  }

  function onTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!active || pending || startY.current === 0) return;
    const distance = event.touches[0].clientY - startY.current;
    if (distance <= 0 || window.scrollY > 0) {
      setPull(0);
      return;
    }
    setPull(Math.min(distance * RESISTANCE, MAX_PULL));
  }

  function onTouchEnd() {
    if (!active) return;
    if (pull >= THRESHOLD && !pending) {
      // רטט קצר. בטלפונים שלא תומכים זה פשוט לא קורה.
      try {
        navigator.vibrate?.(15);
      } catch {}
      startTransition(() => router.refresh());
    }
    startY.current = 0;
    setPull(0);
  }

  const ready = pull >= THRESHOLD;
  const offset = pending ? 56 : pull;
  const visible = offset > 0;

  /*
   * useLayoutEffect ולא useEffect. ההסרה של ה-transform צריכה להיקבע לפני
   * הציור, אחרת בפריים שבו המרחק חוזר לאפס התוכן קופץ למקומו במקום לחזור
   * אליו. שני המקרים נתפסים כאן, שחרור האצבע וסיום הרענון, ולכן אין צורך
   * לזכור לקרוא לזה משני מקומות נפרדים.
   */
  const previousOffset = useRef(0);
  useLayout(() => {
    if (previousOffset.current > 0 && offset === 0) settle();
    previousOffset.current = offset;
  }, [offset, settle]);

  const lifted = visible || settling;

  return (
    <div
      className="relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/*
        absolute ולא fixed. הכותרת של FITAY היא sticky top-0 z-40, ועיגול
        שנצמד לראש החלון נחת מתחתיה ובתוך אזור הנאץ' של האייפון. כאן הוא
        יושב בתוך המעטפת, כלומר בדיוק ברווח שנפתח מתחת לכותרת.
      */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center overflow-hidden"
        style={{
          height: offset,
          opacity: visible ? 1 : 0,
          // אין מעבר בזמן שהאצבע על המסך. הסימן חייב להיצמד לאצבע,
          // ורק בשחרור הוא חוזר עם אנימציה.
          transition: startY.current ? "none" : "height .25s, opacity .25s",
        }}
      >
        <span
          className="mt-2 grid h-10 w-10 shrink-0 place-items-center self-start rounded-full border text-lg font-black shadow-lg"
          style={{
            borderColor: ready || pending ? "var(--wood-1)" : "var(--line)",
            background: "var(--panel)",
            color: ready || pending ? "var(--wood-1)" : "var(--dim)",
            transform: `rotate(${pending ? 0 : (pull / THRESHOLD) * 180}deg)`,
            transition: startY.current ? "none" : "transform .25s, color .2s, border-color .2s",
          }}
          aria-hidden="true"
        >
          <span className={pending ? "ptr-spin" : undefined}>
            {pending ? "↻" : "↓"}
          </span>
        </span>
      </div>

      <div
        style={{
          // במנוחה אין כאן transform בכלל. ראה את ההסבר ליד settling.
          transform: lifted ? `translateY(${offset}px)` : undefined,
          transition: startY.current ? "none" : "transform .25s",
        }}
      >
        {children}
      </div>

      {/*
        האישור. יושב מעל הסרגל התחתון, נעלם לבד, ולא תופס מקום בפריסה
        כדי שלא יזיז שום דבר כשהוא מופיע.
      */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center"
        style={{
          opacity: confirmed ? 1 : 0,
          transform: `translateY(${confirmed ? 0 : 8}px)`,
          transition: "opacity .25s, transform .25s",
        }}
        aria-hidden="true"
      >
        <span
          className="rounded-full border px-4 py-2 text-xs font-extrabold shadow-lg"
          style={{
            borderColor: "var(--line)",
            background: "var(--panel)",
            color: "var(--wood-1)",
          }}
        >
          המסך עודכן
        </span>
      </div>

      {/* קורא מסך לא רואה חץ שמסתובב, ולכן הוא מקבל הודעה בטקסט. */}
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? "מרענן" : confirmed ? "המסך עודכן" : ""}
      </span>
    </div>
  );
}
