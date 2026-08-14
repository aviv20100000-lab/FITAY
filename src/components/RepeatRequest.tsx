"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * הבקשה לחזור על אימון שכבר ניצל את הכפילה שלו.
 *
 * מופיעה רק על שורה נעולה, כלומר רק אחרי שהמתאמן באמת חרג מהמגבלה של
 * התוכנית. כל עוד יש לו כפילה פנויה אין כאן כלום, כי אין מה לבקש.
 *
 * טקסט בגוון עץ ולא כפתור ממוסגר. הרשימה הזאת בנויה משורות עם קו מפריד
 * דק, וכפתור עם מילוי ומסגרת בתוך שורה כזאת הוא בדיוק הווידג'ט שאביב
 * מזהה כברירת מחדל של ערכת ממשק. אותה מתכונת של "או לפי שם היישוב"
 * בלשונית מתקנים.
 */
export default function RepeatRequest({
  workoutId,
  pending,
}: {
  workoutId: string;
  pending: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  if (pending || sent) {
    return (
      <p className="mt-1.5 text-[11px] font-bold" style={{ color: "var(--wood-1)" }}>
        הבקשה אצל איתי. תקבל התראה כשהוא יענה.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/client/repeat-request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workoutId }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
              setError(String(data?.error ?? "לא הצלחנו לשלוח"));
              return;
            }
            setSent(true);
            // כדי שהמסך יקרא את הבקשה מהשרת גם אחרי רענון.
            router.refresh();
          } catch {
            setError("אין חיבור. נסה שוב.");
          } finally {
            setBusy(false);
          }
        }}
        className="mt-1.5 min-h-9 text-[11px] font-bold disabled:opacity-50"
        style={{ color: "var(--wood-1)" }}
      >
        {busy ? "שולח…" : "לבקש אישור מאיתי"}
      </button>
      {error && (
        <p className="text-[11px]" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}
    </>
  );
}
