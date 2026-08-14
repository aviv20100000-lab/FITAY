"use client";

import { useState } from "react";

/**
 * מחליף בין שני חלקים של אותו מסך.
 *
 * הילדים מגיעים מוכנים מהשרת ושניהם נמצאים ב-DOM מהרגע הראשון, ולכן
 * המעבר מיידי ובלי בקשת רשת. החלק המוסתר נשאר במקומו עם hidden במקום
 * להימחק, כדי שגלילה או טופס פתוח לא יאבדו במעבר הלוך ושוב.
 */
export default function SegmentedTabs({
  labels,
  panels,
}: {
  labels: string[];
  panels: React.ReactNode[];
}) {
  const [active, setActive] = useState(0);

  return (
    <>
      <div
        role="tablist"
        className="mb-6 grid gap-1 rounded-2xl p-1"
        style={{
          gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
        }}
      >
        {labels.map((label, index) => {
          const on = index === active;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(index)}
              className="min-h-11 rounded-xl px-3 text-sm font-bold transition-colors"
              /*
                קו מפריד בין לשונית ללשונית. בלעדיו שלוש המילים נקראות
                כשורה אחת ולא כשלוש אפשרויות. הקו נעלם משני צידי הלשונית
                הפעילה, כי המילוי כבר מפריד אותה משכנותיה.
              */
              style={{
                background: on ? "var(--wood-2)" : "transparent",
                color: on ? "var(--accent-contrast)" : "var(--dim)",
                borderInlineStart:
                  index === 0 || on || index - 1 === active
                    ? "none"
                    : "1px solid var(--line)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {panels.map((panel, index) => (
        <div key={index} role="tabpanel" hidden={index !== active}>
          {panel}
        </div>
      ))}
    </>
  );
}
