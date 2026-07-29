"use client";

import { useEffect } from "react";

type Sentinel = { release: () => Promise<void> };
type WakeLockNavigator = {
  wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
};

/**
 * מחזיק את מסך הטלפון דלוק כל עוד active דלוק.
 *
 * בחצר הטלפון מונח על הרצפה בין סטים, והמסך נכבה באמצע האימון —
 * המתאמן מאבד את הטיימר ואת המקום שלו וצריך לפתוח הכל מחדש.
 *
 * דפדפן שלא תומך (אייפון לפני iOS 16.4) פשוט מתעלם, בלי שגיאה.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as unknown as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: Sentinel | null = null;
    let cancelled = false;

    async function acquire() {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const next = await nav.wakeLock!.request("screen");
        if (cancelled) {
          next.release().catch(() => {});
          return;
        }
        sentinel = next;
      } catch {
        // מצב חיסכון בסוללה, או שהדפדפן סירב. האימון ממשיך בלי זה.
      }
    }

    // המערכת משחררת את הנעילה ברגע שעוברים לאפליקציה אחרת,
    // אז צריך לבקש אותה שוב בכל חזרה למסך.
    function onVisibility() {
      if (document.visibilityState === "visible") acquire();
    }

    acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
