"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import FitayIcon from "@/components/FitayIcon";
import { useWakeLock } from "@/lib/useWakeLock";
import { useTimerVoice } from "@/lib/useTimerVoice";
import { useOverlay } from "@/lib/useOverlay";
import { Bidi } from "@/components/Bidi";
import { ceilingOf, logsReps } from "@/lib/progression-core";
import type {
  Advice,
  BandLevel,
  LastPerformance,
  ProgressionMode,
  Side,
} from "@/lib/types";

/** YYYY-MM-DD לפי שעון המכשיר, כמו ב-WeekStrip. */
function localDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type Item = {
  id: string;
  exerciseId: string;
  name: string;
  description: string;
  technique: string[];
  tips: string[];
  tempo: string;
  muscles: string;
  type: "reps" | "hold" | "amrap";
  /**
   * ציר ההתקדמות, נפרד מציר המדידה.
   *
   * 'stance' מטפס אל התקרה שבתוכנית ואז מקשה את המנח. 'reps' ו-'time'
   * ממשיכים לעלות בלי תקרה, כי שם התוספת עצמה היא ההתקדמות.
   */
  progression: ProgressionMode;
  hasStanceLevels: boolean;
  /**
   * כמה רמות מנח יש לתרגיל הזה בפועל, לפי הסרטונים שקיימים.
   *
   * לא תמיד שלוש. תרגיל עם סרטון לרמה 2 בלבד הוא תרגיל של שתי רמות,
   * והמסך לא מבטיח רמה שאין לה הדגמה.
   */
  stanceLevelCount: number;
  unilateral: boolean;
  /** האם מותר לבצע את התרגיל הזה בעזרת גומייה. נקבע בספריית התרגילים. */
  bandAllowed: boolean;
  sets: number;
  reps: number | null;
  seconds: number | null;
  /**
   * המרשם מהשרת: היעד להיום, מספר לכל סט.
   *
   * מחושב בטעינת העמוד בליבה המשותפת (progression-core), אותו קובץ
   * שהמנוע קורא ממנו את התקרה והתחתית. ללקוח לא נשאר חישוב מרשם.
   */
  targets: number[];
  /** תחתית טווח העבודה. null בתרגילי amrap, שנשארים מחוץ למנגנון. */
  floor: number | null;
  /**
   * האם הטווח נקבע בתוכנית או שהתחתית היא ברירת מחדל מחושבת.
   *
   * שורת הטווח במסך מוצגת רק כשהוא נקבע. תחתית שהמנגנון חישב לבד היא
   * מספר שאיש לא כתב, ומתאמן שקורא "6–10" מניח שאיתי התכוון לזה.
   */
  rangeSet: boolean;
  /**
   * התרגיל כבר בוצע בתוכנית קודמת של אותו מתאמן.
   *
   * ההשוואה לפעם הקודמת מוגבלת לריצה הנוכחית, ולכן בלי הדגל הזה תרגיל
   * שממשיך משלב לשלב נראה כתרגיל חדש לגמרי.
   */
  seenBefore: boolean;
  /** ההנחיה מהמנגנון לאימון הזה: להקשות, לוותר על הגומייה, או להקל. */
  advice: Advice;
  /** כמה פעמים התרגיל כבר הוקשה בריצה הזאת. */
  difficultyStep: number;
  /** כמה אימונים רצופים בתקרה נצברו לקראת רמת המנח הבאה. */
  ceilingStreak: number;
  rest: number;
  ringHeight: string | null;
  bodyAngle: string | null;
  /** הדגש שהמאמן כתב לתרגיל הזה אצל המתאמן הזה. ריק כשאין. */
  coachNote: string;
  videoFile: string | null;
  posterUrl: string | null;
  /**
   * ההדגמה עם הגומייה. מוצגת במקום הרגילה כשמתג הגומייה דלוק.
   *
   * null ברוב התרגילים, וגם בתרגיל שמותרת בו גומייה אבל עדיין אין לו
   * קליפ כזה. בשני המקרים ממשיכים להראות את ההדגמה הרגילה.
   */
  bandVideoFile: string | null;
  bandPosterUrl: string | null;
  last: LastPerformance | null;
};

export type WarmupItem = {
  id: string;
  name: string;
  description: string;
  technique: string[];
  /** ההדגמה שאיתי חיבר לתרגיל בספרייה. null בתרגיל שעדיין אין לו קליפ. */
  videoFile: string | null;
  posterUrl: string | null;
  sets: number;
  reps?: number;
  seconds?: number;
};

type LoggedSet = {
  workoutItemId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  seconds: number | null;
  side: Side | null;
  banded: boolean;
  /** איזו גומייה: קלה, בינונית או קשה. null כשהסט בוצע בלי גומייה. */
  bandLevel: BandLevel | null;
  /**
   * המתאמן אישר את המספר שהוצע לו בלי לשנות אותו.
   *
   * נספר רק שינוי ערך בפועל. מיקוד בשדה או לחיצה שלא הזיזה את המספר
   * אינם נגיעה, אחרת הדגל היה נדלק אצל כולם ומפסיק להבדיל בין שום דבר.
   */
  untouched: boolean;
};

/** שלוש הגומיות של איתי, מהקלה לקשה. */
const BAND_LEVELS: { value: BandLevel; label: string }[] = [
  { value: "easy", label: "קלה" },
  { value: "medium", label: "בינונית" },
  { value: "hard", label: "קשה" },
];

export const BAND_LABEL: Record<BandLevel, string> = {
  easy: "קלה",
  medium: "בינונית",
  hard: "קשה",
};

