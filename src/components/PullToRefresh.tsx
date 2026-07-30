"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition, type TouchEvent } from "react";

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
          transform: `translateY(${offset}px)`,
          transition: startY.current ? "none" : "transform .25s",
        }}
      >
        {children}
      </div>

      {/* קורא מסך לא רואה חץ שמסתובב, ולכן הוא מקבל הודעה בטקסט. */}
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? "מרענן" : ""}
      </span>
    </div>
  );
}
