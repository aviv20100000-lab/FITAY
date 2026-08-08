"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: React.ReactNode };

/**
 * סרגל ניווט תחתון. נעלם באמצע אימון: שם המסך צריך את כל תשומת הלב.
 *
 * למתאמן ארבע לשוניות, למאמן חמש. הספרייה נוספה כשהתרגילים והסרטונים
 * אוחדו למסך אחד. קודם מסך התרגילים היה מקושר רק מתוך מסך הסרטונים,
 * כלומר התוכן המקצועי היה מוסתר שתי לחיצות עמוק.
 *
 * "מתחים" היא לשונית של שניהם: המתאמן מחפש איפה לתלות, ואיתי מאשר משם
 * מה שהמתאמנים הוסיפו.
 */
export default function BottomNav({ role }: { role: "coach" | "trainee" }) {
  const pathname = usePathname();
  if (pathname.startsWith("/client/workout")) return null;

  const tabs: Tab[] =
    role === "coach"
      ? [
          { href: "/coach", label: "מתאמנים", icon: <IconPeople /> },
          { href: "/coach/programs", label: "תוכניות", icon: <IconProgram /> },
          { href: "/coach/library", label: "ספרייה", icon: <IconLibrary /> },
          { href: "/spots", label: "מתקנים", icon: <IconBar /> },
          { href: "/method", label: "מדריך", icon: <IconBook /> },
        ]
      : [
          { href: "/client", label: "בית", icon: <IconRings /> },
          /*
            הכתובת נשארה /client/progress בכוונה. המתאמנים כבר שמרו את
            האפליקציה למסך הבית, ושינוי נתיב היה שובר קישורים שמורים
            בשביל מילה שאף אחד לא רואה.
          */
          { href: "/client/progress", label: "הישגים", icon: <IconMedal /> },
          { href: "/spots", label: "מתקנים", icon: <IconBar /> },
          { href: "/method", label: "מדריך", icon: <IconBook /> },
        ];

  return (
    <>
      {/* הסרגל מרחף, אז התוכן צריך מקום לנשום מתחתיו */}
      <div className="h-24" />
      {/*
        הרקע יושב על ה-nav עצמו ולא על החלק הפנימי.
        קודם הריווח מהתחתית של האייפון היה על ה-nav והרקע על החלק הפנימי,
        ולכן מתחת לסרגל נשארה רצועה שקופה בגובה האזור הבטוח, ודרכה נראה
        הדף. זה מה שגרם לסרגל להיראות מרחף באוויר ולא צמוד לתחתית המסך.
        הריווח נשאר, כדי שהלשוניות לא יישבו על פס הבית של האייפון.
      */}
      <nav
        className="under-overlay fixed inset-x-0 bottom-0 z-50"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(22px) saturate(140%)",
          WebkitBackdropFilter: "blur(22px) saturate(140%)",
          borderTop: "1px solid var(--line)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
      <div className="mx-auto flex w-full max-w-md items-stretch">
        {tabs.map((t) => {
          const active =
            t.href === "/coach" || t.href === "/client"
              ? pathname === t.href
              : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              /*
                ברירת המחדל של Next, לא prefetch מלא.
                prefetch מלא היה טוען את כל 4-5 הלשוניות ברקע בכל פתיחת
                מסך, כלומר כמה פניות מקבילות למסד בכל ניווט. בעומס קטן זה
                מה שגרם ל-503 חוזרים על בקשות ה-RSC. ברירת המחדל טוענת רק
                את השלד מראש, והתוכן נטען בזמן הניווט עצמו — מעבר קצת פחות
                מיידי, אבל בלי הפניות המיותרות למסד.
              */
              className="flex flex-1 flex-col items-center gap-1 py-3"
              style={{ color: active ? "var(--wood-1)" : "var(--faint)" }}
            >
              {t.icon}
              <span className="text-xs font-semibold">{t.label}</span>
              <span
                className="h-0.5 w-6 rounded-full"
                style={{ background: active ? "var(--wood-2)" : "transparent" }}
              />
            </Link>
          );
        })}
        </div>
      </nav>
    </>
  );
}

/* אייקונים בקו דק — באותו משקל של הטיפוגרפיה, בלי מילוי. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

/** שתי טבעות על רצועות — אותו סימן כמו בלוגו. */
function IconRings() {
  return (
    <Svg>
      <g {...stroke}>
        <path d="M8 3v6M16 3v6" />
        <circle cx="8" cy="15" r="5" />
        <circle cx="16" cy="15" r="5" />
      </g>
    </Svg>
  );
}

/**
 * מדליה על סרט. החליפה את אייקון הגרף, שהבטיח את קווי המגמה וסכומי
 * החזרות שירדו מהמסך.
 */
function IconMedal() {
  return (
    <Svg>
      <g {...stroke}>
        <path d="M8 2 10.5 8M16 2 13.5 8" />
        <circle cx="12" cy="15" r="6" />
        <path d="m12 12.4 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L9 14.7l2.2-.3z" />
      </g>
    </Svg>
  );
}

function IconBook() {
  return (
    <Svg>
      <g {...stroke}>
        <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
        <path d="M8 8h7M8 12h7" />
      </g>
    </Svg>
  );
}

function IconPeople() {
  return (
    <Svg>
      <g {...stroke}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
        <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.9.7 3 2.6 3 5.2" />
      </g>
    </Svg>
  );
}

/** ספרים על מדף — הספרייה: התרגילים והסרטונים. */
function IconLibrary() {
  return (
    <Svg>
      <g {...stroke}>
        <path d="M4 4h3v14H4zM9 4h3v14H9z" />
        <path d="m15 5 3 13" />
        <path d="M3 20h18" />
      </g>
    </Svg>
  );
}

/**
 * דמות תלויה על מתח. הצורה מהסט המצויר של FITAY (ראה FitayIcon),
 * בגרסת קו אחד כי צבע הסרגל מתחלף בין פעיל לכבוי.
 */
function IconBar() {
  return (
    <Svg>
      <g {...stroke}>
        <path d="M3 4.5h18" />
        <path d="M8.7 4.5 10.9 9.5M15.3 4.5 13.1 9.5" />
        <circle cx="12" cy="11.6" r="1.9" fill="currentColor" stroke="none" />
        <path d="M12 13.7v3.6" />
        <path d="M12 17.3 10 21M12 17.3 14 21" />
      </g>
    </Svg>
  );
}

function IconProgram() {
  return (
    <Svg>
      <g {...stroke}>
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </g>
    </Svg>
  );
}
