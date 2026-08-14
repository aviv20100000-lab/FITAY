import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";
import NavHistory from "@/components/NavHistory";
import DeveloperErrorReporter from "@/components/DeveloperErrorReporter";

/**
 * Heebo יושב בתוך הריפו ולא נמשך מגוגל בזמן בנייה. ב-14 באוגוסט 2026
 * השרתים שלהם החזירו 404 על קובצי הפונט והפילו דיפלוי שהקוד בו היה
 * תקין. הקובץ הוא הפונט המשתנה הרשמי מהמאגר של גוגל, עברית ולטינית
 * יחד, וקובץ אחד מכסה את כל המשקלים שבשימוש.
 */
const heebo = localFont({
  src: "./fonts/heebo-variable.woff2",
  variable: "--font-heebo",
  weight: "100 900",
  display: "swap",
});

/**
 * שים לב למה שחסר כאן: manifest ו-apple-touch-icon.
 *
 * ספארי באייפון מוריד אותם בחיבור נפרד שלא מופיע בכלים למפתחים, וברשת
 * סלולרית חלשה הוא יכול להחזיק את טעינת הדף עשרות שניות. הם מוזרקים
 * אחרי שהדף נטען, מתוך ServiceWorker.tsx, ואז הם לא יכולים לעכב כלום.
 * ההוספה למסך הבית עדיין עובדת, כי עד שמישהו לוחץ עליה הם כבר שם.
 */
/**
 * הכתובת המלאה של האתר.
 *
 * חובה שתהיה מלאה ולא יחסית. וואטסאפ, טלגרם ואיימסג' לא יודעים לפענח
 * כתובת יחסית של תמונת תצוגה, והתוצאה היא קישור בלי תמונה. אם הדומיין
 * משתנה, מגדירים NEXT_PUBLIC_SITE_URL בוורסל.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fitay.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "FITAY",
  description: "אימון בטבעות אולימפיות",
  applicationName: "FITAY",
  appleWebApp: {
    capable: true,
    title: "FITAY",
    statusBarStyle: "black-translucent",
  },
  // התמונה עצמה נוצרת ב-opengraph-image.tsx, ו-Next מחבר אותה לכאן לבד.
  openGraph: {
    type: "website",
    siteName: "FITAY",
    title: "FITAY",
    description: "אימון בטבעות אולימפיות",
    url: "/",
    locale: "he_IL",
  },
  twitter: {
    card: "summary_large_image",
    title: "FITAY",
    description: "אימון בטבעות אולימפיות",
  },
};

/**
 * האזור שממנו האתר מוגש.
 *
 * ברירת המחדל של וורסל היא וושינגטון, והמסד יושב באירלנד. המשמעות היא
 * שכל לחיצה של מתאמן בישראל עשתה את המסלול ישראל, וושינגטון, אירלנד,
 * וושינגטון, ישראל. שתי חציות אוקיינוס לכל בקשה.
 *
 * פרנקפורט קרובה גם לישראל וגם למסד, וחוסכת את שתיהן.
 *
 * ההגדרה הזאת חלה על המסכים. את מסלולי ה-API מזיזים בהגדרות הפרויקט
 * בוורסל, תחת Functions, וכדאי לעשות את שניהם.
 */
export const preferredRegion = "fra1";

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

/**
 * מצב התצוגה נקבע בשרת, מתוך עוגייה.
 *
 * קודם ישב כאן סקריפט שקרא localStorage לפני הציור הראשון. הוא עבד, אבל
 * הוא היה תג script בתוך עץ React ולכן גם המקור לאזהרה ולאי־התאמת
 * הידרציה בכל מסכי המתאמן. ההעברה שלו ל-next/script פתרה את השגיאות
 * ושברה את מה שהוא בא למנוע: שם הקוד רק נדחף לתור של Next ורץ אחרי
 * הציור, כלומר מי שבחר בהיר קיבל הבזק כהה בכל טעינה.
 *
 * עוגייה נשלחת עם הבקשה עצמה, ולכן השרת כבר יודע את התשובה ומצייר את
 * המסמך נכון מלכתחילה. אין סקריפט, אין אזהרה, אין אי־התאמה ואין הבזק.
 * ThemeToggle כותב גם עוגייה וגם localStorage, וממיר את מי שכבר בחר
 * בהיר בטעינה הראשונה אחרי העלייה.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const store = await cookies();
  const theme = store.get("fitay-client-theme")?.value === "light" ? "light" : "dark";

  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} h-full antialiased`}
      data-client-theme={theme}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {children}
        <DeveloperErrorReporter />
        <ServiceWorker />
        {/* סופר ניווטים פנימיים, כדי שכפתור החזרה ידע אם יש לאן לחזור. */}
        <NavHistory />
      </body>
    </html>
  );
}
