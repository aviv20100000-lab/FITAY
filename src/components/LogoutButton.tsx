"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearOfflineCaches } from "./ServiceWorker";

/**
 * יציאה מהחשבון. שתי נגיעות בכוונה — כפתור בודד בפינה נלחץ בטעות
 * באמצע אימון, והמתאמן לא זוכר את הסיסמה בעל פה.
 * ההתראה מתאפסת לבד אחרי 4 שניות.
 */
export default function LogoutButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  async function click() {
    if (busy) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // גם אם הרשת נפלה — שולחים אותו למסך הכניסה. העוגייה תיבדק שם ממילא.
    }
    // הדפים ששמורים למצב לא־מקוון הם של המשתמש הזה. לא משאירים אותם.
    await clearOfflineCaches();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      aria-label="יציאה מהחשבון"
      /* min-h-11 = 44px, שטח הלחיצה המינימלי שאפל מגדירה. הכפתור הקודם
         היה 26px וחלק מהנגיעות פשוט פספסו אותו.
         active:scale נותן תגובה מיידית, כדי שלא ירגיש שהלחיצה נעלמה. */
      className="flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-transform duration-75 active:scale-95 disabled:opacity-60"
      style={{
        background: confirming
          ? "rgba(229,72,77,.14)"
          : "var(--soft-2)",
        border: confirming
          ? "1px solid rgba(229,72,77,.42)"
          : "1px solid var(--line)",
        color: confirming ? "#ffb4b6" : "var(--dim)",
      }}
    >
      {busy ? "יוצא…" : confirming ? "בטוח? לחץ שוב" : "יציאה"}
    </button>
  );
}
