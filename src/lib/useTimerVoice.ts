"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * הקול של טיימר המנוחה.
 *
 * הטלפון מונח על הרצפה והמתאמן לא מסתכל עליו, ולכן הזמן נמסר בדיבור:
 * הודעה בכל חצי דקה, ספירה לאחור בחמש השניות האחרונות, והודעת סיום.
 *
 * בלי הקלטות ובלי קבצים — speechSynthesis המובנה של הדפדפן. אין מה
 * להוריד, וזה עובד גם כשהחצר בלי קליטה טובה.
 *
 * ברירת המחדל היא קול עברי. אייפון שמוגדר אנגלית מגיע בלי קול עברי
 * מותקן, ושם נופלים לאנגלית עם אותם משפטים. הבדיקה נעשית פעם אחת
 * בטעינת המסך, כי רשימת הקולות לא משתנה באמצע אימון.
 */

export type Lang = "he" | "en";

const COUNTDOWN: Record<Lang, string[]> = {
  // אינדקס 1 עד 5. מספרים נקביים, כי המילה שניות נקבית.
  he: ["", "אחת", "שתיים", "שלוש", "ארבע", "חמש"],
  en: ["", "one", "two", "three", "four", "five"],
};

const FINISH: Record<Lang, string> = {
  he: "המנוחה נגמרה",
  en: "Rest is over",
};

const HE_MINUTES = ["", "דקה", "שתי דקות", "שלוש דקות", "ארבע דקות", "חמש דקות"];
const EN_MINUTES = ["", "one minute", "two minutes", "three minutes", "four minutes", "five minutes"];

/**
 * הודעת חצי הדקה, לפי הזמן שנשאר.
 *
 * הפועל מתאים למספר: דקה אחת נשארה, שתי דקות נשארו. מנוחה ארוכה
 * מהטבלה נמסרת בשניות, מכוער אבל מובן, ועדיף על שקט.
 */
function remainingPhrase(seconds: number, lang: Lang): string {
  const minutes = Math.floor(seconds / 60);
  const half = seconds % 60 === 30;

  if (lang === "he") {
    if (minutes === 0) return "נשארו שלושים שניות";
    if (minutes >= HE_MINUTES.length) return `נשארו ${seconds} שניות`;
    const base = HE_MINUTES[minutes];
    if (half) return minutes === 1 ? "נשארה דקה וחצי" : `נשארו ${base} וחצי`;
    return minutes === 1 ? "נשארה דקה" : `נשארו ${base}`;
  }

  if (minutes === 0) return "Thirty seconds left";
  if (minutes >= EN_MINUTES.length) return `${seconds} seconds left`;
  const phrase = half
    ? `${EN_MINUTES[minutes].split(" ")[0]} and a half minutes left`
    : `${EN_MINUTES[minutes]} left`;
  return phrase[0].toUpperCase() + phrase.slice(1);
}

/**
 * מה נאמר בשנייה הזאת, אם בכלל.
 *
 * חמש השניות האחרונות הן ספירה לאחור, וכל חצי דקה מעליהן היא הודעת
 * זמן. כל שנייה אחרת שקטה. פונקציה טהורה, כדי שאפשר יהיה לבדוק את
 * לוח הזמנים בלי דפדפן ובלי טיימר.
 */
export function phraseFor(remaining: number, lang: Lang): string | null {
  if (!Number.isFinite(remaining) || remaining < 1) return null;
  if (remaining <= 5) return COUNTDOWN[lang][remaining];
  if (remaining % 30 === 0) return remainingPhrase(remaining, lang);
  return null;
}

export const finishPhrase = (lang: Lang): string => FINISH[lang];

function isHebrewVoice(v: SpeechSynthesisVoice): boolean {
  const lang = (v.lang || "").toLowerCase();
  // iw הוא הקוד הישן לעברית, ומנועים מסוימים עדיין מדווחים iw-IL.
  return lang.startsWith("he") || lang.startsWith("iw");
}

export type TimerVoice = {
  /** לפתוח את מנוע הדיבור. חייב לרוץ בתוך לחיצה של המשתמש. */
  prime: () => void;
  /** אומר את מה שמתאים לשנייה הזאת, ושותק בשניות שאין בהן הודעה. */
  sayAt: (remaining: number) => void;
  sayFinish: () => void;
  stop: () => void;
};

export function useTimerVoice(enabled: boolean): TimerVoice {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const langRef = useRef<Lang>("he");
  const primedRef = useRef(false);
  const enabledRef = useRef(enabled);

  // הפונקציות נשמרות יציבות, ולכן העדפת ההשתקה נקראת מתוך ref ולא מהסגור.
  enabledRef.current = enabled;

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    function resolve() {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      const hebrew = voices.find(isHebrewVoice);
      if (hebrew) {
        voiceRef.current = hebrew;
        langRef.current = "he";
        return;
      }
      voiceRef.current = voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
      langRef.current = "en";
    }

    // getVoices מחזיר רשימה ריקה בקריאה הראשונה בחלק מהדפדפנים,
    // והרשימה נטענת אחריה. בלי ההאזנה היינו נתקעים על אנגלית.
    resolve();
    window.speechSynthesis.addEventListener("voiceschanged", resolve);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", resolve);
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!enabledRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.lang = voiceRef.current?.lang ?? (langRef.current === "he" ? "he-IL" : "en-US");
    // הספירה לאחור היא מילה בשנייה, ולכן משפט שנתקע חוסם את הבא אחריו.
    window.speechSynthesis.cancel();
    try {
      window.speechSynthesis.speak(u);
    } catch {
      // מנוע דיבור שנפל לא מפיל את האימון.
    }
  }, []);

  const prime = useCallback(() => {
    if (primedRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    primedRef.current = true;
    // דפדפנים דורשים מגע ראשון לפני שמותר לדבר. אמירה שקטה בתוך
    // הלחיצה שמפעילה את הטיימר פותחת את המנוע, וההודעה הראשונה
    // באמת נשמעת במקום ליפול בשקט.
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      // אין תמיכה, ממשיכים בלי קול.
    }
  }, []);

  const sayAt = useCallback(
    (remaining: number) => {
      const text = phraseFor(remaining, langRef.current);
      if (text) speak(text);
    },
    [speak]
  );

  const sayFinish = useCallback(() => speak(finishPhrase(langRef.current)), [speak]);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
  }, []);

  return { prime, sayAt, sayFinish, stop };
}
