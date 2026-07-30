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
        background:
          "linear-gradient(180deg, var(--bg) 72%, rgba(10,10,11,.86) 92%, transparent)",
      }}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 pb-3">
        <Link href={role === "coach" ? "/coach" : "/client"} aria-label="לדף הבית">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fitay.svg" alt="FITAY" className="w-28" />
        </Link>

        <LogoutButton />
      </div>
    </header>
  );
}
