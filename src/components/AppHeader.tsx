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
export default function AppHeader({ role }: { role: "coach" | "trainee" }) {
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
            className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold"
            style={{ background: "var(--soft-2)", border: "1px solid var(--line)", color: "var(--dim)" }}
          >
            <SettingsIcon />
            הגדרות
          </Link>
        )}
      </div>
    </header>
  );
}

function SettingsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
