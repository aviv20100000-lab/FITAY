"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * בקשות לחזור על אימון, אצל איתי.
 *
 * הכלל: אותו אימון פעמיים ברצף מותר, שלוש אף פעם, ולכל אימון כפילה אחת
 * לאורך התוכנית. מי שרוצה עוד מגיע לכאן, ואיתי מאשר או דוחה. אישור שווה
 * כפילה אחת נוספת, לא היתר פתוח.
 *
 * המקטע כולו נעלם כשאין בקשות. תיבה ריקה שכתוב בה "אין בקשות" מוסיפה
 * שורה לכל מסך פתיחה של איתי כדי לומר שאין מה לעשות.
 *
 * אותה שפה של שאר האפליקציה: כותרת דו-גונית עם קו שנמוג, שורות על הדף
 * עם קו מפריד דק, ושתי פעולות בטקסט. בלי כרטיסים ובלי כפתורים ממוסגרים.
 */
export type RepeatRequestRow = {
  id: string;
  traineeName: string;
  workoutTitle: string;
  programTitle: string;
};

export default function RepeatRequestInbox({
  requests,
}: {
  requests: RepeatRequestRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (requests.length === 0) return null;

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/coach/repeat-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, approve }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(String(data?.error ?? "לא הצלחנו לשמור"));
        return;
      }
      router.refresh();
    } catch {
      setError("אין חיבור. נסה שוב.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="shrink-0 text-[1.35rem] font-black leading-tight tracking-[-.03em]">
          בקשות <span className="wood-text">לחזור על אימון</span>
        </h2>
        <span
          className="h-px flex-1"
          style={{
            background: "linear-gradient(to left, var(--wood-border), transparent)",
          }}
        />
      </div>

      {requests.map((request, index) => (
        <div
          key={request.id}
          className="py-3"
          style={{ borderTop: index === 0 ? "none" : "1px solid var(--line)" }}
        >
          <p className="text-sm font-bold leading-snug">
            {request.traineeName} מבקש לעשות שוב את {request.workoutTitle}
          </p>
          <p className="text-[11px] leading-5" style={{ color: "var(--dim)" }}>
            {request.programTitle} · הוא כבר עשה אותו פעמיים ברצף
          </p>
          {/*
            שתי מילים ולא שני כפתורים. ההחלטה כאן היא כן או לא, ושתי
            מילים בגוון העץ נושאות אותה בלי להוסיף שני מלבנים לכל שורה.
          */}
          <div className="mt-1 flex items-center gap-5">
            <button
              type="button"
              disabled={busy === request.id}
              onClick={() => decide(request.id, true)}
              className="min-h-9 text-xs font-black disabled:opacity-50"
              style={{ color: "var(--wood-1)" }}
            >
              מאשר
            </button>
            <button
              type="button"
              disabled={busy === request.id}
              onClick={() => decide(request.id, false)}
              className="min-h-9 text-xs font-bold disabled:opacity-50"
              style={{ color: "var(--dim)" }}
            >
              לא הפעם
            </button>
          </div>
        </div>
      ))}

      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