/**
 * רטט קצר. לא צליל — מתאמנים רבים עם מוזיקה באוזניות, וביפ היה נבלע.
 * אייפון לא תומך ב-vibrate בכלל ופשוט מתעלם.
 */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // דפדפן שחוסם רטט. אין מה לעשות ואין למה להיכשל.
  }
}

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function WorkoutRunner({
  programId,
  workoutId,
  workoutTitle,
  programTitle,
  phase,
  recovery,
  items,
  warmup,
}: {
  programId: string;
  workoutId: string;
  workoutTitle: string;
  programTitle: string;
  phase: number;
  /** אימון התאוששות — חצי מהסטים, בלי השוואות ובלי קידום דרגה. */
  recovery: boolean;
  items: Item[];
  warmup: WarmupItem[];
}) {
  const router = useRouter();
  const storageKey = `fitay-workout-${workoutId}`;

  const [stage, setStage] = useState<"warmup" | "work">("warmup");
  const [index, setIndex] = useState(0);
  const [set, setSet] = useState(1);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<LoggedSet[]>([]);
  /**
   * משך האימון נצבר, לא נמדד מחותמת פתיחה.
   *
   * קודם נשמר startedAtMs והמשך חושב כ"עכשיו פחות ההתחלה". מי שפתח את
   * המסך בערב, סגר את האפליקציה וחזר אחרי שעה לסיים, קיבל את כל ההפסקה
   * בתוך המשך, וסיכום של אימון קצר הראה 88 דקות. עכשיו נשמר הזמן שנצבר
   * עד כה, וכל פתיחה מחדש ממשיכה ממנו: הזמן שהאפליקציה הייתה סגורה פשוט
   * לא נספר.
   */
  const [elapsedBaseMs, setElapsedBaseMs] = useState(0);
  const [sessionStartMs, setSessionStartMs] = useState(() => Date.now());
  const elapsedNowMs = () => elapsedBaseMs + (Date.now() - sessionStartMs);
  /** רגע הסיום של המנוחה כחותמת זמן — לא מונה יורד. */
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  /**
   * העדפת הקול נשמרת במכשיר, לא במסד. חלק מהמתאמנים בחדר כושר
   * ציבורי ולא רוצים שהטלפון ידבר, וההעדפה הזאת צריכה לשרוד סגירה
   * של האפליקציה בלי לחכות לשרת.
   */
  const [voiceOn, setVoiceOn] = useState(true);
  /** השנייה האחרונה שנאמרה, כדי שאותה הודעה לא תיאמר פעמיים באותו טיק. */
  const spokenSecond = useRef<number | null>(null);
  const savingSet = useRef(false);
  const [restored, setRestored] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  /*
   * גלילה לראש המסך במעבר תרגיל בלבד, ולא בין סטים.
   *
   * תרגיל חדש הוא מסך אחר: שם אחר, סרטון אחר, גובה טבעות אחר, ולכן
   * מתחילים אותו מלמעלה. סט הוא אותו תרגיל בדיוק, והמתאמן עומד ליד
   * הכפתור עם טלפון על הרצפה — קפיצה למעלה אחרי כל סט מכריחה אותו
   * לגלול חזרה בכל פעם.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [index, stage]);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);
  /*
    לחיצה על הסרטון עוצרת אותו, ולחיצה נוספת ממשיכה.

    קודם לחיצה על הסרטון הגדילה אותו, וזאת פעולה שכבר יש לה כפתור משלה
    בשורה שמתחת. כלומר הפעולה הכי טבעית על סרטון, לעצור אותו כדי להסתכל
    על פרט, לא הייתה קיימת בכלל, והמחווה תפוסה על ידי משהו אחר.

    המצב נקרא מהאירועים של הנגן ולא רק מהלחיצה, כי הדפדפן עוצר סרטון גם
    בלי שנגעו בו: חזרה מרקע, מצב חיסכון בסוללה, או סוף מדיה. דגל שנשמר
    רק בלחיצות היה מציג "מתנגן" מול פריים קפוא.
  */
  const [videoPaused, setVideoPaused] = useState(false);
  const previousIndex = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const item = items[index];

  /**
   * שחזור אימון שנקטע. מתאמן שנועל את המסך, מקבל שיחה או מרענן —
   * חוזר בדיוק לאותו סט. בלי זה כל הרישום נמחק, וזה קורה בחצר כל שבוע.
   */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === "object") {
          const today = localDay(new Date());
          const savedDay = typeof s.savedDay === "string" ? s.savedDay : "";
          if (savedDay !== today) {
            // מסירים לפני הדיווח: גם React Strict Mode וגם רענון נוסף לא
            // שולחים שוב. השרת מוסיף הגנה שנייה עם אינדקס ייחודי.
            localStorage.removeItem(storageKey);
            // בפורמט הישן אין יום אמין. לא מציגים בהיסטוריה את היום שבו
            // גילינו את האימון כאילו הוא היום שבו התחיל.
            if (LOCAL_DAY_PATTERN.test(savedDay)) {
              void fetch("/api/client/workouts/abandoned", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                body: JSON.stringify({ programId, workoutId, day: savedDay }),
              }).catch(() => {
                // הדיווח הוא best effort ואסור שיחסום התחלה נקייה של האימון.
              });
            }
            setRestored(true);
            return;
          }
          const restoredIndex = Math.min(
            Math.max(0, Number(s.index) || 0),
            Math.max(0, items.length - 1)
          );
          setStage(s.stage === "work" ? "work" : "warmup");
          setIndex(restoredIndex);
          // הסט נתחם מלמעלה: אימון שנשמר לפני חלון ההתאוששות יכול לחזור
          // עם מספר סט שגדול ממספר הסטים המוקטן של עכשיו.
          setSet(
            Math.min(
              Math.max(1, Number(s.set) || 1),
              Math.max(1, items[restoredIndex]?.sets ?? 1)
            )
          );
          setLogs(Array.isArray(s.logs) ? s.logs : []);
          /*
           * elapsedMs הוא הפורמט החדש. אימון שנשמר בגרסה הקודמת מגיע עם
           * startedAtMs בלבד, ובשבילו הכי הוגן להתחיל את המונה מאפס:
           * חותמת הפתיחה הישנה היא בדיוק המספר המנופח שממנו ברחנו.
           */
          setElapsedBaseMs(Math.max(0, Number(s.elapsedMs) || 0));
          setSessionStartMs(Date.now());
          setRestUntil(typeof s.restUntil === "number" ? s.restUntil : null);
          setRestTotal(
            typeof s.restTotal === "number"
              ? s.restTotal
              : typeof s.restUntil === "number"
                ? items[restoredIndex]?.rest ?? null
                : null
          );
          if (s.stage === "work" && Array.isArray(s.logs) && s.logs.length > 0) {
            setResumed(true);
          }
        }
      }
    } catch {
      // אחסון חסום או פגום — מתחילים נקי, לא מפילים את המסך.
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // שמירה אחרי כל שינוי. אחרי סיום האימון אין מה לשמור.
  useEffect(() => {
    if (!restored || done) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          stage, index, set, logs, restUntil, restTotal,
          savedDay: localDay(new Date()),
          // הזמן שנצבר עד הרגע הזה. נכתב בכל שינוי מצב, כלומר לכל היותר
          // הולכת לאיבוד המנוחה שאחרי השמירה האחרונה, וזו טעות לחיסרון.
          elapsedMs: elapsedNowMs(),
        })
      );
    } catch {
      // אין מקום באחסון — האימון ימשיך לעבוד, פשוט בלי שחזור.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, done, stage, index, set, logs, restUntil, restTotal, storageKey]);

  function clearSaved() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // אין מה לעשות, ואין למה להיכשל.
    }
  }

  function restart() {
    clearSaved();
    setStage("warmup");
    setIndex(0);
    setSet(1);
    setLogs([]);
    setRestUntil(null);
    setRestTotal(null);
    setResumed(false);
    setConfirmRestart(false);
    setElapsedBaseMs(0);
    setSessionStartMs(Date.now());
  }

  useEffect(() => {
    if (!restored) return;
    if (previousIndex.current == null) {
      previousIndex.current = index;
      return;
    }
    if (previousIndex.current !== index) {
      previousIndex.current = index;
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [index, restored]);

  useEffect(() => {
    if (pendingIndex == null) return;
    const timer = setTimeout(() => {
      setIndex(pendingIndex);
      setPendingIndex(null);
    }, 900);
    return () => clearTimeout(timer);
  }, [pendingIndex]);

  // ערכי הרישום לסט הנוכחי. מתאפסים ליעד של היום בכל מעבר סט או תרגיל.
  const [main, setMain] = useState(0);
  const [strong, setStrong] = useState(0);
  /**
   * האם המתאמן שינה את המספר שהוצע לו בסט הזה.
   *
   * זה מה שמבדיל בין רישום אמיתי לאישור עיוור, ולכן נספר רק שינוי ערך.
   * מיקוד בשדה או לחיצה שלא הזיזה את המספר אינם נגיעה.
   */
  const [mainTouched, setMainTouched] = useState(false);
  const [strongTouched, setStrongTouched] = useState(false);
  /** איזו גומייה בסט הנוכחי. null = בלי גומייה. נשמר עם הסט. */
  const [bandLevel, setBandLevel] = useState<BandLevel | null>(null);
  const banded = bandLevel !== null;
  /**
   * האם המתאמן בכלל מסמן שהוא משתמש בגומייה.
   *
   * הפרדה משלב הרמה, כדי שהברירת מחדל תהיה סט בלי גומייה ולא תבחר רמה
   * באקראי. רק אחרי שהמתאמן מפעיל את זה נפתחות שלוש הרמות לבחירה.
   */
  const [usingBand, setUsingBand] = useState(false);

  useEffect(() => {
    if (!item) return;
    // המרשם הגיע מהשרת מוכן. סט מעבר לרשימה לא אמור לקרות, והנפילה
    // לתחתית שומרת שהמסך לא יציג אפס במקרה כזה.
    const target = item.targets[set - 1] ?? item.floor ?? 0;
    setMain(target);
    setStrong(target);
    setMainTouched(false);
    setStrongTouched(false);
  }, [item, set]);

  // חוסם שתי לחיצות שמגיעות לפני שהרינדור הבא מעדכן את מספר הסט.
  useEffect(() => {
    savingSet.current = false;
  }, [index, set]);

  /**
   * הצד החזק עוקב אחרי הצד החלש כל עוד לא נגעו בו.
   *
   * לצד החזק אין היסטוריה משלו: ההשוואה נשמרת על הצד החלש בלבד, כי הוא
   * זה שקובע אם יש התקדמות אמיתית. לכן המספר שלו נגזר ממה שיצא בפועל
   * בצד החלש באותו אימון, ומרגע שהמתאמן משנה אותו הוא עומד בפני עצמו.
   */
  function changeMain(next: number) {
    setMain(next);
    setMainTouched(true);
    if (!strongTouched) setStrong(next);
  }

  function changeStrong(next: number) {
    setStrong(next);
    setStrongTouched(true);
  }

  // הגומייה מתאפסת במעבר תרגיל בלבד. בתוך אותו תרגיל מי שהתחיל איתה
  // בדרך כלל ממשיך איתה, ואין סיבה להצריך לחיצה בכל סט.
  useEffect(() => {
    setBandLevel(null);
    setUsingBand(false);
  }, [index]);

  const { prime: primeVoice, sayAt, sayFinish, stop: stopVoice } = useTimerVoice(voiceOn);

  useEffect(() => {
    try {
      setVoiceOn(localStorage.getItem("fitay-voice") !== "off");
    } catch {
      // גלישה פרטית חוסמת אחסון. הקול פשוט נשאר דלוק.
    }
  }, []);

  function toggleVoice() {
    setVoiceOn((on) => {
      const next = !on;
      try {
        localStorage.setItem("fitay-voice", next ? "on" : "off");
      } catch {
        // ההעדפה לא תשרוד סגירה, אבל היא עובדת עכשיו.
      }
      if (!next) stopVoice();
      return next;
    });
  }

  /**
   * טיימר המנוחה נגזר משעון אמיתי ולא מספירה לאחור בזיכרון —
   * setTimeout נעצר כשהמסך ננעל, והמתאמן היה חוזר לטיימר קפוא.
   * במקום צלצול הטיימר מדבר, כי הטלפון מונח על הרצפה והמתאמן
   * לא מסתכל עליו בין הסטים.
   */
  const resting =
    restUntil == null ? 0 : Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));

  useEffect(() => {
    if (restUntil == null) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [restUntil]);

  /**
   * מה נאמר ומתי: הודעה בכל חצי דקה, וספירה לאחור בחמש האחרונות.
   *
   * הטיק רץ פעמיים בשנייה, ולכן אותה שנייה מגיעה לכאן פעמיים.
   * spokenSecond שומר מה כבר נאמר, אחרת "שלוש" היה נאמר כפול
   * ומדלג על "שתיים".
   */
  useEffect(() => {
    if (restUntil == null) {
      spokenSecond.current = null;
      return;
    }
    const remaining = Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));
    if (spokenSecond.current === remaining) return;
    spokenSecond.current = remaining;
    sayAt(remaining);
  }, [tick, restUntil, sayAt]);

  useEffect(() => {
    if (restUntil == null) return;
    const over = Date.now() - restUntil;
    if (over < 0) return;
    // רק אם המנוחה נגמרה ממש עכשיו. אימון שנשמר ונפתח מחר לא ירטוט לשווא.
    if (over < 3000) {
      buzz([180, 90, 180]);
      sayFinish();
    }
    setRestUntil(null);
    setRestTotal(null);
  }, [tick, restUntil, sayFinish]);

  // המסך נשאר דלוק כל עוד האימון פתוח — כולל החימום, לא רק הסטים.
  useWakeLock(restored && !done);

  // סרטון שנפתח למסך מלא הוא שכבה, ולכן סרגל הפעולה מתחתיו מסתתר.
  useOverlay(videoExpanded);

  if (items.length === 0) {
    return (
      <Shell>
        <p className="glass rounded-3xl px-6 py-12 text-center">
          אין תרגילים באימון הזה עדיין.
        </p>
        <BackLink href="/client" className="mt-4">
          חזרה למסך הראשי
        </BackLink>
      </Shell>
    );
  }

  // מחכים לשחזור לפני הציור הראשון, אחרת המסך היה קופץ מהחימום
  // אל אמצע האימון מול העיניים של המתאמן.
  if (!restored) {
    return (
      <Shell>
        <div className="h-40" />
      </Shell>
    );
  }

  if (done) {
    return (
      <FinishScreen
        programId={programId}
        workoutId={workoutId}
        recovery={recovery}
        logs={logs}
        items={items}
        durationSec={Math.round(elapsedNowMs() / 1000)}
        onSaved={() => {
          clearSaved();
          router.push("/client");
          router.refresh();
        }}
      />
    );
  }

  if (stage === "warmup") {
    return (
      <WarmupScreen
        warmup={warmup}
        workoutTitle={workoutTitle}
        programTitle={programTitle}
        phase={phase}
        recovery={recovery}
        onStart={() => {
          setStage("work");
          setPendingIndex(0);
        }}
      />
    );
  }

  const isLastSet = set >= item.sets;
  const isLastExercise = index >= items.length - 1;

  function startRest(seconds: number) {
    // הפתיחה של מנוע הדיבור חייבת לקרות בתוך הלחיצה עצמה.
    // מכאן והלאה מותר לדבר גם מתוך טיימר.
    primeVoice();
    // בלי זה המנוחה הייתה נפתחת בהכרזה על המשך המלא, לפני שנחה שנייה.
    spokenSecond.current = seconds;
    setRestTotal(seconds);
    setRestUntil(Date.now() + seconds * 1000);
  }

  function adjustRest(delta: number) {
    if (restUntil == null || restTotal == null) return;
    const remaining = Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));
    const elapsed = Math.max(0, restTotal - remaining);
    const nextTotal = Math.max(elapsed, restTotal + delta);
    const nextRemaining = Math.max(0, nextTotal - elapsed);
    if (nextRemaining === 0) {
      // הורדה עד האפס מסיימת את המנוחה בדיוק כמו דילוג, כולל השתקה.
      stopVoice();
      setRestUntil(null);
      setRestTotal(null);
      return;
    }
    setRestTotal(nextTotal);
    setRestUntil(Date.now() + nextRemaining * 1000);
  }

  function skipRest() {
    // מי שדילג על המנוחה לא רוצה לשמוע את סופה.
    stopVoice();
    setRestUntil(null);
    setRestTotal(null);
  }

  function saveSet() {
    if (savingSet.current) return;
    savingSet.current = true;
    const entries: LoggedSet[] = [];
    const base = {
      workoutItemId: item.id,
      exerciseId: item.exerciseId,
      setNumber: set,
    };
    const toRow = (
      value: number,
      side: Side | null,
      untouched: boolean
    ): LoggedSet => ({
      ...base,
      reps: logsReps(item.type) ? value : null,
      seconds: logsReps(item.type) ? null : value,
      side,
      banded,
      bandLevel,
      untouched,
    });

    if (item.unilateral) {
      entries.push(
        toRow(main, "weak", !mainTouched),
        toRow(strong, "strong", !strongTouched)
      );
    } else {
      entries.push(toRow(main, null, !mainTouched));
    }
    setLogs((prev) => [...prev, ...entries]);
    setResumed(false);

    if (!isLastSet) {
      setSet(set + 1);
      startRest(item.rest);
      return;
    }
    if (!isLastExercise) {
      setSet(1);
      startRest(item.rest);
      setPendingIndex(index + 1);
      return;
    }
    setDone(true);
  }

  // היעד מוצג כטווח: מהתחתית אל התקרה. amrap נשאר יעד יחיד של זמן.
  //
  // שורה עם מספר חסר הדפיסה "null שניות" ישר למסך. בחזרות והחזקות מותר
  // ליפול לעמודה השנייה, כי שם זה כמעט תמיד מספר שנשמר בשדה הלא נכון.
  // ב-amrap אסור: השניות הן משך הסט והחזרות הן התוצאה, והשאלה של הקלט
  // ממילא נשארת חזרות. בלי משך פשוט אומרים את המטרה במילים.
  const ceiling = ceilingOf(item);
  /*
   * פס הטווח בכל התרגילים שיש להם טווח אמיתי.
   *
   * קודם הוא הוגבל לתרגילי מנח, כי בציר חזרות וזמן המספר שבתוכנית היה
   * נקודת פתיחה בלי תקרה. מאז שאיתי הכריע שהטווח הוא תקרה בכל הצירים
   * (13 באוגוסט 2026) ההגבלה יצרה סתירה על אותו מסך: הכותרת הגדולה
   * הראתה את התקרה בזמן שהקלט מתחתיה הציע את התחתית.
   *
   * amrap נשאר בחוץ. שם השניות הן משך הסט ולא יעד לטפס אליו.
   */
  const showRange =
    item.type !== "amrap" &&
    item.floor != null &&
    ceiling != null &&
    item.floor < ceiling;

  /*
   * תג היעד מוצג רק בתרגילי רמות מנח, וגם שם רק בדרך למעלה. איתי ביקש
   * להוריד אותו מכל השאר (11 באוגוסט 2026): בתרגילי חזרות וזמן הוא היה
   * רעש, וברמה 3 אין לאן לעלות ולכן אין מה להבטיח.
   */
  const goalLine = (() => {
    if (recovery) return null;
    if (item.progression !== "stance" || !item.hasStanceLevels) return null;
    if (item.difficultyStep >= 2 || ceiling == null) return null;
    // השער הוחמר בהכרעת 13 באוגוסט 2026 לכל הסטים בתקרה, והטקסט חייב
    // להבטיח בדיוק את מה שהמנוע בודק. קודם הובטח כאן סט אחד.
    return item.ceilingStreak === 1
      ? `עוד אימון אחד עם ${ceiling} בכל הסטים, והמנח הבא נפתח`
      : `מגיעים ל-${ceiling} בכל הסטים בשני אימונים ברצף, והמנח הבא נפתח`;
  })();
  const target =
    item.type === "amrap"
      ? ceiling == null
        ? "כמה שיותר חזרות"
        : `${ceiling} שניות`
      : ceiling == null
        ? "לפי היכולת שלך"
        : showRange
          ? `${item.floor}–${ceiling} ${item.type === "hold" ? "שניות" : "חזרות"}`
          : `${ceiling} ${item.type === "hold" ? "שניות" : "חזרות"}`;

  const unit = logsReps(item.type) ? "חזרות" : "שניות";

  /*
   * הטווח בשורת הכותרת, במקום מנח הגוף.
   *
   * מוצג כטווח כשיש טווח אמיתי — או בתרגיל מנח, שם התחתית היא חלק
   * מהמנגנון, או בכל תרגיל שאיתי קבע לו תחתית מפורשת. אחרת מוצג המספר
   * היחיד שקיים, ולא טווח מומצא סביבו.
   */
  const rangeLabel = item.type === "amrap" ? "משך הסט" : `טווח ${unit}`;
  const rangeValue = (() => {
    if (item.type === "amrap") {
      return ceiling == null ? "לפי היכולת" : `${ceiling} שניות`;
    }
    if (ceiling == null) return "לפי היכולת";
    const spread =
      item.floor != null && item.floor < ceiling && (showRange || item.rangeSet);
    return spread ? `${item.floor}–${ceiling}` : String(ceiling);
  })();

  /*
   * גובה הטבעות. בתרגיל מנח הגובה משתנה מרמה לרמה, ולכן מה שאומר משהו
   * הוא הרמה שהמתאמן נמצא בה עכשיו ולא מספר קבוע. בשאר התרגילים מוצג
   * מה שאיתי כתב בתוכנית, כולל "מקסימום" במתח ובמקבילים.
   */
  const ringValue = item.hasStanceLevels
    ? `רמה ${Math.min(item.stanceLevelCount, item.difficultyStep + 1)}`
    : (item.ringHeight ?? "חופשי");

  const activeRestTotal = restTotal ?? item.rest;
  const currentExerciseLogs = logs.filter((log) => log.workoutItemId === item.id);

  if (pendingIndex != null) {
    const next = items[pendingIndex];
    return (
      <Shell hasBottomBar={resting > 0}>
        <div className="flex min-h-[65dvh] flex-col items-center justify-center text-center" role="status" aria-live="polite">
          <p className="mb-3 text-sm font-bold wood-text">התרגיל הבא</p>
          <p className="text-xl font-extrabold">
            תרגיל {pendingIndex + 1} מתוך {items.length} · {next.name}
          </p>
        </div>
        {resting > 0 && (
          <RestActionBar
            remaining={resting}
            total={activeRestTotal}
            onAdjust={adjustRest}
            onSkip={skipRest}
            voiceOn={voiceOn}
            onToggleVoice={toggleVoice}
          />
        )}
      </Shell>
    );
  }

  /*
   * איזו הדגמה רואים עכשיו.
   *
   * הגומייה משנה את התרגיל עצמו, ולכן מי שמתאמן איתה צריך לראות ביצוע
   * עם גומייה. כשאין קליפ כזה חוזרים להדגמה הרגילה, וכך תרגיל בלי
   * החריץ החדש מתנהג בדיוק כמו קודם.
   */
  const bandShown = usingBand && item.bandVideoFile != null;
  const shownVideo = bandShown ? item.bandVideoFile : item.videoFile;
  const shownPoster = bandShown ? item.bandPosterUrl : item.posterUrl;

  return (
    <Shell hasBottomBar>
      <div className="mb-4 text-center">
        <p className="text-lg font-extrabold">
          תרגיל {index + 1} מתוך {items.length}
        </p>
        <p className="mt-0.5 text-sm" style={{ color: "var(--dim)" }}>
          סט {set} מתוך {item.sets}
        </p>
      </div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <BackLink href="/client" className="!min-h-9 !px-2.5 !py-1.5 !text-xs">שמירה ויציאה</BackLink>
        {logs.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmRestart(true)}
            className="min-h-9 rounded-xl px-2.5 text-xs font-semibold"
            style={{ color: "var(--dim)", border: "1px solid var(--line)" }}
          >
            התחלה מחדש
          </button>
        )}
      </div>

      {confirmRestart && (
        <div className="mb-4 rounded-2xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}>
          <p className="font-bold">להתחיל את האימון מחדש?</p>
          <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
            כל הסטים שרשמת באימון הנוכחי יימחקו מהמכשיר.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={restart} className="rounded-xl px-4 py-2.5 font-bold" style={{ background: "var(--danger-text)", color: "var(--accent-contrast)" }}>
              התחלה מחדש
            </button>
            <button type="button" onClick={() => setConfirmRestart(false)} className="rounded-xl px-4 py-2.5 font-semibold" style={{ border: "1px solid var(--line)" }}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {resumed && (
        <div
          className="mb-4 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "rgba(180,133,79,.14)",
            border: "1px solid rgba(224,190,147,.3)",
            color: "var(--wood-1)",
          }}
        >
          חזרת לאימון שהתחלת. הסטים שרשמת נשמרו.
        </div>
      )}

      <div
        className="mb-6 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="wood h-full rounded-full transition-all duration-500"
          style={{ width: `${((index + (set - 1) / item.sets) / items.length) * 100}%` }}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--dim)" }}>
        {programTitle} · {workoutTitle}
      </p>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">
        {item.name}
        {/*
          איפה אני בסולם. עובדה על ההווה, לא הצצה קדימה: אין מנעולים
          ואין רמות עתידיות, רק המיקום הנוכחי מתוך שלוש.
        */}
        {item.hasStanceLevels && (
          <span
            className="mx-2 inline-block translate-y-[-3px] rounded-lg px-2.5 py-1 align-middle text-xs font-bold"
            style={{
              background: "rgba(180,133,79,.12)",
              border: "1px solid rgba(180,133,79,.4)",
              color: "var(--wood-1)",
            }}
          >
            מנח {Math.min(item.stanceLevelCount, item.difficultyStep + 1)} מתוך{" "}
            {item.stanceLevelCount}
          </span>
        )}
      </h1>

      {/*
        המסגרת לא כופה צורה על הסרטון.
        קודם היא הייתה 16:9 והסרטון נמתח למלא אותה, כלומר נחתך. הקליפים
        מצולמים אנכית, ולכן מה שנשאר בפריים היה הפס האמצעי בלבד: שמיים,
        בלי הידיים ובלי הרגליים. עכשיו הסרטון שומר על הצורה שלו, אנכי או
        לרוחב, ורק הגובה מוגבל כדי שלא יבלע את המסך באמצע אימון.
      */}
      <div
        className={`relative mb-4 flex w-full items-center justify-center overflow-hidden rounded-3xl ${
          shownVideo ? "min-h-44" : ""
        } ${
          videoExpanded ? "fixed inset-3 z-[70] mb-0 bg-black" : ""
        }`}
        style={{
          background: "var(--video-bg)",
          border: "1px solid var(--line)",
        }}
      >
        {shownVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            // המפתח הוא מה שמחליף את הקליפ בפועל. שינוי src לבד לא טוען
            // מחדש סרטון שכבר מתנגן, והמתאמן היה מדליק את הגומייה ורואה
            // את אותה הדגמה.
            key={shownVideo}
            ref={videoRef}
            src={
              shownVideo.startsWith("http")
                ? shownVideo
                : `/videos/${encodeURIComponent(shownVideo)}`
            }
            poster={shownPoster ?? undefined}
            autoPlay
            // ההדגמות מצולמות בלי פסקול, והטלפון מונח על הרצפה באמצע סט.
            // צליל כאן רק היה מפתיע. ראה ההסבר על הרטט למעלה.
            muted
            loop
            playsInline
            preload="metadata"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (video.paused) void video.play().catch(() => {});
              else video.pause();
            }}
            onPlay={() => setVideoPaused(false)}
            onPause={() => setVideoPaused(true)}
            className={videoExpanded ? "max-h-full w-auto max-w-full" : "max-h-[52vh] w-auto max-w-full"}
          />
        ) : (
          <div className="flex w-full items-center gap-3 px-4 py-3 text-right">
            {/* טיימר מצויר במסגרת מרובעת. קודם ישב כאן משולש ▶ בתוך עיגול,
                כלומר תו יוניקוד בתפקיד גרפיקה ואייקון בעיגול. */}
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
              style={{
                background: "var(--wood-wash)",
                border: "1px solid var(--wood-border)",
              }}
              aria-hidden="true"
            >
              <FitayIcon name="timer" size={18} />
            </span>
            <div>
              <p className="text-sm font-bold">ההדגמה בדרך</p>
              <p className="text-xs" style={{ color: "var(--dim)" }}>אפשר להמשיך לפי הוראות הטכניקה.</p>
            </div>
          </div>
        )}
        {/*
          סימן ההמשך מופיע רק כשעצור, והוא לא מקבל אירועי עכבר: לחיצה
          עליו היא לחיצה על הסרטון שמתחתיו, ולכן ההמשך עובד גם כשמכוונים
          בדיוק אל הסימן. זה אותו סימן פליי שיש על תמונות החימום.
        */}
        {shownVideo && videoPaused && (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
            style={{ filter: "drop-shadow(0 2px 12px rgba(0,0,0,.85))" }}
          >
            <FitayIcon name="play" size={64} />
          </span>
        )}
        {shownVideo && (
          <div className="absolute bottom-3 left-3 right-3 flex justify-between gap-2">
            {/*
              ההדגמה רצה בלולאה, אבל הדפדפן עוצר אותה כשחוזרים מרקע או
              במצב חיסכון בסוללה, והמתאמן נשאר מול פריים קפוא בלי דרך
              להתחיל מחדש. הכפתור מחזיר להתחלה ומנגן.
            */}
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                video.currentTime = 0;
                void video.play().catch(() => {});
              }}
              className="rounded-xl bg-black/70 px-3 py-2 text-xs font-bold text-white"
            >
              הפעלה מחדש
            </button>
            <button
              type="button"
              onClick={() => setVideoExpanded(!videoExpanded)}
              className="rounded-xl bg-black/70 px-3 py-2 text-xs font-bold text-white"
            >
              {videoExpanded ? "סגירה" : "הגדלה"}
            </button>
          </div>
        )}
      </div>

      {/*
        האפשרות מופיעה רק בתרגילים שאושרו לשימוש בגומייה ב-FITAY.
        הסימון נשמר עם הסט, כדי שההשוואה לפעם הקודמת תהיה מדויקת:
        עשר חזרות עם גומייה אינן אותו הישג כמו עשר בלעדיה.
      */}
      {item.bandAllowed && (
        <div
          className="mb-4 rounded-2xl px-4 py-3"
          style={{
            background: banded ? "rgba(180,133,79,.18)" : "var(--surface-2)",
            border: `1px solid ${banded ? "rgba(224,190,147,.5)" : "var(--line)"}`,
          }}
        >
          {/*
            שני שלבים ולא אחד: קודם מפעילים שיש גומייה, ואז בוחרים
            רמה. בלי ההפרדה הזאת ברירת המחדל הייתה חייבת להיות רמה
            כלשהי, והמתאמן שלא משתמש בגומייה בכלל היה צריך ללחוץ
            כדי לבטל במקום שהמסך יתחיל נקי.
          */}
          <button
            type="button"
            onClick={() => {
              const next = !usingBand;
              setUsingBand(next);
              if (!next) setBandLevel(null);
            }}
            className="flex min-h-11 w-full items-center justify-between gap-3 text-right"
          >
            <span className={`shrink-0 transition-opacity ${usingBand ? "opacity-100" : "opacity-45"}`}>
              <FitayIcon name="band" size={28} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">גומייה</span>
              <span className="block text-xs" style={{ color: "var(--dim)" }}>
                {banded
                  ? `סימנת שהסט נעשה עם הגומייה ה${BAND_LABEL[bandLevel!]}`
                  : usingBand
                    ? "בוחרים איזו גומייה"
                    : "להפעיל כשמתאמנים עם גומייה"}
              </span>
            </span>
            <span
              className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
              style={{ background: usingBand ? "var(--wood-2)" : "var(--surface-3)" }}
            >
              <span
                className="absolute top-1 h-5 w-5 rounded-full transition-all"
                style={{
                  background: "var(--on-wood)",
                  insetInlineStart: usingBand ? "calc(100% - 1.5rem)" : "0.25rem",
                }}
              />
            </span>
          </button>

          {usingBand && (
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {BAND_LEVELS.map((level) => {
                const active = bandLevel === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBandLevel(active ? null : level.value)}
                    className="min-h-11 rounded-xl text-sm font-extrabold transition active:scale-[.97]"
                    style={{
                      background: active ? "var(--wood-2)" : "var(--surface-3)",
                      border: `1px solid ${
                        active ? "rgba(224,190,147,.5)" : "var(--line)"
                      }`,
                      color: active ? "var(--accent-contrast)" : "var(--dim)",
                    }}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* באימון התאוששות אין השוואות ואין הנחיות — רק תזכורת מה הוא. */}
      {recovery && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(107,143,181,.12)",
            border: "1px solid rgba(107,143,181,.34)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--rehab)" }}>
            אימון התאוששות
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--dim)" }}>
            חצי מהסטים, אותן חזרות. בלי השוואה לפעם הקודמת — היום מורידים
            עומס.
          </p>
        </div>
      )}

      {/* ההנחיה מהמנגנון: מה השתנה מאז האימון הקודם ואיך להתחיל היום */}
      {!recovery && item.advice && (
        <AdviceCard
          advice={item.advice}
          floor={item.floor}
          bandAllowed={item.bandAllowed}
          hasStanceLevels={item.hasStanceLevels}
        />
      )}

      <div className="glass mb-4 rounded-3xl p-6 text-center">
        <p className="mb-1 text-sm" style={{ color: "var(--dim)" }}>
          סט {set} מתוך {item.sets}
        </p>
        {/*
          הטווח הוא מפת דרכים, לא פקודה.
          קודם הוא הופיע כאן כטקסט גדול, "8 עד 15 חזרות", ומתחתיו בקלט
          הופיע היעד של היום. שני דברים נקראו כיעד והראו מספרים שונים,
          וזו בדיוק הכפילות שמבלבלת מתאמן שמסתכל על המסך לעשר שניות בין
          סטים. עכשיו הטווח הוא פס עם סמן, כלומר איפה אני על הסולם וכמה
          נשאר עד שהתרגיל מוקשה, והמספר בקלט נשאר ההוראה היחידה.
        */}
        {showRange && item.floor != null && ceiling != null ? (
          <RangeBar floor={item.floor} ceiling={ceiling} value={main} unit={unit} />
        ) : (
          <p className="mb-3 text-5xl font-extrabold wood-text"><Bidi text={target} /></p>
        )}
        <div className="text-xs" style={{ color: "var(--dim)" }}>
          <span className="inline-flex items-center gap-1">
            <span className="shrink-0 [&_circle]:!stroke-current [&_path]:!stroke-current">
              <FitayIcon name="timer" size={15} />
            </span>
            {/* "שניות" במלואו ולא "שנ׳". הקיצור נקרא במבט חטוף כמו "של",
                והמתאמן מסתכל על השורה הזאת לשנייה אחת בין סטים, מזיע,
                באור חזק. */}
            מנוחה {resting > 0 ? activeRestTotal : item.rest} שניות
          </span>
        </div>
        {/*
          שורת היעד: בשביל מה נלחמים בתרגיל הזה. אותו מקום בכל התרגילים,
          והתוכן לפי ציר ההתקדמות. הכל נתונים אמיתיים — התקרה מהתוכנית,
          הרצף מהמסד, וקצב הגדילה מקבועי המנגנון. באימון התאוששות אין
          שורה, כי הסטים המוקלים לא מזיזים שום שער.
        */}
        {goalLine && (
          <p
            className="mt-3 inline-block rounded-lg px-3 py-1.5 text-[13px] font-bold leading-snug"
            style={{
              background: "rgba(180,133,79,.12)",
              border: "1px solid rgba(180,133,79,.4)",
              color: "var(--wood-1)",
            }}
          >
            {goalLine}
          </p>
        )}
      </div>

      {currentExerciseLogs.length > 0 && (
        <LoggedSetsCard logs={currentExerciseLogs} item={item} />
      )}

      {item.unilateral && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(107,143,181,.12)",
            border: "1px solid rgba(107,143,181,.34)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--rehab)" }}>
            מתחילים מהצד החלש
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--dim)" }}>
            מתחילים בצד החלש, ורק אחר כך עוברים לצד החזק.
          </p>
        </div>
      )}

      {/*
        שורה אחת ולא שני כרטיסים. גריד סימטרי של שני כרטיסים זהים הוא
        בדיוק מה שגורם למסך להיקרא כתבנית, ושני המשטחים הצבועים האלה
        התחרו בכל השאר על אותה עין. הנתונים לא השתנו — רק ירדו הקופסאות.
      */}
      <div
        className="mb-5 flex items-stretch"
        style={{
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Chip label="גובה הטבעות" value={ringValue} />
        <span className="my-3 w-px shrink-0" style={{ background: "var(--line)" }} />
        {/*
          כאן ישב "מנח הגוף". הוא חזר על מה שכבר כתוב בתג הרמה שליד שם
          התרגיל, ובתרגילי מנח הוא גם הראה את נקודת הפתיחה ולא את המצב
          הנוכחי. הטווח הוא מה שהמתאמן באמת צריך לדעת מול הקלט.
        */}
        <Chip label={rangeLabel} value={rangeValue} />
      </div>

      {/*
        בתרגיל שאין לו רמות מנח, הגובה שרשום למעלה הוא זה שבתוכנית,
        כלומר נקודת הפתיחה. בלי השורה הזאת המתאמן היה מחזיר את הטבעות
        לגובה שכבר עבר. בתרגילי מנח השורה מיותרת: הגובה שם כבר מוצג
        כרמה הנוכחית ולא כמספר קבוע מהתוכנית.
      */}
      {item.difficultyStep > 0 && !item.hasStanceLevels && (
        <p className="-mt-2 mb-4 text-xs" style={{ color: "var(--faint)" }}>
          התרגיל עלה דרגה {item.difficultyStep === 1 ? "פעם אחת" : `${item.difficultyStep} פעמים`} מאז
          תחילת התוכנית. ממשיכים מהמצב הנוכחי. גובה הטבעות שרשום למעלה
          הוא נקודת הפתיחה.
        </p>
      )}

      {/*
        קודם ההדגש האישי ורק אחריו הטכניקה הקבועה. אם המאמן טרח לכתוב
        משהו לתרגיל הזה, זה הדבר שצריך להיקרא ראשון.
      */}
      {item.coachNote && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(180,133,79,.14)",
            border: "1px solid rgba(224,190,147,.32)",
          }}
        >
          <p className="mb-1 text-sm font-bold wood-text">הדגש מהמאמן</p>
          <p className="text-sm leading-relaxed">{item.coachNote}</p>
        </div>
      )}

      {/*
        שורות עם קו מפריד, בלי נקודות תבליט. נקודה לפני כל שורה היא שפת
        רשימה גנרית, ובאפליקציה הזאת רשימה היא שורות בכרטיס אחד עם קווים
        דקים — בדיוק כמו ארבעת הכללים במסך המדריך.
      */}
      {item.technique.length > 0 && (
        <div className="glass mb-4 overflow-hidden rounded-3xl px-5 py-1">
          <p className="pb-3 pt-4 text-sm font-bold wood-text">טכניקה</p>
          <ul>
            {item.technique.map((t, i) => (
              <li
                key={i}
                className="py-3 text-sm leading-relaxed"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resting > 0 ? (
        <div className="glass rounded-3xl px-5 py-4 text-center">
          <p className="font-bold">מנוחה פעילה</p>
          <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
            הטיימר והפעולות זמינים בתחתית המסך.
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl p-5">
          {/*
            הכותרת אומרת מה שהמספר שמתחתיה באמת אומר.
            קודם נשאל כאן "כמה עשית בפועל?" בזמן שהשדה היה מלא מראש, ואז
            השאלה והמספר סתרו זה את זה. מתאמן מזיע עם טלפון ביד לא פותר
            סתירות, הוא מאשר. עכשיו הכותרת היא היעד, ושורת המשנה היא זו
            שמטילה את חובת הדיווח כשיצא אחרת.
          */}
          <p className="mb-3 text-base font-black">
            כמה {unit} בסט הזה
          </p>

          {item.unilateral ? (
            <div className="space-y-3">
              <Stepper
                label={`צד חלש · ${unit}`}
                value={main}
                onChange={changeMain}
                muted={!mainTouched}
              />
              <Stepper
                label={`צד חזק · ${unit}`}
                value={strong}
                onChange={changeStrong}
                muted={!strongTouched}
                hint="אותו מספר כמו בצד החלש. שנה רק אם יצא אחרת."
              />
            </div>
          ) : (
            <Stepper
              /*
                בלי תווית יחידה. הכותרת שמעל כבר אומרת "כמה חזרות בסט
                הזה", ומילה שחוזרת מיד מתחתיה היא רעש. בתרגיל חד־צדדי
                התוויות נשארות, כי שם הן אומרות איזה צד ולא איזו יחידה.
              */
              value={main}
              onChange={changeMain}
              muted={!mainTouched}
            />
          )}
        </div>
      )}
      {resting > 0 ? (
        <RestActionBar
          remaining={resting}
          total={activeRestTotal}
          onAdjust={adjustRest}
          onSkip={skipRest}
          voiceOn={voiceOn}
          onToggleVoice={toggleVoice}
        />
      ) : (
        <WorkActionBar
          setNumber={set}
          totalSets={item.sets}
          finalSet={isLastSet && isLastExercise}
          onSave={saveSet}
        />
      )}
    </Shell>
  );
}

/**
 * ההנחיה מהמנגנון, מנוסחת למתאמן. עלייה בדרגה נראית כמו הישג כי היא
 * הישג: הוא עבר את התקרה בכל הסטים. ירידה מנוסחת כחלק מהדרך, לא ככישלון.
 */
function AdviceCard({
  advice,
  floor,
  bandAllowed,
  hasStanceLevels,
}: {
  advice: Advice;
  floor: number | null;
  bandAllowed: boolean;
  hasStanceLevels: boolean;
}) {
  /*
   * הניסוח כאן נבדק על שחקן כדורגל, לא על מי שכתב את המנגנון. "עברת את
   * התקרה" ו"תחתית הטווח" הם מונחים של הקוד, והוחלפו במספרים ובפעולות:
   * מה הצלחת, ומה בדיוק לעשות עכשיו.
   */
  const fromFloor = floor != null ? ` ומתחילים היום מ-${floor}` : " ומתחילים היום ממספר נמוך יותר";
  const content =
    advice === "harder"
      ? hasStanceLevels
        ? {
            title: "נפתחה רמת מנח חדשה",
            body: `הגעת ליעד בכל הסטים פעמיים ברצף, והמנח הבא מחכה לך. צופים בסרטון החדש לפני שמתחילים${fromFloor}.`,
          }
        : {
          title: "עלית דרגה",
          body: `בפעם הקודמת הגעת ליעד בכל הסטים, אז התרגיל כבר קל לך. מנמיכים את הטבעות או מגדילים את השיפוע,${fromFloor}. זה ירגיש קשה יותר, וזו בדיוק המטרה.`,
        }
      : advice === "drop-band"
        ? {
            title: "עלית דרגה",
            body: `בפעם הקודמת הגעת ליעד בכל הסטים עם גומייה. היום מנסים בלי הגומייה,${fromFloor}.`,
          }
        : {
            title: "מטפסים מחדש",
            body: `כמה אימונים בלי התקדמות, וזה קורה לכולם.${floor != null ? ` מתחילים היום מ-${floor}` : " מתחילים היום ממספר נמוך יותר"} ועולים בהדרגה מאימון לאימון.${bandAllowed ? " אפשר גם להיעזר בגומייה." : ""}`,
          };

  return (
    <div
      className="mb-4 rounded-3xl px-5 py-4"
      style={{
        background: "rgba(180,133,79,.16)",
        border: "1px solid rgba(224,190,147,.4)",
      }}
    >
      <p className="mb-1 text-sm font-bold wood-text">{content.title}</p>
      <p className="text-sm leading-relaxed">{content.body}</p>
    </div>
  );
}

/**
 * טווח העבודה כפס: מהתחתית אל התקרה, עם סמן במקום שבו יושב המספר של היום.
 *
 * בלי המילה יעד ובלי מספר גדול. התפקיד היחיד שלו הוא להראות למתאמן שהוא
 * בדרך וכמה מדרגות נשארו עד שהתרגיל מוקשה.
 */
function RangeBar({
  floor,
  ceiling,
  value,
  unit,
}: {
  floor: number;
  ceiling: number;
  value: number;
  unit: string;
}) {
  const span = Math.max(1, ceiling - floor);
  const ratio = Math.min(1, Math.max(0, (value - floor) / span));

  return (
    <div className="mb-4">
      {/*
        המילוי מתחיל מימין, שהוא צד התחתית בכיוון הקריאה, ומתקדם שמאלה
        אל התקרה. המיקום פיזי בכוונה, כדי שהוא לא יתהפך עם הכיוון.
      */}
      <div
        className="relative mx-auto h-2 w-full max-w-60 rounded-full"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="wood absolute inset-y-0 rounded-full"
          style={{ right: 0, width: `${ratio * 100}%` }}
        />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full"
          style={{
            right: `${ratio * 100}%`,
            background: "var(--surface)",
            border: "2px solid var(--wood-1)",
          }}
        />
      </div>
      <div
        className="mx-auto mt-2.5 flex w-full max-w-60 justify-between text-xs tabular-nums"
        style={{ color: "var(--faint)" }}
      >
        <span>{floor}</span>
        <span>
          {ceiling} {unit}
        </span>
      </div>
    </div>
  );
}

function LoggedSetsCard({ logs, item }: { logs: LoggedSet[]; item: Item }) {
  const setNumbers = [...new Set(logs.map((log) => log.setNumber))].sort((a, b) => a - b);
  const unit = logsReps(item.type) ? "" : " שניות";

  return (
    <div className="glass mb-4 rounded-3xl p-5">
      <p className="pb-3 pt-1 text-sm font-bold">הסטים שכבר עשית</p>
      <ol>
        {setNumbers.map((number) => {
          const rows = logs.filter((log) => log.setNumber === number);
          const values = rows.map((row) => {
            const value = logsReps(item.type) ? row.reps ?? 0 : row.seconds ?? 0;
            return `${value}${row.banded ? "*" : ""}`;
          });
          // רמת הגומייה נאמרת בשם ולא רק בכוכבית, כדי שהמתאמן יראה בסוף
          // האימון באיזו גומייה עשה כל סט.
          const level = rows.find((row) => row.bandLevel)?.bandLevel ?? null;
          return (
            /* שורות עם קו מפריד, כמו כל רשימה אחרת באפליקציה. */
            <li
              key={number}
              className="flex items-baseline justify-between gap-3 py-3 text-sm"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <span style={{ color: "var(--faint)" }}>סט {number}</span>
              <span className="text-base font-black tabular-nums" style={{ color: "var(--wood-1)" }}>
                <Bidi
                  text={`${values.join(item.unilateral ? " / " : "")}${unit}${
                    rows.some((row) => row.banded)
                      ? level
                        ? `  (* גומייה ${BAND_LABEL[level]})`
                        : "  (* עם גומייה)"
                      : ""
                  }`}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function WorkActionBar({
  setNumber,
  totalSets,
  finalSet,
  onSave,
}: {
  setNumber: number;
  totalSets: number;
  finalSet: boolean;
  onSave: () => void;
}) {
  return (
    /*
      צמוד לתחתית המסך, כמו סרגל הלשוניות.

      קודם הסרגל ריחף: ריווח מהצדדים ומלמטה, ופינות מעוגלות מכל
      הכיוונים, כך שנראתה מתחתיו רצועה שקופה שדרכה נראה הדף. אביב
      ביקש שיתנהג כמו הלשוניות — רוחב מלא, נשען על התחתית, וריווח
      פנימי בגובה האזור הבטוח כדי שלא יישב על פס הבית של האייפון.
    */
    <div
      className="under-overlay fixed inset-x-0 bottom-0 z-50"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
        <span className="shrink-0 text-sm font-bold" style={{ color: "var(--dim)" }}>
          <Bidi text={`סט ${setNumber}/${totalSets}`} />
        </span>
        {/*
          עץ אמיתי, אותו נכס בדיוק שנמצא בסף הכניסה לאימון במסך הבית.
          לוחצים על עץ כדי להיכנס לאימון, ולוחצים על עץ כדי לסגור סט —
          ושתי הפעולות הראשיות של המוצר מדברות באותה שפה.
          הצעיף מגיע ממשתנה תלוי מצב, כי במצב בהיר אותו ערך הופך את
          הכפתור לפס כהה במקום לקרש עץ.
        */}
        <button
          type="button"
          onClick={onSave}
          className="min-h-14 flex-1 overflow-hidden rounded-2xl px-4 text-lg font-black"
          style={{
            background: "var(--wood-band-veil), url('/wood-band.jpg') center/cover",
            border: "1px solid var(--wood-border-light)",
            color: "#fff6e8",
            textShadow: "0 1px 2px rgba(28,16,5,.85), 0 0 14px rgba(28,16,5,.55)",
          }}
        >
          {finalSet ? "סיום האימון" : "סיימתי את הסט"}
        </button>
      </div>
    </div>
  );
}

function RestActionBar({
  remaining,
  total,
  onAdjust,
  onSkip,
  voiceOn,
  onToggleVoice,
}: {
  remaining: number;
  total: number;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
  voiceOn: boolean;
  onToggleVoice: () => void;
}) {
  const progress = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
  return (
    /*
      צמוד לתחתית המסך, כמו סרגל הלשוניות.

      קודם הסרגל ריחף: ריווח מהצדדים ומלמטה, ופינות מעוגלות מכל
      הכיוונים, כך שנראתה מתחתיו רצועה שקופה שדרכה נראה הדף. אביב
      ביקש שיתנהג כמו הלשוניות — רוחב מלא, נשען על התחתית, וריווח
      פנימי בגובה האזור הבטוח כדי שלא יישב על פס הבית של האייפון.
    */
    <div
      className="under-overlay fixed inset-x-0 bottom-0 z-50"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto w-full max-w-md px-4 py-3">
        <div className="mb-2.5 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
          <div className="wood h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        {/*
          שתי שורות ולא אחת.
          חמישה פקדים בשורה אחת על מסך טלפון דחסו את "דילוג" לרצועה של
          כמה פיקסלים בקצה, חתוכה באמצע המילה. זו הפעולה הכי נפוצה בזמן
          מנוחה, והיא הייתה הכפתור הכי קטן בסרגל. עכשיו היא שורה משל
          עצמה ברוחב מלא, והשעון והכוונון יושבים מעליה.
        */}
        <div className="mb-2.5 flex items-center gap-2">
          <div className="min-w-20 text-center">
            <p className="flex items-center justify-center gap-1 text-2xl font-extrabold tabular-nums">
              <FitayIcon name="timer" size={20} />
              {mmss(remaining)}
            </p>
            <p className="text-xs" style={{ color: "var(--dim)" }}>מתוך {mmss(total)}</p>
          </div>
          <button
            type="button"
            onClick={onToggleVoice}
            aria-pressed={voiceOn}
            aria-label={voiceOn ? "כיבוי הקול של הטיימר" : "הדלקת הקול של הטיימר"}
            className="grid min-h-11 flex-1 place-items-center rounded-xl px-3"
            style={{
              border: "1px solid var(--line)",
              background: voiceOn ? "var(--surface-2)" : "transparent",
              color: voiceOn ? "var(--wood-1)" : "var(--dim)",
            }}
          >
            <span className={voiceOn ? "opacity-100" : "opacity-45"}>
              <FitayIcon name={voiceOn ? "voice" : "voiceOff"} size={20} />
            </span>
          </button>
          <button type="button" onClick={() => onAdjust(15)} className="min-h-11 flex-1 rounded-xl px-3 font-bold" style={{ border: "1px solid var(--line)" }}>+15</button>
          <button type="button" onClick={() => onAdjust(-15)} className="min-h-11 flex-1 rounded-xl px-3 font-bold" style={{ border: "1px solid var(--line)" }}>−15</button>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-12 w-full rounded-xl px-3 text-base font-extrabold"
          style={{ background: "var(--surface-2)", color: "var(--wood-1)", border: "1px solid var(--line)" }}
        >
          דילוג על המנוחה
        </button>
      </div>
    </div>
  );
}

/**
 * סרטון חימום שלחיצה עליו עוצרת וממשיכה.
 *
 * הוא לא היה מגיב ללחיצה בכלל: אין לו controls של הדפדפן ולא היה לו
 * מטפל לחיצה, כלומר מתאמן שרצה להסתכל על פרט באמצע תנועה לא יכול היה
 * לעצור. הנגן הראשי קיבל את אותה מחווה, ושם היא מנוהלת בתוך הרכיב
 * הגדול כי היא חולקת ref עם כפתור ההפעלה מחדש. כאן אין מה לחלוק.
 */
function TapToPauseVideo({ src, poster }: { src: string; poster?: string }) {
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLVideoElement | null>(null);
  return (
    <span className="relative flex w-full items-center justify-center">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onClick={() => {
          const video = ref.current;
          if (!video) return;
          if (video.paused) void video.play().catch(() => {});
          else video.pause();
        }}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        className="max-h-[46vh] w-auto max-w-full"
      />
      {paused && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
          style={{ filter: "drop-shadow(0 2px 12px rgba(0,0,0,.85))" }}
        >
          <FitayIcon name="play" size={56} />
        </span>
      )}
    </span>
  );
}

function Stepper({
  label,
  value,
  onChange,
  muted,
  hint,
}: {
  label?: string;
  value: number;
  onChange: (n: number) => void;
  /**
   * המספר עדיין הצעה של האפליקציה, ולכן הוא מוצג עמום.
   *
   * זו המוסכמה של ערך מוצע בטופס: אפור עד שנוגעים, מלא אחרי. היא מבדילה
   * בין יעד לתוצאה בלי מילה נוספת, ובלי להכניס שפה חדשה למסך.
   */
  muted?: boolean;
  hint?: string;
}) {
  return (
    <div>
      {label && (
        <p className="mb-1.5 text-xs" style={{ color: "var(--dim)" }}>
          {label}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <StepButton onClick={() => onChange(Math.max(0, value - 1))}>−</StepButton>
        <div
          className="flex-1 rounded-2xl py-3 text-center text-3xl font-extrabold tabular-nums"
          style={{
            background: "rgba(180,133,79,.14)",
            border: "1px solid rgba(224,190,147,.28)",
            // הרישום נעשה בחוץ ולפעמים בשמש, ולכן העמעום הוא בגוון
            // המשני של המסך ולא בשקיפות שהייתה מוחקת את המספר.
            color: muted ? "var(--dim)" : "var(--wood-1)",
          }}
        >
          {value}
        </div>
        <StepButton onClick={() => onChange(value + 1)}>+</StepButton>
      </div>
      {hint && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--faint)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function StepButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-14 w-14 shrink-0 rounded-2xl text-2xl font-bold"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        color: "var(--wood-1)",
      }}
    >
      {children}
    </button>
  );
}

function WarmupScreen({
  warmup,
  workoutTitle,
  programTitle,
  phase,
  recovery,
  onStart,
}: {
  warmup: WarmupItem[];
  workoutTitle: string;
  programTitle: string;
  phase: number;
  recovery: boolean;
  onStart: () => void;
}) {
  /** מזהה התרגיל שההדגמה שלו פתוחה. null כשכולן סגורות. */
  const [openVideo, setOpenVideo] = useState<string | null>(null);

  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between">
        <BackLink href="/client">יציאה מהאימון</BackLink>
        <span className="text-sm" style={{ color: "var(--dim)" }}>
          שלב {phase}
        </span>
      </div>

      <p className="text-xs" style={{ color: "var(--dim)" }}>
        {programTitle} · {workoutTitle}
      </p>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">חימום</h1>
      {/*
        פסקת ההסבר ירדה. הכותרת אומרת "חימום", הרשימה מתחתיה אומרת מה
        עושים, והכפתור בתחתית אומר מתי נגמר. משפט שמסביר את שלושתם הוא
        ממשק שמתנצל.
      */}
      <div className="mb-6" />

      {recovery && (
        <div
          className="mb-5 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(107,143,181,.12)",
            border: "1px solid rgba(107,143,181,.34)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--rehab)" }}>
            היום אימון התאוששות
          </p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--dim)" }}>
            אותם תרגילים עם חצי מהסטים. הגוף בונה שריר דווקא בהורדת העומס
            הזאת, אז לא מדלגים עליה גם כשמרגישים טוב.
          </p>
        </div>
      )}

      {/*
        שורה אחת נפתחת בכל רגע. שישה קליפים שרצים יחד היו מבזבזים סוללה
        וגלישה על מסך שהמתאמן עובר בו בדקה, והוא ממילא מסתכל על תרגיל
        אחד בכל פעם.
      */}
      {/*
        רשימה ריקה פירושה שהמאמן הוציא את כל תרגילי החימום. אז אין כרטיס
        בכלל, ולא קופסה ריקה שנראית כמו טעינה שנתקעה.
      */}
      {warmup.length > 0 && (
      <div className="glass mb-5 rounded-3xl p-2">
        {warmup.map((w, i) => {
          const open = openVideo === w.id;
          /*
            מילים ולא סימן כפל.

            "2 × 10" לא אומר אם אלה שני סטים של עשר או עשרה של שניים,
            ובעברית המספרים משני צידי הסימן גם מתהפכים בעין. אביב נתקל
            בזה באימון אמיתי. הניסוח כאן הוא הסדר שבו מאמן אומר את זה
            בקול: קודם כמה, ואז בכמה סטים.
          */
          const amount =
            w.reps != null ? `${w.reps} חזרות` : `${w.seconds} שניות`;
          const reps = `${amount} · ${w.sets === 1 ? "סט אחד" : `${w.sets} סטים`}`;
          return (
            <div
              key={w.id}
              /*
                ריווח גדול יותר וקו בגוון עץ. שורה עם תמונה מקדימה גבוהה
                משורה בלעדיה, ובקו דק אפור השתיים נשפכו זו לזו.
              */
              className="px-3.5 py-5"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--wood-border)" }}
            >
              {/*
                תמונה מהסרטון, ולא כפתור טקסט.

                קודם ישבה כאן תגית קטנה שכתוב עליה "צפייה בהדגמה", והיא
                נראתה כמו תווית ולא כמו משהו שנפתח. אביב בדק את זה
                באימון אמיתי ואמר שלא מבינים ממנה שככה פותחים סרטון.

                פריים מהסרטון עצמו אומר "יש כאן וידאו" בלי מילה אחת,
                והוא גם מראה מראש מה עומד להיפתח. השורה כולה לחיצה, כדי
                שלא יהיה שטח קטן לפספס בזמן שהטלפון על הרצפה.
              */}
              {w.videoFile ? (
                <button
                  type="button"
                  onClick={() => setOpenVideo(open ? null : w.id)}
                  className="flex w-full items-center gap-3 text-right"
                >
                  <span
                    className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl"
                    style={{
                      background: "var(--video-bg)",
                      border: "1px solid var(--wood-border)",
                    }}
                    aria-hidden="true"
                  >
                    {w.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={w.posterUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{ opacity: open ? 0.35 : 0.72 }}
                      />
                    ) : null}
                    {/*
                      סימן ההפעלה על גבי הפריים. בלי סימן, תמונה מקדימה
                      נראית כתמונה ואי אפשר לדעת שהיא נפתחת. הטקסט שהיה
                      כאן קודם חזר בכל שורה ולכן ירד, וסימן אחד אומר את
                      אותו דבר בלי לחזור על עצמו.
                    */}
                    <span className="relative" aria-hidden="true">
                      <FitayIcon name={open ? "ring" : "play"} size={30} />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-bold">{w.name}</span>
                      <span
                        className="shrink-0 text-sm tabular-nums"
                        style={{ color: "var(--wood-1)" }}
                      >
                        <Bidi text={reps} />
                      </span>
                    </span>
                    <span
                      className="mt-0.5 block text-xs leading-relaxed"
                      style={{ color: "var(--dim)" }}
                    >
                      {w.technique[0]}
                    </span>
                  </span>
                </button>
              ) : (
                /*
                  אותה הזחה כמו שורה עם תמונה, עם מקום ריק במקומה.
                  בלי זה חלק מהשורות מתחילות במקום אחד וחלק באחר,
                  והרשימה נקראת מרופטת. מקום שמור ולא קופסה ריקה:
                  ריבוע מצויר בלי תוכן היה מבטיח סרטון שאין.
                */
                <div className="flex items-center gap-3">
                  <span className="h-14 w-14 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-bold">{w.name}</p>
                      <p
                        className="shrink-0 text-sm tabular-nums"
                        style={{ color: "var(--wood-1)" }}
                      >
                        <Bidi text={reps} />
                      </p>
                    </div>
                    <p
                      className="mt-0.5 text-xs leading-relaxed"
                      style={{ color: "var(--dim)" }}
                    >
                      {w.technique[0]}
                    </p>
                  </div>
                </div>
              )}

              {w.videoFile && (
                <>

                  {open && (
                    <div
                      className="mt-3 flex w-full items-center justify-center overflow-hidden rounded-2xl"
                      style={{
                        background: "var(--video-bg)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      <TapToPauseVideo
                        src={
                          w.videoFile.startsWith("http")
                            ? w.videoFile
                            : `/videos/${encodeURIComponent(w.videoFile)}`
                        }
                        poster={w.posterUrl ?? undefined}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/*
        שורות עם קו מפריד, בלי נקודות תבליט.

        נקודה לפני כל שורה היא שפת רשימה גנרית, ובאפליקציה הזאת רשימה
        היא שורות בכרטיס אחד עם קווים דקים. בדיוק כמו ארבעת הכללים
        במסך המדריך, שזה ממילא אותו תוכן.
      */}
      <button
        type="button"
        onClick={onStart}
        className="wood w-full rounded-2xl py-5 text-xl font-extrabold"
        style={{
          color: "var(--on-wood)",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        סיימתי את החימום
      </button>
    </Shell>
  );
}

/**
 * חצי שורה: תווית קטנה ומעליה הערך. בלי מילוי ובלי מסגרת משלו.
 *
 * הערך עובר ב-Bidi. מאז שהטווח יושב כאן הערך יכול להיות "6–10", ומספרים
 * עם מקף בתוך פסקה בעברית מתהפכים ונקראים "10–6".
 */
function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-4 py-3.5 text-center">
      <p className="text-xs" style={{ color: "var(--faint)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-lg font-black" style={{ color: "var(--wood-1)" }}>
        <Bidi text={value} />
      </p>
    </div>
  );
}

function FinishScreen({
  programId,
  workoutId,
  recovery,
  durationSec,
  logs,
  items,
  onSaved,
}: {
  programId: string;
  workoutId: string;
  recovery: boolean;
  durationSec: number;
  logs: LoggedSet[];
  items: Item[];
  onSaved: () => void;
}) {
  const [mood, setMood] = useState("");
  const [pain, setPain] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const totalReps = logs.reduce((sum, l) => sum + (l.reps ?? 0), 0);
  const totalSeconds = logs.reduce((sum, l) => sum + (l.seconds ?? 0), 0);
  const comparisons = items.map((item) => {
    const currentRows = logs.filter(
      (log) => log.workoutItemId === item.id && log.side !== "strong"
    );
    const current = currentRows.reduce(
      (sum, log) => sum + (logsReps(item.type) ? log.reps ?? 0 : log.seconds ?? 0),
      0
    );
    const currentBanded = currentRows.some((log) => log.banded);
    const previous = item.last?.total ?? null;
    const comparable = previous != null && currentBanded === Boolean(item.last?.anyBanded);
    return { item, current, previous, comparable, delta: previous == null ? null : current - previous };
  });

  /*
   * מה המנגנון החליט, כפי שהשרת החזיר.
   *
   * כאן ישב קודם חישוב מקומי שחיקה את הכללים של progression.ts והציג
   * "עלית דרגה" לפני שהאימון בכלל נשמר, כלומר הבטיח למתאמן עלייה שהשרת
   * לא ביצע עדיין. עכשיו ההודעה מגיעה רק אחרי השמירה, ישר מהתשובה.
   */
  const [outcome, setOutcome] = useState<Record<string, string> | null>(null);

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setError("");
    setBusy(true);
    /*
     * הרשת נופלת בחצר, וזה המקום היחיד באפליקציה שבו נפילה כזאת מוחקת
     * אימון שלם. בלי התפיסה הזאת הכפתור נשאר על "שומר…" בלי הודעה, בלי
     * דרך לנסות שוב, והמתאמן סוגר את המסך והרישום הולך.
     */
    let res: Response;
    try {
      res = await fetch("/api/client/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          workoutId,
          durationSec,
          mood,
          painLevel: pain,
          notes: notes.trim(),
          setLogs: logs,
          idempotencyKey: idempotencyKey.current,
        }),
      });
    } catch {
      setError("אין חיבור לרשת. כדאי להישאר במסך הזה ולנסות שוב עוד רגע.");
      setBusy(false);
      saving.current = false;
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      setBusy(false);
      saving.current = false;
      return;
    }
    const progression = (data?.progression ?? {}) as Record<string, string>;
    if (Object.keys(progression).length > 0) {
      setOutcome(progression);
      setBusy(false);
      return;
    }
    onSaved();
  }

  if (outcome) {
    return (
      <ProgressionResult outcome={outcome} items={items} onDone={onSaved} />
    );
  }

  return (
    <Shell>
      <div className="pt-8 text-center">
        <div className="mb-2 flex justify-center" aria-hidden="true">
          <FitayIcon name="ring" size={64} />
        </div>
        <h1 className="mb-1 text-3xl font-bold">אימון הושלם</h1>
        <p className="mb-8 text-sm" style={{ color: "var(--dim)" }}>
          {mmss(durationSec)} דקות
        </p>
      </div>

      {/*
        הסיכום כשורת מספרים על הדף, בלי כרטיס.
        קודם הוא היה הכרטיס הראשון מתוך חמישה מוערמים, וזה מה שהפך את
        המסך לערימה. וגם: "0 שניות בהחזקות" הוצג גם באימון שאין בו אף
        החזקה — מספר אפס הוא רעש, לא נתון.
      */}
      <div className="mb-7 flex items-stretch">
        <div className="flex-1 px-3 text-center">
          <b className="block text-3xl font-black wood-text tabular-nums leading-none">
            {totalReps}
          </b>
          <span className="mt-1.5 block text-xs" style={{ color: "var(--faint)" }}>
            חזרות סה״כ
          </span>
        </div>
        {totalSeconds > 0 && (
          <>
            <span className="w-px shrink-0" style={{ background: "var(--line)" }} />
            <div className="flex-1 px-3 text-center">
              <b className="block text-3xl font-black tabular-nums leading-none">
                {totalSeconds}
              </b>
              <span className="mt-1.5 block text-xs" style={{ color: "var(--faint)" }}>
                שניות בהחזקות
              </span>
            </div>
          </>
        )}
      </div>

      {recovery ? (
        <div className="glass mb-4 rounded-3xl p-5">
          <p className="mb-1 font-bold" style={{ color: "var(--rehab)" }}>
            אימון התאוששות הושלם
          </p>
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            אימון מוקל לא נכנס להשוואות. באימון המלא הבא ממשיכים מאיפה
            שעצרת.
          </p>
        </div>
      ) : (
        <div className="glass mb-4 overflow-hidden rounded-3xl px-5">
          <div className="flex items-center gap-3 pb-3 pt-5">
            <p className="shrink-0 text-sm font-black">
              לעומת <span className="wood-text">הפעם הקודמת</span>
            </p>
            <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/40 to-transparent" />
          </div>
          {/*
            טור מספרים שאפשר לסרוק, ולא מחרוזת אחת ארוכה בכל שורה.
            קודם כל שורה הייתה "24 · קודם 21" בזהב — המספר של היום והמספר
            של הפעם הקודמת נראו זהים במשקל, והעין לא ידעה על מה להסתכל.
            עכשיו: מה שעשית היום גדול ובזהב, ומה שהיה קודם קטן ודהוי מתחתיו.
          */}
          <div>
            {comparisons.map(({ item, current, previous, comparable, delta }) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 py-3"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {item.name}
                </span>
                <span className="shrink-0 text-left">
                  <b
                    className="block text-xl font-black leading-none tabular-nums"
                    style={{ color: "var(--wood-1)" }}
                  >
                    {current}
                  </b>
                  <span
                    className="mt-1 block text-[11px] leading-none"
                    style={{ color: "var(--faint)" }}
                  >
                    {previous == null
                      ? "פעם ראשונה"
                      : !comparable
                        ? "בלי השוואה ישירה"
                        : delta === 0
                          ? "כמו קודם"
                          : `קודם ${previous}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {comparisons.some((entry) => entry.previous != null && !entry.comparable) && (
            <p
              className="py-3 text-xs leading-5"
              style={{ borderTop: "1px solid var(--line)", color: "var(--faint)" }}
            >
              כשהשימוש בגומייה השתנה, ההשוואה אינה ישירה.
            </p>
          )}
          <div className="pb-2" />
        </div>
      )}

      {/*
        מה שלא נבחר הוא טיפוגרפיה, מה שנבחר הוא עץ.
        קודם שלוש האפשרויות היו שלושה כרטיסים ממוסגרים זהים — גריד סימטרי,
        בדיוק מה שהופך מסך לתבנית. מסגרת סביב כל אפשרות גם לא מוסיפה כלום:
        שלוש מילים בשורה אחת כבר נקראות כבחירה.
      */}
      {/*
        שלושת האזורים — תחושה, כאב והערה — בפאנל אחד עם קווי הפרדה,
        ולא שלושה כרטיסים מוערמים. שלוש שאלות למתאמן הן רצף אחד של
        דיווח, לא שלושה עצמים נפרדים, וערימת כרטיסים היא בדיוק מה
        שהופך מסך לתבנית.
      */}
      <div className="glass mb-4 overflow-hidden rounded-3xl px-5">
        {/*
          כותרת בשפת הכותרות של האפליקציה: מילה בזהב וקו שנמוג. שלוש
          השאלות כאן ישבו תחת כותרות שחורות זהות עם קו דק ביניהן, והכל
          נקרא כטופס אחד ארוך בלי לדעת איפה שאלה נגמרת.
        */}
        <div className="flex items-center gap-3 pb-3 pt-5">
          <p className="wood-text shrink-0 text-base font-black">איך הרגשת</p>
          <span
            className="h-px flex-1"
            style={{
              background:
                "linear-gradient(to left, var(--wood-border), transparent)",
            }}
          />
        </div>
        {/*
          פקד מקוטע אחד ולא שלוש מילים חשופות.

          קודם היו כאן שלוש מילים בלי מסגרת ובלי רקע, ואי אפשר היה לדעת
          שצריך ללחוץ עליהן. זו בדיוק הצורה של SegmentedTabs שכבר קיימת
          באפליקציה: מיכל ממוסגר אחד, תאים בפנים, והנבחר מתמלא בעץ.
          עצם אחד, לא שלוש קופסאות.
        */}
        <div
          className="mb-5 grid grid-cols-3 gap-1 rounded-2xl p-1"
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
        >
          {["קל", "מתאים", "קשה"].map((m, index) => (
            <button
              type="button"
              key={m}
              onClick={() => setMood(m)}
              aria-pressed={mood === m}
              className="min-h-12 rounded-xl text-base font-black transition-colors"
              /*
                קו מפריד בין תא לתא. בלעדיו שלוש המילים נקראות כשורה
                אחת ולא כשלוש אפשרויות לבחור ביניהן. הקו יורד מהתא
                שנבחר, כי המילוי כבר מפריד אותו משכניו, וגם מהשכן
                שמימינו כדי שלא יישאר קו תלוי לצד המילוי.
              */
              style={{
                ...(mood === m
                  ? { background: "var(--wood-2)", color: "var(--accent-contrast)" }
                  : { background: "transparent", color: "var(--dim)" }),
                borderInlineStart:
                  index === 0 ||
                  mood === m ||
                  mood === ["קל", "מתאים", "קשה"][index - 1]
                    ? "none"
                    : "1px solid var(--line)",
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/*
          דיווח כאב פתוח לכל מתאמן, ולא רק למי שסומן במצב שיקום.
          קודם זה היה מוסתר מאחורי מתג שהמאמן היה צריך להדליק, כלומר מתאמן
          שנפצע באמצע תוכנית לא היה לו איפה להגיד את זה. עכשיו זה כאן תמיד,
          לא חובה, ומי שלא לוחץ פשוט לא מדווח.
        */}
        <div className="pt-5" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="flex items-center gap-3 pb-2">
          <p className="wood-text shrink-0 text-base font-black">משהו כאב</p>
          <span
            className="h-px flex-1"
            style={{
              background:
                "linear-gradient(to left, var(--wood-border), transparent)",
            }}
          />
        </div>
        <p className="mb-3 text-xs leading-5" style={{ color: "var(--faint)" }}>
          לא חובה, רק אם היה כאב. 0 הוא בלי כאב ו-10 הוא כאב חזק. הדיווח
          יופיע ב-FITAY.
        </p>
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--faint)" }}>
          <span>0 · בלי כאב</span>
          <span>10 · כאב חזק</span>
        </div>
        {/*
          אותו מיכל ממוסגר של התחושה. אחד עשר מספרים חשופים לא נראים
          כמו משהו שלוחצים עליו, ואחד עשר ריבועים ממוסגרים היו קיר של
          קופסאות. מיכל אחד עם תאים בפנים פותר את שניהם.
        */}
        <div
          className="grid grid-cols-6 gap-1 rounded-2xl p-1"
          dir="rtl"
          aria-label="סולם כאב מ-0 עד 10"
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
        >
          {Array.from({ length: 11 }, (_, n) => (
            <button
              type="button"
              key={n}
              // לחיצה שנייה על אותו מספר מבטלת. אחרת מי שלחץ בטעות
              // נשאר עם דיווח כאב שהוא לא התכוון לשלוח.
              onClick={() => setPain(pain === n ? null : n)}
              /* אותה שפה של הלוח החודשי: מספר רגיל הוא ספרה בלבד, והבחירה
                 היא הדבר היחיד עם מילוי. אחד עשר ריבועים ממוסגרים בשתי
                 שורות נראו כמו קיר של קופסאות. */
              className="min-h-11 min-w-0 rounded-xl px-1 text-base font-black transition-colors"
              /*
                אותם קווים מפרידים כמו בשורת התחושה. הקו נעלם בתחילת
                כל שורה של שישה, וגם משני צידי המספר שנבחר.
              */
              style={{
                ...(pain === n
                  ? { background: "var(--wood-2)", color: "var(--accent-contrast)" }
                  : { background: "transparent", color: "var(--dim)" }),
                borderInlineStart:
                  n % 6 === 0 || pain === n || pain === n - 1
                    ? "none"
                    : "1px solid var(--line)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
        </div>

        {/* "קל/בול/קשה" לא מספיק כדי לתקן תרגיל. כאן נכנס מה שבאמת קרה. */}
        <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="flex items-center gap-3 pb-2">
          <p className="wood-text shrink-0 text-base font-black">הערה ל-FITAY</p>
          <span
            className="h-px flex-1"
            style={{
              background:
                "linear-gradient(to left, var(--wood-border), transparent)",
            }}
          />
        </div>
        <p className="mb-3 text-xs leading-5" style={{ color: "var(--faint)" }}>
          לא חובה. ההערה תישמר יחד עם האימון.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="למשל: כאב בכתף בסט השלישי, הטבעת הרגישה נמוכה מדי"
          /*
            שדה ממוסגר, כמו כל שדה אחר באפליקציה. קו תחתון בלבד לא נקרא
            כמקום שכותבים בו, וזה היה אחד משלושת הדברים שאביב סימן כלא
            ברורים במסך הזה.
          */
          className="w-full resize-none rounded-2xl px-3 py-3 text-sm leading-relaxed outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            color: "var(--text)",
          }}
        />
        </div>
        <div className="pb-5" />
      </div>

      {error && (
        <p className="mb-3 text-center text-sm" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="wood w-full rounded-2xl py-5 text-lg font-extrabold disabled:opacity-60"
        style={{
          color: "var(--on-wood)",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        {busy ? "שומרים…" : "שמירה וסיום"}
      </button>
    </Shell>
  );
}

/**
 * מה קרה לתרגילים, אחרי שהאימון כבר נשמר.
 *
 * המסך הזה מוצג רק כשיש מה לומר, כלומר כשתרגיל אחד לפחות הגיע לתקרה.
 * בכל שאר האימונים השמירה מחזירה את המתאמן ישר למסך הראשי, כמו קודם.
 */
function ProgressionResult({
  outcome,
  items,
  onDone,
}: {
  outcome: Record<string, string>;
  items: Item[];
  onDone: () => void;
}) {
  const itemsFor = (kind: string) =>
    Object.entries(outcome)
      .filter(([, value]) => value === kind)
      .map(([id]) => items.find((item) => item.id === id))
      .filter((item): item is Item => Boolean(item));

  // עלייה בתרגיל עם רמות מנח היא מעבר לסרטון הבא, לא הנמכת טבעות,
  // ולכן היא מקבלת כרטיס משלה עם ההוראה הנכונה.
  const harderItems = itemsFor("harder");
  const leveledUp = harderItems
    .filter((item) => item.hasStanceLevels)
    .map((item) => item.name);
  const harder = harderItems
    .filter((item) => !item.hasStanceLevels)
    .map((item) => item.name);
  const dropBand = itemsFor("drop-band").map((item) => item.name);

  return (
    <Shell>
      <div className="pt-10 text-center">
        <div className="mb-2 flex justify-center" aria-hidden="true">
          <FitayIcon name="ring" size={64} />
        </div>
        <h1 className="mb-8 text-3xl font-bold">האימון נשמר</h1>
      </div>

      {leveledUp.length > 0 && (
        <ResultCard
          title="נפתחה רמת מנח חדשה"
          names={leveledUp}
          body={
            leveledUp.length === 1
              ? "באימון הבא מחכה סרטון חדש, ומתחילים ממספר נמוך יותר."
              : "באימון הבא מחכים סרטונים חדשים, ומתחילים ממספר נמוך יותר."
          }
        />
      )}

      {harder.length > 0 && (
        <ResultCard
          title="עלית דרגה"
          names={harder}
          body={
            harder.length === 1
              ? "באימון הבא מנמיכים את הטבעות או מגדילים את השיפוע, ומתחילים ממספר נמוך יותר."
              : "באימון הבא מנמיכים את הטבעות או מגדילים את השיפוע, ומתחילים ממספר נמוך יותר."
          }
        />
      )}

      {dropBand.length > 0 && (
        <ResultCard
          title="עלית דרגה"
          names={dropBand}
          body={
            dropBand.length === 1
              ? "באימון הבא מנסים בלי הגומייה, ומתחילים ממספר נמוך יותר."
              : "באימון הבא מנסים בלי הגומייה, ומתחילים ממספר נמוך יותר."
          }
        />
      )}

      <button
        type="button"
        onClick={onDone}
        className="wood mt-2 w-full rounded-2xl py-5 text-lg font-extrabold"
        style={{
          color: "var(--on-wood)",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        חזרה למסך הראשי
      </button>
    </Shell>
  );
}

function ResultCard({
  title,
  names,
  body,
}: {
  title: string;
  names: string[];
  body: string;
}) {
  return (
    /*
      בלי קופסה חומה.

      המילוי החום השטוח הוא בדיוק המלבן שאביב מזהה כעיצוב שנוצר
      אוטומטית, וכאן הוא גם התחרה בכפתור העץ שמתחתיו. במקומו כותרת
      בשפת האפליקציה — מילה בזהב וקו שנמוג — ושמות התרגילים כשורות
      עם קו מפריד, כמו כל רשימה אחרת כאן.

      והנקודה שהייתה לפני כל שם ירדה. מפריד בתחילת שורה בלי שום דבר
      לפניו נראה כמו תקלה, וזה בדיוק מה שאביב ראה במסך.
    */
    <section className="mb-7">
      <div className="mb-2 flex items-center gap-3">
        <p className="wood-text shrink-0 text-lg font-black">{title}</p>
        <span
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(to left, var(--wood-border), transparent)",
          }}
        />
      </div>
      <div className="mb-3">
        {names.map((name, index) => (
          <p
            key={name}
            className="py-2 font-bold"
            style={{ borderTop: index === 0 ? "none" : "1px solid var(--line)" }}
          >
            {name}
          </p>
        ))}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        {body}
      </p>
    </section>
  );
}

function Shell({ children, hasBottomBar = false }: { children: React.ReactNode; hasBottomBar?: boolean }) {
  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />
      <div className={`relative z-10 mx-auto w-full max-w-md safe-top px-5 ${hasBottomBar ? "pb-40" : "pb-10"}`}>
        {children}
      </div>
    </main>
  );
}
