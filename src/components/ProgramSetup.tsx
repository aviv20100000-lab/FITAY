"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * בחירת קצב האימונים.
 *
 * כאן ישבה גם בדיקת הפתיחה, שירדה ב-7 באוגוסט 2026. הבדיקה עברה לסוף
 * התוכנית ויושבת עכשיו ב-LevelRequest, יחד עם בקשת המעבר לרמה הבאה.
 */
export default function ProgramSetup({
  programId,
  sessionsPerWeek,
}: {
  programId: string;
  sessionsPerWeek: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(url: string, body: object) {
    setBusy(true);
    setError("");
    // רשת שנפלה השאירה את הכפתורים מושבתים לנצח בלי הודעה, ובלי קצב
    // שנבחר כל האימונים נעולים.
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-4 space-y-3">
      {!sessionsPerWeek && (
        <div className="rounded-[1.5rem] border border-[#b4854f]/35 bg-[#b4854f]/10 p-4">
          <p className="font-black">כמה פעמים נוח לך להתאמן?</p>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--dim)" }}>
            בכל המסלולים משלימים 24 אימונים. רק הקצב משתנה.
          </p>
          {/*
            שלוש אפשרויות ולא שתיים. הרבה מתאמנים מגיעים פעמיים בשבוע,
            ובלי האפשרות הזאת הם היו בוחרים קצב שלא מתאים להם או נשארים
            עם תוכנית נעולה.
          */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[2, 3, 4].map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={busy}
                onClick={() =>
                  post("/api/client/program-settings", {
                    programId,
                    sessionsPerWeek: amount,
                  })
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-2 py-3 font-extrabold disabled:opacity-50"
              >
                {amount} בשבוע
                {/*
                  כאן ישבה הערכת משך בשבועות. היא ירדה: התוכנית נמדדת
                  ב-24 אימונים, והקצב קובע רק כמה מהר מגיעים אליהם.
                  הכיתוב התקצר כשנוספה אפשרות שלישית ועמודה נהייתה צרה.
                */}
                <span className="mt-0.5 block text-xs font-semibold" style={{ color: "var(--dim)" }}>
                  24 אימונים
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
    </div>
  );
}
