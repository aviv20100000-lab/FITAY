"use client";

import { useEffect } from "react";

/**
 * רישום ה-service worker. רץ רק בפרודקשן — בפיתוח הוא מתנגש
 * ברענון החם ומגיש קבצים ישנים.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // דפדפן שחוסם, או גלישה פרטית. האפליקציה עובדת בלי זה.
    });
  }, []);

  return null;
}

/**
 * מחיקת המטמון ביציאה מהחשבון. במטמון יושבים דפים מאחורי התחברות,
 * ואסור שהם יישארו במכשיר כשמתאמן אחר נכנס.
 */
export async function clearOfflineCaches() {
  try {
    navigator.serviceWorker?.controller?.postMessage("fitay-clear-caches");
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // לא קריטי מספיק כדי לחסום יציאה מהחשבון.
  }
}
