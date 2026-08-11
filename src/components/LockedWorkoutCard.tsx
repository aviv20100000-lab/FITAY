"use client";

import { useEffect, useState } from "react";

export default function LockedWorkoutCard({
  children,
  reason,
  style,
}: {
  children: React.ReactNode;
  reason: string;
  style: React.CSSProperties;
}) {
  const [showReason, setShowReason] = useState(false);

  useEffect(() => {
    if (!showReason) return;
    const timer = setTimeout(() => setShowReason(false), 1800);
    return () => clearTimeout(timer);
  }, [showReason]);

  function explain() {
    setShowReason(false);
    requestAnimationFrame(() => setShowReason(true));
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled="true"
      onClick={explain}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          explain();
        }
      }}
      /* שורה ולא כרטיס, בדיוק כמו האימונים הפתוחים לצידה. הריפוד והמסגרת
         מגיעים מבחוץ דרך style, כדי ששתי הצורות יישבו על אותו קו. */
      className="cursor-not-allowed px-1 py-4 opacity-55 transition"
      style={style}
    >
      <div className="flex items-center gap-3.5">{children}</div>
      <p
        /* בלי הזחה. היא נועדה ליישר את השורה מתחת לריבוע המספר שהיה
           בתחילת השורה, והריבוע ירד — הזחה שמתיישרת לפי משהו שלא קיים
           נראית כמו טעות. */
        className={`mt-1 text-xs transition-all ${showReason ? "font-extrabold" : ""}`}
        style={{
          color: showReason ? "var(--wood-1)" : "var(--dim)",
          textDecoration: showReason ? "underline" : "none",
          textUnderlineOffset: "0.22rem",
        }}
      >
        {reason}
      </p>
    </div>
  );
}
