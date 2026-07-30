"use client";

import { useEffect, useState } from "react";
import {
  describeVapidProblem,
  urlBase64ToUint8Array,
  vapidPublicKey,
} from "./ServiceWorker";

type State = "loading" | "off" | "on" | "blocked" | "needs-install" | "unsupported";

/** אייפון תומך בדחיפה רק כשהאפליקציה נוספה למסך הבית. */
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function PushToggle({ hint }: { hint: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tested, setTested] = useState("");

  // ההודעה נעלמת לבד, ואיתה כל הכרטיס. מי שהדליק לא צריך לראות אותו שוב.
  useEffect(() => {
    if (!tested) return;
    const t = setTimeout(() => setTested(""), 6000);
    return () => clearTimeout(t);
  }, [tested]);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // בספארי באייפון זה בדיוק המצב לפני הוספה למסך הבית.
        setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
        return;
      }
      if (!("Notification" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      if (Notification.permission !== "granted") {
        setState("off");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  async function enable() {
    setError("");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const vapid = vapidPublicKey();
      const problem = describeVapidProblem(vapid);
      if (problem) throw new Error(problem);

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "השמירה נכשלה");
      }
      setState("on");

      // התראה אחת מיד, כהוכחה. בלי זה המתג נדלק ואין שום דרך לדעת אם
      // ההתראות באמת מגיעות, עד שקורה משהו אמיתי ומתפספס.
      const test = await fetch("/api/push/test", { method: "POST" });
      setTested(
        test.ok
          ? "שלחנו התראת בדיקה. אם קיבלת אותה, ההתראות פועלות."
          : "ההתראות הופעלו, אבל הודעת הבדיקה לא נשלחה. נסה שוב מהכפתור למטה."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא הצלחנו להפעיל");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError("");
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("לא הצלחנו לכבות");
    } finally {
      setBusy(false);
    }
  }

  /**
   * הדרך היחידה לדעת שדחיפה אמת עובדת על מכשיר מסוים. ההרשאה יכולה
   * להיראות מאושרת והמנוי קיים, ובפועל שום דבר לא מגיע.
   */
  async function sendTest() {
    setError("");
    setTested("");
    setBusy(true);
    try {
      // מרעננים את המנוי לפני הבדיקה, כדי שהבדיקה תבדוק את מה שיישלח בפועל.
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
      }

      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "השליחה נכשלה");
      }
      setTested("נשלח. ההתראה אמורה להגיע תוך שניות.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "השליחה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  // ההתראות דלוקות ואין מה להודיע. המתג הוא הגדרה חד־פעמית, ואין סיבה
  // שהוא יתפוס מקום בכל כניסה למסך הבית. לכיבוי יש את הגדרות הטלפון.
  if (state === "on" && !tested) return null;

  const shell = "glass mb-4 rounded-3xl px-5 py-4";

  if (state === "needs-install") {
    return (
      <div className={shell}>
        <p className="mb-1 font-bold">התראות</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          באייפון צריך קודם להוסיף את FITAY למסך הבית. לחץ על כפתור השיתוף
          בספארי, בחר הוספה למסך הבית, ואז פתח את האפליקציה משם.
        </p>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className={shell}>
        <p className="mb-1 font-bold">התראות חסומות</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          ההתראות נחסמו בעבר. כדי להפעיל אותן מחדש, פתח את הגדרות הדפדפן
          ובחר באתר הזה תחת התראות.
        </p>
      </div>
    );
  }

  const on = state === "on";

  return (
    <div className={shell}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold">התראות</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
            {on ? hint : "לחץ כדי לקבל עדכונים ותזכורות"}
          </p>
        </div>
        <button
          onClick={on ? disable : enable}
          disabled={busy}
          aria-pressed={on}
          className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60"
          style={{ background: on ? "var(--wood-2)" : "rgba(255,255,255,.16)" }}
        >
          <span
            className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
            style={{ insetInlineStart: on ? "1.75rem" : "0.25rem" }}
          />
        </button>
      </div>

      {on && (
        <button
          onClick={sendTest}
          disabled={busy}
          className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-60"
          style={{
            background: "rgba(255,255,255,.05)",
            border: "1px solid var(--line)",
            color: "var(--dim)",
          }}
        >
          {tested || "שלח לי התראת בדיקה"}
        </button>
      )}

      {error && (
        <p className="mt-2 text-xs" style={{ color: "#ffb4b6" }}>
          {error}
        </p>
      )}
    </div>
  );
}
