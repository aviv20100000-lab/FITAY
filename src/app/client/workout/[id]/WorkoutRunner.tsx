"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import FitayIcon from "@/components/FitayIcon";
import { useWakeLock } from "@/lib/useWakeLock";
import { useTimerVoice } from "@/lib/useTimerVoice";
import { useOverlay } from "@/lib/useOverlay";
import { Bidi } from "@/components/Bidi";
import type {
  Advice,
  BandLevel,
  LastPerformance,
  ProgressionMode,
  Side,
} from "@/lib/types";

type Item = {
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
  unilateral: boolean;
  /** האם מותר לבצע את התרגיל הזה בעזרת גומייה. נקבע בספריית התרגילים. */
  bandAllowed: boolean;
  sets: number;
  reps: number | null;
  seconds: number | null;
  /** תחתית טווח העבודה. null בתרגילי amrap, שנשארים מחוץ למנגנון. */
  floor: number | null;
  /** ההנחיה מהמנגנון לאימון הזה: להקשות, לוותר על הגומייה, או להקל. */
  advice: Advice;
  /**
   * ההקשיה של התרגיל הזה ממתינה להחלטה של המאמן.
   *
   * קורה כשהתקרה הושגה בכל הסטים ואף מספר לא נערך. אין כאן ראיה להישג,
   * ולכן הדרגה נשארת במקומה עד שאיתי מחליט.
   */
  awaitingApproval: boolean;
  /**
   * מה שהמאמן כתב כשהוא לא אישר את ההקשיה. ריק כשאין.
   *
   * מוצג עד האימון הבא בתרגיל הזה. מסך שלא משתנה בלי הסבר הוא מסך
   * שמאבדים בו אמון, ולכן ההחלטה לא נשארת שקטה.
   */
  coachDecision: string;
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

/**
 * כמה מוסיפים היום מעל מה שהושג בפעם הקודמת.
 *
 * בחזרות תוספת של אחת היא דרישה שמרגישים. בהחזקות שנייה אחת נבלעת: 46
 * שניות במקום 45 אינן דרישה, והן גם מספר שקשה לקרוא על טיימר תוך כדי
 * מאמץ. חמש שניות נשארות בקנה המידה שבו מודדים החזקות.
 *
 * שני הערכים ממתינים לאישור של איתי אחרי שיראה את המסך.
 */
const REPS_STEP = 1;
const HOLD_STEP = 5;

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

/** מה נרשם בתרגיל הזה — חזרות או שניות. amrap נמדד בחזרות בתוך זמן קצוב. */
function logsReps(type: Item["type"]) {
  return type !== "hold";
}

/**
 * מה עשית פעם קודמת, בשורה אחת.
 *
 * סט שבוצע עם גומייה מסומן בכוכבית. בלי הסימון הזה המתאמן היה משווה
 * את עצמו למספר שהושג בעזרה, וחושב שהוא נתקע או נחלש בלי סיבה.
 */
function formatLast(last: LastPerformance | null, type: Item["type"]) {
  if (!last || last.sets.length === 0) return null;
  const unit = logsReps(type) ? "" : " שנ׳";
  const parts = last.sets.map((s) => {
    const value = logsReps(type) ? String(s.reps ?? 0) : String(s.seconds ?? 0);
    return s.banded ? `${value}*` : value;
  });
  // כשכל הסטים עם אותה גומייה, אומרים איזו: עשר עם קלה ועשר עם קשה הן
  // שני הישגים שונים, וההשוואה צריכה לומר מול מה משווים.
  const levels = new Set(
    last.sets.filter((s) => s.banded && s.bandLevel).map((s) => s.bandLevel!)
  );
  const tail = last.anyBanded
    ? levels.size === 1
      ? `  (* עם גומייה ${BAND_LABEL[[...levels][0]]})`
      : "  (* עם גומייה)"
    : "";
  return `${parts.join(" · ")}${unit}  (סה״כ ${last.total})${tail}`;
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
  ruleTitles,
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
  /** ארבעת הכללים, כפי שהמאמן ניסח אותם במדריך. */
  ruleTitles: string[];
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
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);
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
    const target = targetValue(item, set);
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
        ruleTitles={ruleTitles}
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
  const ceiling =
    item.type === "amrap"
      ? item.seconds
      : (item.type === "reps" ? item.reps : item.seconds) ??
        item.reps ??
        item.seconds;
  /*
   * טווח ופס טווח רק לתרגילי מנח. בתרגיל שמתקדם בחזרות או בזמן המספר
   * שבתוכנית הוא נקודת פתיחה בלי תקרה, וטווח "6–10" היה מציג יעד שהמנגנון
   * כבר לא מכיר.
   */
  const showRange =
    item.type !== "amrap" &&
    item.progression === "stance" &&
    item.floor != null &&
    ceiling != null &&
    item.floor < ceiling;
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

  const lastLine = formatLast(item.last, item.type);
  const unit = logsReps(item.type) ? "חזרות" : "שניות";
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
        <BackLink href="/client" className="!min-h-9 !px-2.5 !py-1.5 !text-xs">שמור וצא</BackLink>
        {logs.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmRestart(true)}
            className="min-h-9 rounded-xl px-2.5 text-xs font-semibold"
            style={{ color: "var(--dim)", border: "1px solid var(--line)" }}
          >
            התחל מחדש
          </button>
        )}
      </div>

      {confirmRestart && (
        <div className="mb-4 rounded-2xl p-4" style={{ background: "var(--soft-2)", border: "1px solid var(--line)" }}>
          <p className="font-bold">להתחיל את האימון מחדש?</p>
          <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
            כל הסטים שרשמת באימון הנוכחי יימחקו מהמכשיר.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={restart} className="rounded-xl px-4 py-2.5 font-bold" style={{ background: "var(--danger-text)", color: "var(--accent-contrast)" }}>
              התחל מחדש
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
        style={{ background: "var(--soft-3)" }}
      >
        <div
          className="wood h-full rounded-full transition-all duration-500"
          style={{ width: `${((index + (set - 1) / item.sets) / items.length) * 100}%` }}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--dim)" }}>
        {programTitle} · {workoutTitle}
      </p>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">{item.name}</h1>

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
            onClick={() => setVideoExpanded(!videoExpanded)}
            className={videoExpanded ? "max-h-full w-auto max-w-full" : "max-h-[52vh] w-auto max-w-full"}
          />
        ) : (
          <div className="flex w-full items-center gap-3 px-4 py-3 text-right">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm" style={{ background: "var(--soft-2)", color: "var(--wood-1)" }}>▶</span>
            <div>
              <p className="text-sm font-bold">ההדגמה בדרך</p>
              <p className="text-xs" style={{ color: "var(--dim)" }}>אפשר להמשיך לפי הוראות הטכניקה.</p>
            </div>
          </div>
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
              className="rounded-full bg-black/70 px-3 py-2 text-xs font-bold text-white"
            >
              הפעל מחדש
            </button>
            <button
              type="button"
              onClick={() => setVideoExpanded(!videoExpanded)}
              className="rounded-full bg-black/70 px-3 py-2 text-xs font-bold text-white"
            >
              {videoExpanded ? "סגור" : "הגדל"}
            </button>
          </div>
        )}
      </div>

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

      {/* ההקשיה שממתינה להחלטה. קודמת להנחיה, כי היא מסבירה למה אין הנחיה. */}
      {!recovery && item.awaitingApproval && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(107,143,181,.12)",
            border: "1px solid rgba(107,143,181,.34)",
          }}
        >
          <p className="mb-1 text-sm font-bold" style={{ color: "var(--rehab)" }}>
            ההקשיה ממתינה לאישור המאמן
          </p>
          <p className="text-sm leading-relaxed">
            הגעת ליעד בכל הסטים, ואיתי בודק את התרגיל לפני שמעלים דרגה. עד
            שהוא יאשר, המשך באותו גובה טבעות ובאותו מנח.
          </p>
        </div>
      )}

      {/* מה שהמאמן החליט על ההקשיה. בקולו, ובלשון של הנחיה. */}
      {!recovery && item.coachDecision && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(180,133,79,.14)",
            border: "1px solid rgba(224,190,147,.32)",
          }}
        >
          <p className="mb-1 text-sm font-bold wood-text">הודעה מהמאמן</p>
          <p className="text-sm leading-relaxed">{item.coachDecision}</p>
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

      {/* מה עשית פעם שעברה, כאן, לפני שאתה מתחיל את הסט */}
      {!recovery && lastLine && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(180,133,79,.10)",
            border: "1px solid rgba(224,190,147,.24)",
          }}
        >
          <p className="mb-1 text-xs font-bold" style={{ color: "var(--wood-1)" }}>
            פעם שעברה
          </p>
          <p className="text-sm tabular-nums" style={{ color: "var(--dim)" }}>
            <Bidi text={lastLine} />
          </p>
          <p className="mt-1.5 text-xs" style={{ color: "var(--faint)" }}>
            נסה לעבור את זה, אבל עצור 1-2 חזרות לפני כישלון.
          </p>
        </div>
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
            מנוחה {resting > 0 ? activeRestTotal : item.rest} שנ׳
          </span>
        </div>
        {/*
          בתרגיל עם רמות מנח, השער הוא לא סוד: המתאמן צריך לדעת בשביל
          מה הוא נלחם. הרצף והתקרה הם נתונים אמיתיים, לא קישוט. ברמה 3
          אין לאן לעלות ולכן אין שורה, ובאימון התאוששות היא מוסתרת כי
          הסטים המוקלים ממילא לא מזיזים את הרצף.
        */}
        {item.hasStanceLevels &&
          !recovery &&
          item.difficultyStep < 2 &&
          ceiling != null && (
            <p
              className="mt-2 text-xs font-semibold"
              style={{ color: "var(--wood-1)" }}
            >
              {item.ceilingStreak === 1
                ? `עוד אימון אחד עם ${ceiling} בכל הסטים, והמנח הבא נפתח`
                : `מגיעים ל-${ceiling} בכל הסטים בשני אימונים ברצף, והמנח הבא נפתח`}
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

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <Chip label="גובה הטבעת" value={item.ringHeight ?? "חופשי"} />
        <Chip label="מנח הגוף" value={item.bodyAngle ?? "רגיל"} />
      </div>

      {/*
        אחרי שהתרגיל הוקשה, הגובה והמנח שרשומים הם של נקודת הפתיחה.
        בלי השורה הזאת המתאמן היה מחזיר את הטבעות לגובה שכבר עבר.
      */}
      {item.difficultyStep > 0 && (
        <p className="-mt-2 mb-4 text-xs" style={{ color: "var(--faint)" }}>
          הקשית את התרגיל {item.difficultyStep === 1 ? "פעם אחת" : `${item.difficultyStep} פעמים`} מאז
          תחילת התוכנית. המשך מהמצב שאתה נמצא בו, לא ממה שרשום למעלה.
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

      {item.technique.length > 0 && (
        <div className="glass mb-4 rounded-3xl p-5">
          <p className="mb-3 text-sm font-bold wood-text">טכניקה</p>
          <ul className="space-y-2">
            {item.technique.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span style={{ color: "var(--wood-2)" }}>•</span>
                <span>{t}</span>
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
          <p className="mb-1 text-sm font-bold">היעד להיום</p>
          <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
            יצא אחרת? עדכן את המספר.
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
              label={unit}
              value={main}
              onChange={changeMain}
              muted={!mainTouched}
            />
          )}

          {/*
            האפשרות מופיעה רק בתרגילים שאושרו לשימוש בגומייה ב-FITAY.
            הסימון נשמר עם הסט, כדי שההשוואה לפעם הקודמת תהיה מדויקת:
            עשר חזרות עם גומייה אינן אותו הישג כמו עשר בלעדיה.
          */}
          {item.bandAllowed && (
            <div
              className="mt-3 rounded-2xl px-4 py-3"
              style={{
                background: banded ? "rgba(180,133,79,.18)" : "var(--soft-2)",
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
                        ? "בחר איזו גומייה"
                        : "הפעל אם אתה משתמש בגומייה"}
                  </span>
                </span>
                <span
                  className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
                  style={{ background: usingBand ? "var(--wood-2)" : "var(--soft-4)" }}
                >
                  <span
                    className="absolute top-1 h-5 w-5 rounded-full transition-all"
                    style={{
                      background: "#f7ebda",
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
                          background: active ? "var(--wood-2)" : "var(--soft-4)",
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
  const fromFloor = floor != null ? ` והתחל היום מ-${floor}` : " והתחל היום ממספר נמוך יותר";
  const content =
    advice === "harder"
      ? hasStanceLevels
        ? {
            title: "נפתחה רמת מנח חדשה",
            body: `הגעת ליעד בכל הסטים פעמיים ברצף, והמנח הבא מחכה לך. צפה בסרטון החדש לפני שאתה מתחיל${fromFloor}.`,
          }
        : {
          title: "עלית דרגה",
          body: `בפעם הקודמת הגעת ליעד בכל הסטים, אז התרגיל כבר קל לך. הנמך את הטבעות או הגדל את השיפוע,${fromFloor}. זה ירגיש קשה יותר, וזו בדיוק המטרה.`,
        }
      : advice === "drop-band"
        ? {
            title: "עלית דרגה",
            body: `בפעם הקודמת הגעת ליעד בכל הסטים עם גומייה. נסה היום בלי הגומייה,${fromFloor}.`,
          }
        : {
            title: "מטפסים מחדש",
            body: `כמה אימונים בלי התקדמות, וזה קורה לכולם.${floor != null ? ` התחל היום מ-${floor}` : " התחל היום ממספר נמוך יותר"} ותעלה בהדרגה מאימון לאימון.${bandAllowed ? " אפשר גם להיעזר בגומייה." : ""}`,
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
        style={{ background: "var(--soft-3)" }}
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
  const unit = logsReps(item.type) ? "" : " שנ׳";

  return (
    <div className="glass mb-4 rounded-3xl p-5">
      <p className="mb-2 text-sm font-bold">הסטים שכבר עשית</p>
      <ol className="space-y-2">
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
            <li key={number} className="flex items-center justify-between gap-3 text-sm">
              <span style={{ color: "var(--dim)" }}>סט {number}</span>
              <span className="font-bold tabular-nums">
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
    <div className="under-overlay fixed inset-x-0 bottom-0 z-50 px-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex w-full max-w-md items-center gap-3 rounded-3xl p-3" style={{ background: "var(--nav-bg)", border: "1px solid var(--line)", backdropFilter: "blur(22px)" }}>
        <span className="shrink-0 text-sm font-bold" style={{ color: "var(--dim)" }}>
          <Bidi text={`סט ${setNumber}/${totalSets}`} />
        </span>
        <button type="button" onClick={onSave} className="wood min-h-14 flex-1 rounded-2xl px-4 text-lg font-extrabold" style={{ color: "#f7ebda" }}>
          {finalSet ? "סיים אימון" : "סיימתי את הסט"}
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
    <div className="under-overlay fixed inset-x-0 bottom-0 z-50 px-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl p-3" style={{ background: "var(--nav-bg)", border: "1px solid var(--line)", backdropFilter: "blur(22px)" }}>
        <div className="mb-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--soft-3)" }}>
          <div className="wood h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-2">
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
            className="grid min-h-11 place-items-center rounded-xl px-3"
            style={{
              border: "1px solid var(--line)",
              background: voiceOn ? "var(--soft-2)" : "transparent",
              color: voiceOn ? "var(--wood-1)" : "var(--dim)",
            }}
          >
            <span className={voiceOn ? "opacity-100" : "opacity-45"}>
              <FitayIcon name={voiceOn ? "voice" : "voiceOff"} size={20} />
            </span>
          </button>
          <button type="button" onClick={() => onAdjust(15)} className="min-h-11 rounded-xl px-3 font-bold" style={{ border: "1px solid var(--line)" }}>+15</button>
          <button type="button" onClick={() => onAdjust(-15)} className="min-h-11 rounded-xl px-3 font-bold" style={{ border: "1px solid var(--line)" }}>−15</button>
          <button type="button" onClick={onSkip} className="min-h-11 flex-1 rounded-xl px-3 font-bold" style={{ background: "var(--soft-2)", color: "var(--wood-1)" }}>
            דלג
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * מה נרשם בסט הזה בפעם הקודמת.
 *
 * לפי מספר הסט ולא לפי הסט הראשון. קודם הערך של הסט הראשון היה ממולא
 * בכל הסטים, ולכן מי שעשה 12 ואז 10 ואז 8 קיבל 12 בשלושתם, ומי שאישר
 * בלי לגעת רשם במסד עלייה שלא קרתה בשני הסטים האחרונים.
 *
 * סט שלא היה בפעם הקודמת, למשל אחרי אימון התאוששות עם חצי מהסטים,
 * נשען על הסט האחרון שכן נרשם.
 */
function previousSetValue(item: Item, setNumber: number): number | null {
  const sets = item.last?.sets;
  if (!sets || sets.length === 0) return null;
  const row = sets[setNumber - 1] ?? sets[sets.length - 1];
  if (!row) return null;
  return logsReps(item.type) ? row.reps : row.seconds;
}

/**
 * המספר שממולא מראש בסט הזה: היעד להיום.
 *
 * כאן ישבה הבעיה שהשביתה את כל המנגנון. קודם מולאה ההיסטוריה, כלומר מה
 * שנעשה בפעם הקודמת, והמתאמנים אישרו אותה בלי לגעת. אחרי הקשיה ברירת
 * המחדל הייתה תחתית הטווח, המתאמן אישר אותה שוב ושוב, ולכן לעולם לא חזר
 * לתקרה ולעולם לא עלה דרגה בשנית. כל תרגיל קיבל בדיוק הקשיה אחת ואז קפא.
 *
 * עכשיו ממולא היעד, ולכן אישור בלי נגיעה פירושו התקדמות. העריכה נדרשת
 * דווקא בכישלון, שהוא אירוע נדיר ושווה נגיעה.
 */
function targetValue(item: Item, setNumber: number): number {
  const reps = logsReps(item.type);
  const previous = previousSetValue(item, setNumber);
  // בתרגיל שמתקדם בחזרות או בזמן אין תקרה: התוספת עצמה היא ההתקדמות,
  // והמספר שבתוכנית הוא נקודת הפתיחה ולא היעד לטפס אליו.
  const open = item.progression !== "stance";
  if (previous == null) {
    // בלי היסטוריה בדרגה הזאת מתחילים מתחתית הטווח. זה גם המצב מיד אחרי
    // הקשיה, כי ההשוואה נעשית רק בתוך אותה דרגת קושי. בתרגיל בלי תקרה
    // מתחילים מהמספר שבתוכנית, כי אין למי לרדת ואין לאן לטפס.
    const program = reps ? item.reps ?? 10 : item.seconds ?? 20;
    return open ? program : item.floor ?? program;
  }
  const next = previous + (reps ? REPS_STEP : HOLD_STEP);
  if (open) return next;
  // התקרה נקבעת כמו בשרת, אחרת המסך היה מציע יעד שהמנגנון לא מכיר.
  const ceiling = item.type === "hold" ? item.seconds : item.reps;
  return ceiling == null ? next : Math.min(next, ceiling);
}

function Stepper({
  label,
  value,
  onChange,
  muted,
  hint,
}: {
  label: string;
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
      <p className="mb-1.5 text-xs" style={{ color: "var(--dim)" }}>
        {label}
      </p>
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
        background: "var(--soft-2)",
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
  ruleTitles,
}: {
  warmup: WarmupItem[];
  workoutTitle: string;
  programTitle: string;
  phase: number;
  recovery: boolean;
  onStart: () => void;
  ruleTitles: string[];
}) {
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
      <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        החימום מכין את המפרקים ואת האחיזה לעומס. עובדים 4-5 דקות, ואז
        מתחילים את האימון.
      </p>

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

      <div className="glass mb-5 rounded-3xl p-2">
        {warmup.map((w, i) => (
          <div
            key={w.id}
            className="px-3.5 py-3.5"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-bold">{w.name}</p>
              <p className="shrink-0 text-sm tabular-nums" style={{ color: "var(--wood-1)" }}>
                <Bidi text={`${w.sets} × ${w.reps != null ? w.reps : `${w.seconds} שנ׳`}`} />
              </p>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--dim)" }}>
              {w.technique[0]}
            </p>
          </div>
        ))}
      </div>

      <div className="glass mb-5 rounded-3xl p-5">
        <p className="mb-3 text-sm font-bold wood-text">ארבעה כללים</p>
        <ul className="space-y-1.5">
          {ruleTitles.map((title) => (
            <li key={title} className="flex gap-2.5 text-sm">
              <span style={{ color: "var(--wood-2)" }}>•</span>
              <span>{title}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="wood w-full rounded-2xl py-5 text-xl font-extrabold"
        style={{
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        סיימתי את החימום
      </button>
    </Shell>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-4 py-3 text-center"
      style={{
        background: "rgba(180,133,79,.14)",
        border: "1px solid rgba(224,190,147,.28)",
      }}
    >
      <p className="text-xs" style={{ color: "var(--dim)" }}>
        {label}
      </p>
      <p className="text-lg font-bold" style={{ color: "var(--wood-1)" }}>
        {value}
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
      setError("אין חיבור לרשת. הישאר במסך הזה ונסה שוב עוד רגע.");
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

      {/* הסיכום של האימון — כדאי שיראה מה נרשם */}
      <div className="glass mb-4 flex overflow-hidden rounded-3xl">
        <div className="flex-1 px-3 py-4 text-center">
          <b className="block text-2xl font-black wood-text tabular-nums">
            {totalReps}
          </b>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            חזרות סה״כ
          </span>
        </div>
        <span className="my-3 w-px shrink-0" style={{ background: "var(--line)" }} />
        <div className="flex-1 px-3 py-4 text-center">
          <b className="block text-2xl font-black tabular-nums">{totalSeconds}</b>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            שניות בהחזקות
          </span>
        </div>
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
        <div className="glass mb-4 rounded-3xl p-5">
          <p className="mb-3 font-bold">לעומת הפעם הקודמת</p>
          <div className="space-y-3">
            {comparisons.map(({ item, current, previous, comparable, delta }) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="shrink-0 text-left font-bold tabular-nums" style={{ color: "var(--wood-1)" }}>
                  {previous == null
                    ? `${current} · אין נתון קודם`
                    : !comparable
                      ? `${current} · אין השוואה ישירה`
                      : delta === 0
                        ? `${current} · ללא שינוי`
                        : `${current} · קודם ${previous}`}
                </span>
              </div>
            ))}
          </div>
          {comparisons.some((entry) => entry.previous != null && !entry.comparable) && (
            <p className="mt-3 text-xs" style={{ color: "var(--dim)" }}>
              כשהשימוש בגומייה השתנה, ההשוואה אינה ישירה.
            </p>
          )}
        </div>
      )}

      <div className="glass mb-4 rounded-3xl p-6">
        <p className="mb-3 text-sm font-bold">איך הרגשת?</p>
        <div className="grid grid-cols-3 gap-2">
          {["קל", "מתאים", "קשה"].map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMood(m)}
              className="rounded-2xl py-3.5 font-semibold"
              style={{
                background: mood === m ? "rgba(180,133,79,.24)" : "var(--soft-2)",
                border: `1px solid ${mood === m ? "rgba(224,190,147,.5)" : "var(--line)"}`,
                color: mood === m ? "var(--wood-1)" : "var(--dim)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/*
        דיווח כאב פתוח לכל מתאמן, ולא רק למי שסומן במצב שיקום.
        קודם זה היה מוסתר מאחורי מתג שהמאמן היה צריך להדליק, כלומר מתאמן
        שנפצע באמצע תוכנית לא היה לו איפה להגיד את זה. עכשיו זה כאן תמיד,
        לא חובה, ומי שלא לוחץ פשוט לא מדווח.
      */}
      <div className="glass mb-4 rounded-3xl p-6">
        <p className="mb-1 text-sm font-bold">משהו כאב?</p>
        <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
          לא חובה, רק אם היה כאב. 0 הוא בלי כאב ו-10 הוא כאב חזק. הדיווח
          יופיע ב-FITAY.
        </p>
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--dim)" }}>
          <span>0 · בלי כאב</span>
          <span>10 · כאב חזק</span>
        </div>
        <div className="grid grid-cols-6 gap-1.5" dir="rtl" aria-label="סולם כאב מ-0 עד 10">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              type="button"
              key={n}
              // לחיצה שנייה על אותו מספר מבטלת. אחרת מי שלחץ בטעות
              // נשאר עם דיווח כאב שהוא לא התכוון לשלוח.
              onClick={() => setPain(pain === n ? null : n)}
              className="min-h-11 min-w-0 rounded-lg px-1 text-sm font-bold"
              style={{
                background: pain === n ? "var(--wood-2)" : "var(--soft-2)",
                border: `1px solid ${pain === n ? "var(--wood-1)" : "var(--line)"}`,
                color: pain === n ? "var(--accent-contrast)" : "var(--dim)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* "קל/בול/קשה" לא מספיק כדי לתקן תרגיל. כאן נכנס מה שבאמת קרה. */}
      <div className="glass mb-4 rounded-3xl p-6">
        <p className="mb-1 text-sm font-bold">הערה ל-FITAY</p>
        <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
          לא חובה. ההערה תישמר יחד עם האימון.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="למשל: כאב בכתף בסט השלישי, הטבעת הרגישה נמוכה מדי"
          className="w-full resize-none rounded-2xl px-3.5 py-3 text-sm leading-relaxed outline-none"
          style={{
            background: "var(--soft-2)",
            border: "1px solid var(--line)",
            color: "var(--text)",
          }}
        />
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
          color: "#f7ebda",
          boxShadow:
            "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
        }}
      >
        {busy ? "שומר…" : "שמור וסיים"}
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
              ? "הגעת ליעד בכל הסטים פעמיים ברצף, והמנח הבא נפתח לך. באימון הבא מחכה לך סרטון חדש, ומתחילים שוב ממספר נמוך יותר."
              : "הגעת ליעד בכל הסטים פעמיים ברצף, והמנח הבא נפתח לך. באימון הבא מחכים לך סרטונים חדשים, ומתחילים שוב ממספר נמוך יותר."
          }
        />
      )}

      {harder.length > 0 && (
        <ResultCard
          title="עלית דרגה"
          names={harder}
          body={
            harder.length === 1
              ? "הגעת ליעד בכל הסטים, אז התרגיל כבר קל לך. באימון הבא מנמיכים את הטבעות או מגדילים את השיפוע, ומתחילים שוב ממספר נמוך יותר. האפליקציה תזכיר לך את זה כשתגיע אליו."
              : "הגעת ליעד בכל הסטים, אז התרגילים כבר קלים לך. באימון הבא מנמיכים את הטבעות או מגדילים את השיפוע, ומתחילים שוב ממספר נמוך יותר. האפליקציה תזכיר לך את זה כשתגיע אליהם."
          }
        />
      )}

      {dropBand.length > 0 && (
        <ResultCard
          title="עלית דרגה"
          names={dropBand}
          body={
            dropBand.length === 1
              ? "הגעת ליעד בכל הסטים בעזרת הגומייה. באימון הבא נסה בלעדיה, ומתחילים שוב ממספר נמוך יותר."
              : "הגעת ליעד בכל הסטים בעזרת הגומייה. באימון הבא נסה בלעדיה, ומתחילים שוב ממספר נמוך יותר."
          }
        />
      )}

      <button
        type="button"
        onClick={onDone}
        className="wood mt-2 w-full rounded-2xl py-5 text-lg font-extrabold"
        style={{
          color: "#f7ebda",
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
    <div
      className="mb-4 rounded-3xl px-5 py-4"
      style={{
        background: "rgba(180,133,79,.18)",
        border: "1px solid rgba(224,190,147,.45)",
      }}
    >
      <p className="mb-1 font-bold" style={{ color: "var(--wood-1)" }}>
        {title}
      </p>
      {/*
        רשימה במקום משפט אחד ארוך. שמונה שמות תרגילים בשורה אחת עם פסיקים
        זה טקסט שאף אחד לא קורא, ובטח לא אחרי אימון.
      */}
      <ul className="mb-2 space-y-0.5 text-sm font-bold">
        {names.map((name) => (
          <li key={name}>· {name}</li>
        ))}
      </ul>
      <p className="text-sm leading-relaxed">{body}</p>
    </div>
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
