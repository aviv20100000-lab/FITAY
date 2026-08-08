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

const WOOD = "#b4854f";
const GOLD = "#e0be93";

export type FitayIconName = "ring" | "bar" | "band" | "timer";

const ICONS: Record<FitayIconName, React.ReactNode> = {
  ring: (
    <>
      <path
        d="M16 1.5 L16 12.5"
        stroke={WOOD}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="21" r="8.5" stroke={GOLD} strokeWidth="2.7" fill="none" />
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
