/**
 * סט האייקונים המצויר של FITAY, בשפה הדו-גונית של המותג: האלמנט המשני
 * בחום העץ הכהה והאלמנט הראשי בזהב הבהיר, אותם שני גוונים של הכותרות.
 *
 * הצורות נסגרו מול אביב בסדנה חיה מול צילומים של הציוד האמיתי של איתי
 * (8 באוגוסט 2026): הטבעת לפי הרצועה האנכית מהחצר, המתח לפי הקונבנציה
 * של דמות תלויה, הגומייה כלולאה מפותלת באלכסון, והטיימר כסטופר.
 *
 * הצבעים קבועים בכוונה ולא currentColor: זה סימן מותג, לא אייקון ממשק.
 * לאייקוני ממשק חד-צבעוניים (כמו הסרגל התחתון) מציירים גרסת קו נפרדת.
 */

const WOOD = "var(--wood-2)";
const GOLD = "var(--wood-1)";

export type FitayIconName =
  | "ring"
  | "bar"
  | "band"
  | "timer"
  | "voice"
  | "voiceOff"
  | "edit"
  | "play";

const ICONS: Record<FitayIconName, React.ReactNode> = {
  /*
   * שתי רצועות. אביב החליף כאן את הרצועה הבודדת שנסגרה בסדנה של
   * 8 באוגוסט (11 באוגוסט 2026): קו אנכי אחד מעל עיגול נקרא כסוכרייה
   * על מקל ולא כטבעת תלויה.
   *
   * הרצועות מתכנסות מעט כלפי מטה ונכנסות אל תוך הטבעת. הטבעת מצוירת
   * אחרונה ומכסה את קצותיהן, כך שהן נראות עוברות מאחוריה. הקו שלה עבה
   * מהרצועות, כדי שתיקרא כחפץ ולא כמתאר.
   */
  /*
   * הפעלה, בשפת הסט הזה: משולש בתוך טבעת.
   *
   * הסימן האוניברסלי לווידאו הוא משולש, ובלעדיו תמונה מקדימה נראית
   * כתמונה ולא כסרטון. אבל משולש יחף הוא אייקון של כל אפליקציה, ולכן
   * הוא יושב כאן בתוך טבעת — הצורה שהאפליקציה הזאת בנויה עליה.
   */
  play: (
    <>
      <circle cx="16" cy="16" r="11.5" stroke={WOOD} strokeWidth="2.4" fill="none" />
      <path
        d="M13.4 11.6 L21.4 16 L13.4 20.4 Z"
        fill={GOLD}
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </>
  ),

  ring: (
    <>
      <path
        d="M11.8 2 L13.4 14.8"
        stroke={WOOD}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20.2 2 L18.6 14.8"
        stroke={WOOD}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="21.6" r="7.6" stroke={GOLD} strokeWidth="3.2" fill="none" />
    </>
  ),
  bar: (
    <>
      <path d="M4 5.5 L28 5.5" stroke={WOOD} strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M11.5 5.5 L14.4 12.2 M20.5 5.5 L17.6 12.2"
        stroke={GOLD}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="16" cy="15" r="2.6" fill={GOLD} />
      <path d="M16 17.8 L16 22.5" stroke={GOLD} strokeWidth="2.1" strokeLinecap="round" />
      <path
        d="M16 22.5 L13.4 27.5 M16 22.5 L18.6 27.5"
        stroke={GOLD}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </>
  ),
  band: (
    <g transform="rotate(45 16 16)">
      <path
        d="M16 16 C11.5 13.5 10.5 7.5 13 4.8 C14.7 3 17.3 3 19 4.8 C21.5 7.5 20.5 13.5 16 16 Z"
        stroke={GOLD}
        strokeWidth="2.3"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M16 16 C11.5 18.5 10.5 24.5 13 27.2 C14.7 29 17.3 29 19 27.2 C21.5 24.5 20.5 18.5 16 16 Z"
        stroke={WOOD}
        strokeWidth="2.1"
        fill="none"
        strokeLinejoin="round"
      />
    </g>
  ),
  timer: (
    <>
      <circle cx="16" cy="18" r="10.5" stroke={GOLD} strokeWidth="2.4" fill="none" />
      <path d="M13 3 L19 3" stroke={WOOD} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 3 L16 7.5" stroke={WOOD} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 18 L21 13.5" stroke={WOOD} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  voice: (
    <>
      <path
        d="M5.5 13 L10.5 13 L16.5 8.5 L16.5 23.5 L10.5 19 L5.5 19 Z"
        stroke={WOOD}
        strokeWidth="2.2"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M21 12.5 C22.8 14.4 22.8 17.6 21 19.5 M24.5 9.5 C28.2 13.1 28.2 18.9 24.5 22.5"
        stroke={GOLD}
        strokeWidth="2.1"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  voiceOff: (
    <>
      <path
        d="M5.5 13 L10.5 13 L16.5 8.5 L16.5 23.5 L10.5 19 L5.5 19 Z"
        stroke={WOOD}
        strokeWidth="2.2"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M20 12 L27 20 M27 12 L20 20"
        stroke={GOLD}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </>
  ),
  edit: (
    <>
      <path
        d="M7 25 L9.2 18.8 L21.3 6.7 C22.5 5.5 24.4 5.5 25.6 6.7 C26.8 7.9 26.8 9.8 25.6 11 L13.5 23.1 Z"
        stroke={WOOD}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.2 8.8 L23.5 13.1 M7 25 L12.1 23.6"
        stroke={GOLD}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </>
  ),
};

export default function FitayIcon({
  name,
  size = 24,
  label,
}: {
  name: FitayIconName;
  size?: number;
  /** תיאור לקורא מסך. בלעדיו האייקון דקורטיבי ומוסתר. */
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {ICONS[name]}
    </svg>
  );
}
