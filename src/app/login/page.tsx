"use client";

import { useEffect, useState } from "react";
import { clearOfflineCaches } from "@/components/ServiceWorker";

type NetworkInformation = EventTarget & {
  effectiveType?: string;
  saveData?: boolean;
};

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [playBackgroundVideo, setPlayBackgroundVideo] = useState(false);

  /**
   * הכל כאן עטוף ב-try.
   *
   * זה מסך הכניסה. שגיאה שנזרקת מ-useEffect כאן מפילה את המסך היחיד
   * שדרכו נכנסים לאפליקציה, ואז אף אחד לא נכנס. addEventListener על
   * MediaQueryList לא קיים בספארי מתחת ל-14, ו-connection לא קיים בספארי
   * בכלל. רקע מונפש הוא לא סיבה מספיקה לסכן את זה, ולכן כשלון כאן פשוט
   * משאיר את תמונת הרקע הסטטית.
   */
  useEffect(() => {
    try {
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const connection = (
        navigator as Navigator & { connection?: NetworkInformation }
      ).connection;

      const update = () => {
        const slowConnection =
          connection?.saveData === true ||
          connection?.effectiveType === "slow-2g" ||
          connection?.effectiveType === "2g";
        setPlayBackgroundVideo(!motion.matches && !slowConnection);
      };

      update();
      if (typeof motion.addEventListener !== "function") return;

      motion.addEventListener("change", update);
      connection?.addEventListener?.("change", update);
      return () => {
        motion.removeEventListener("change", update);
        connection?.removeEventListener?.("change", update);
      };
    } catch {
      // נשארים על תמונת הרקע. עדיף מסך כניסה סטטי ממסך כניסה שבור.
    }
  }, []);

  async function submit() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "לא הצלחנו להיכנס. נסה שוב.");
        setBusy(false);
        return;
      }
      await clearOfflineCaches();
      window.location.replace(data.role === "coach" ? "/coach" : "/client");
    } catch {
      setError("אין חיבור לרשת");
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      {/* טבעות בתנועה מהחלל של FITAY. התמונה הקפואה נצבעת מיד,
          הווידאו מחליף אותה כשהוא מוכן, ומי שכיבה אנימציות נשאר איתה. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url('/login-rings.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* preload="auto" ולא metadata. ההחלטה אם להוריד את הקובץ בכלל כבר
          נפלה בתנאי למעלה, ומי שהגיע לכאן רוצה שהוא ינגן. הנחתה כאן רק
          מוסיפה השהיה לפני שהתנועה מתחילה. */}
      {playBackgroundVideo && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          className="motion-bg pointer-events-none absolute inset-0 h-full w-full object-cover"
          src="/login-rings.mp4"
          poster="/login-rings.jpg"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}

      {/* הכהייה — בלעדיה אי אפשר לקרוא כלום מעל וידאו.
          התחתית נשארת שקופה יחסית: כשהיא כמעט שחורה נוצרת רצועה מתה
          מתחת לטופס, והמסך נראה כאילו נגמר לפני שהוא נגמר. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,11,.5) 0%, rgba(10,10,11,.66) 42%, rgba(10,10,11,.6) 100%)",
        }}
      />

      {/* הילה חמה מלמעלה — אותה תאורה כמו בחצר של FITAY */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 50% at 50% -8%, rgba(180,133,79,.18), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
        {/* לוגו */}
        <div className="mb-14 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fitay.svg" alt="FITAY" className="w-52" />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="glass-solid rounded-3xl p-7"
        >
          <h1 className="mb-7 text-2xl font-bold">כניסה</h1>

          <label
            htmlFor="login-phone"
            className="mb-2 block text-sm"
            style={{ color: "var(--dim)" }}
          >
            טלפון
          </label>
          <input
            id="login-phone"
            type="text"
            autoComplete="username"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mb-5 w-full rounded-2xl px-4 py-4 text-lg outline-none focus:border-white/30"
            style={{
              background: "rgba(255,255,255,.05)",
              border: "1px solid var(--line)",
              color: "var(--text)",
            }}
          />

          <label
            htmlFor="login-password"
            className="mb-2 block text-sm"
            style={{ color: "var(--dim)" }}
          >
            סיסמה
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-2xl px-4 py-4 text-lg outline-none focus:border-white/30"
            style={{
              background: "rgba(255,255,255,.05)",
              border: "1px solid var(--line)",
              color: "var(--text)",
            }}
          />

          {error && (
            <p
              className="mb-4 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(229,72,77,.12)",
                border: "1px solid rgba(229,72,77,.3)",
                color: "#ffb4b6",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="wood w-full rounded-2xl py-5 text-lg font-extrabold disabled:opacity-60"
            style={{
              color: "#f7ebda",
              boxShadow:
                "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
            }}
          >
            {busy ? "רגע…" : "כניסה"}
          </button>
        </form>
      </div>
    </main>
  );
}
