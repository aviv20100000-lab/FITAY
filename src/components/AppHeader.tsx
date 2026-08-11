"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";

/**
 * הכותרת של האפליקציה: לוגו ויציאה.
 *
 * יושבת במעטפת ולא בתוך כל מסך, משתי סיבות. הראשונה, היא מופיעה בכל
 * הלשוניות ולא רק בשתי מסכי הבית. השנייה, מעטפת לא נטענת מחדש במעבר בין
 * לשוניות, ולכן הלוגו והיציאה נשארים על המסך בזמן שהמסך הבא נבנה, במקום
 * להיעלם ולחזור.
 *
 * safe-top כאן ולא במסכים: הכותרת היא הדבר העליון, והיא זו שצריכה
 * להתרחק משורת הסטטוס של האייפון.
 */
export default function AppHeader({
  role,
  greeting,
  name,
}: {
  role: "coach" | "trainee";
  /**
   * הברכה מחושבת בשרת ומועברת כמחרוזת, ולא נגזרת מהשעון של הדפדפן.
   * חישוב כאן היה יכול לתת "בוקר טוב" בשרת ו"ערב טוב" בלקוח ולשבור
   * את ההרכבה.
   */
  greeting?: string;
  name?: string;
}) {
  const pathname = usePathname();

  // באמצע אימון המסך צריך את כל תשומת הלב, בדיוק כמו שסרגל הניווט נעלם.
  if (pathname.startsWith("/client/workout")) return null;

  return (
    <header
      className="sticky top-0 z-40 safe-top"
      style={{
        // הרקע חייב להיות אטום, אחרת התוכן נראה עובר מתחת ללוגו בגלילה.
        background: "var(--header-bg)",
      }}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 pb-3">
        <Link href={role === "coach" ? "/coach" : "/client"} aria-label="לדף הבית">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fitay.svg" alt="FITAY" className="w-28" />
        </Link>

        {role === "coach" ? (
          <div className="flex items-center gap-2">
            <LogoutButton />
          </div>
        ) : (
          <Link
            href="/client/settings"
            aria-label="הגדרות ופרופיל"
            className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-1)", color: "var(--dim)" }}
          >
            הגדרות
          </Link>
        )}
      </div>

      {/*
        הברכה היא מסגרת של האפליקציה, לא תוכן של הדף.

        קודם היא ישבה בתוך המסך, ולכן היא התחרתה על אותו מקום עם הכותרת
        הראשונה שלו — וכל גודל שנתתי לה יצא או קטן מדי או גדול מדי. כאן
        היא לא נוגעת בהיררכיה של התוכן בכלל, והדף מתחיל ישר בכותרת שלו.

        הקו מתחתיה סוגר את אזור האפליקציה: מעליו הלוגו והברכה, מתחתיו
        המסך. בלעדיו הברכה נראית כמו השורה הראשונה של התוכן.
      */}
      {role === "trainee" && greeting && name && (
        <div
          className="mx-auto w-full max-w-md px-5 pb-2.5"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <p className="text-xs font-bold" style={{ color: "var(--faint)" }}>
            {greeting}, <span className="wood-text">{name}</span>
          </p>
        </div>
      )}
    </header>
  );
}

