import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

/**
 * Heebo הוא פונט משתנה, ולכן נשלח קובץ אחד לכל שפה בכל מקרה, ורשימת
 * המשקלים כאן לא משנה את הגודל. היא מצומצמת לארבעה רק כדי לשקף מה
 * באמת בשימוש. אין פה חיסכון בבייטים, ולא כדאי לחפש אותו כאן.
 */
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "600", "700", "800"],
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
export const metadata: Metadata = {
  title: "FITAY",
  description: "אימון בטבעות אולימפיות עם איתי סרד",
  appleWebApp: {
    capable: true,
    title: "FITAY",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
