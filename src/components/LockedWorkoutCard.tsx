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
      className="cursor-not-allowed rounded-[1.4rem] p-3.5 opacity-60 transition active:scale-[.99]"
      style={style}
    >
      <div className="flex items-center gap-3">{children}</div>
      <p
        className={`mr-12 mt-1 text-xs transition-all ${showReason ? "font-extrabold" : ""}`}
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
