"use client";

import { useEffect } from "react";

/**
 * גרסת ה-service worker כפי שהדף מצפה לה. חייבת להיות זהה ל-VERSION
 * ב-public/sw.js. אי־התאמה גורמת להחלפה כפויה.
 */
// WARNING: Keep this in lockstep with VERSION in public/sw.js; these two must move together.
const SW_VERSION = "fitay-v5";

/**
 * המפתח הציבורי כפי שהגיע מהסביבה, בלי רווחים, גרשיים ותווים נסתרים.
 *
 * הערך נצרב לקוד בזמן הבנייה, ולכן כל לכלוך שהודבק בממשק של וורסל נוסע
 * איתו עד לדפדפן. גרשיים נכנסים כשמישהו מדביק את הערך יחד עם המרכאות.
 */
export function vapidPublicKey() {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "")
    .replace(/^﻿/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

/**
 * ממיר את המפתח הציבורי מ-base64url למערך בייטים.
 * pushManager.subscribe דורש Uint8Array ונכשל על מחרוזת.
 */
export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * בודק שהמפתח הוא מה שהדפדפן דורש, ומחזיר הסבר קונקרטי כשלא.
 *
 * בלי זה הדפדפן זורק "applicationServerKey must contain a valid P-256
 * public key" ואין שום דרך לדעת מה בדיוק הגיע. מפתח ציבורי הוא ציבורי,
 * ולכן מותר להראות ממנו קצה בהודעת השגיאה.
 */
export function describeVapidProblem(key: string): string | null {
  if (!key) return "המפתח הציבורי לא הגיע לדפדפן. הוא חסר בהגדרות, או שהפרויקט לא נבנה מחדש אחרי שהוספת אותו.";

  let bytes: Uint8Array;
  try {
    bytes = urlBase64ToUint8Array(key);
  } catch {
    return `המפתח מכיל תווים לא חוקיים. התקבלו ${key.length} תווים, מתחיל ב-${key.slice(0, 6)}.`;
  }

  // מפתח P-256 לא דחוס הוא 65 בייטים ומתחיל ב-0x04.
  if (bytes.length !== 65 || bytes[0] !== 4) {
    return `זה לא המפתח הציבורי. התקבלו ${key.length} תווים ו-${bytes.length} בייטים, וצריך 87 תווים ו-65 בייטים. מתחיל ב-${key.slice(0, 6)}. כנראה הודבק שם המפתח הפרטי או ערך אחר.`;
  }

  return null;
}

export async function syncPushSubscription(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "לא הצלחנו לסנכרן את ההתראות");
  }
}

/**
 * מבטיח שלמכשיר יש מנוי תקף, כשההרשאה כבר ניתנה.
 *
 * זו הנקודה שבה התראות נשברות בפועל. הדפדפן מבטל מנוי כשה-service worker
 * מוחלף, כשהמכשיר לא היה בשימוש זמן רב, או כשהוא מסובב מפתחות. ההרשאה
 * נשארת granted והמשתמש משוכנע שהוא רשום, אבל השרת שולח לכתובת מתה.
 * לכן בכל טעינה בודקים שהמנוי קיים, ואם לא, נרשמים מחדש ומעדכנים את השרת.
 */
export async function ensurePushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const vapid = vapidPublicKey();
  if (describeVapidProblem(vapid)) return;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }
  await syncPushSubscription(sub);
}

/**
 * מזריק את המניפסט ואת אייקון המסך אחרי שהדף נטען.
 *
 * הם לא יושבים ב-head בכוונה. ספארי באייפון מוריד אותם בחיבור נפרד
 * ומחזיק את טעינת הדף, ובסלולרי חלש זה מרגיש כמו אפליקציה תקועה.
 * מהרגע שהם מוזרקים כאן ההוספה למסך הבית עובדת רגיל.
 */
function injectManifest() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.webmanifest";
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement("link");
    icon.rel = "apple-touch-icon";
    icon.href = "/app-icon/180";
    document.head.appendChild(icon);
  }
}

/**
 * רישום ה-service worker.
 *
 * רץ אחרי window load בכוונה. register פותח חיבור רשת נפרד שלא מופיע
 * ב-Resource Timing, ובסלולרי באייפון הוא יכול לעכב את אירוע ה-load
 * בעשרות שניות. אחרי load הוא כבר לא יכול לעכב כלום.
 */
function registerServiceWorker() {
  void (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();

      // service worker ישן ממשיך לשלוט בדף גם אחרי פריסה חדשה. אם הוא
      // מלפני ההתראות, אין בו מאזין push בכלל וההתראות לא יגיעו לעולם.
      // שואלים אותו לגרסה, ואם היא לא מתאימה מסירים ומתקינים מחדש.
      let needsReset = false;
      const controller = navigator.serviceWorker.controller;
      if (controller) {
        const channel = new MessageChannel();
        const version = await new Promise<string | null>((resolve) => {
          channel.port1.onmessage = (e) => resolve(e.data);
          setTimeout(() => resolve(null), 800);
          controller.postMessage({ type: "GET_VERSION" }, [channel.port2]);
        });
        if (version !== SW_VERSION) needsReset = true;
      }

      if (needsReset) {
        for (const r of regs) await r.unregister();
      }

      await navigator.serviceWorker.register("/sw.js");
      await ensurePushSubscription();
    } catch {
      window.dispatchEvent(
        new CustomEvent("fitay-push-sync-failed", {
          detail: "לא הצלחנו לסנכרן את ההתראות. אפשר לנסות שוב.",
        })
      );
      // דפדפן שחוסם, או גלישה פרטית. האפליקציה עובדת בלי זה.
    }
  })();
}

export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const start = () => {
      injectManifest();
      registerServiceWorker();
    };

    if (document.readyState === "complete") {
      start();
      return;
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
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
