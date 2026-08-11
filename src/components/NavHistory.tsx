"use client";

/**
 * האם יש לאן לחזור בתוך האפליקציה.
 *
 * הבעיה: `window.history.length` לא אומר כלום. לשונית חדשה נפתחת עם
 * about:blank בהיסטוריה, ולכן כניסה ישירה לכתובת נותנת אורך 2 — נראה
 * בדיוק כמו מסך שהגיעו אליו מתוך האפליקציה. כפתור חזרה שסמך על זה שלח
 * מתאמן שנכנס מהתראה אל about:blank.
 *
 * מה שכן אמין: לספור ניווטים בתוך האפליקציה. הרכיב יושב במעטפת הראשית
 * ומגדיל מונה בכל החלפת נתיב. אם המונה אפס, המסך הנוכחי הוא זה שנטען
 * ישירות ואין לאן לחזור.
 *
 * המונה במודול ולא ב-state בכוונה: הוא צריך לשרוד מעברי מסך, וכל מסך
 * שמרכיב אותו מחדש היה מאפס אותו.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";

let internalNavigations = 0;
let sawFirstRender = false;

export function canGoBack() {
  return internalNavigations > 0;
}

export default function NavHistory() {
  const pathname = usePathname();

  useEffect(() => {
    // ההרצה הראשונה היא הטעינה עצמה ולא ניווט, ולכן היא לא נספרת.
    if (!sawFirstRender) {
      sawFirstRender = true;
      return;
    }
    internalNavigations += 1;
  }, [pathname]);

  return null;
}
