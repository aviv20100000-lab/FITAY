"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import { useWakeLock } from "@/lib/useWakeLock";
import type { Advice, BandLevel, LastPerformance, Side } from "@/lib/types";

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
  /** כמה פעמים התרגיל כבר הוקשה בריצה הזאת. */
  difficultyStep: number;
  rest: number;
  ringHeight: string | null;
  bodyAngle: string | null;
  /** הדגש שהמאמן כתב לתרגיל הזה אצל המתאמן הזה. ריק כשאין. */
  coachNote: string;
  videoFile: string | null;
  posterUrl: string | null;
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
  const [restored, setRestored] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const previousIndex = useRef<number | null>(null);

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

  // ערכי הרישום לסט הנוכחי. מתאפסים לברירת המחדל בכל מעבר סט או תרגיל.
  const [main, setMain] = useState(0);
  const [strong, setStrong] = useState(0);
  /** איזו גומייה בסט הנוכחי. null = בלי גומייה. נשמר עם הסט. */
  const [bandLevel, setBandLevel] = useState<BandLevel | null>(null);
  const banded = bandLevel !== null;

  useEffect(() => {
    if (!item) return;
    // ברירת המחדל היא מה שקרה פעם שעברה, ובלעדיו תחתית הטווח — משם
    // מטפסים. התקרה נשארת רק כרשת ביטחון לתרגילים בלי טווח.
    const fallback = logsReps(item.type)
      ? lastValue(item) ?? item.floor ?? item.reps ?? 10
      : lastValue(item) ?? item.floor ?? item.seconds ?? 20;
    setMain(fallback);
    setStrong(fallback);
  }, [item, set]);

  // הגומייה מתאפסת במעבר תרגיל בלבד. בתוך אותו תרגיל מי שהתחיל איתה
  // בדרך כלל ממשיך איתה, ואין סיבה להצריך לחיצה בכל סט.
  useEffect(() => {
    setBandLevel(null);
  }, [index]);

  /**
   * טיימר המנוחה נגזר משעון אמיתי ולא מספירה לאחור בזיכרון —
   * setTimeout נעצר כשהמסך ננעל, והמתאמן היה חוזר לטיימר קפוא.
   * בלי צלצול, כי מתאמנים עם מוזיקה ברקע.
   */
  const resting =
    restUntil == null ? 0 : Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));

  useEffect(() => {
    if (restUntil == null) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [restUntil]);

  useEffect(() => {
    if (restUntil == null) return;
    const over = Date.now() - restUntil;
    if (over < 0) return;
    // רק אם המנוחה נגמרה ממש עכשיו. אימון שנשמר ונפתח מחר לא ירטוט לשווא.
    if (over < 3000) buzz([180, 90, 180]);
    setRestUntil(null);
    setRestTotal(null);
  }, [tick, restUntil]);

  // המסך נשאר דלוק כל עוד האימון פתוח — כולל החימום, לא רק הסטים.
  useWakeLock(restored && !done);

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
      setRestUntil(null);
      setRestTotal(null);
      return;
    }
    setRestTotal(nextTotal);
    setRestUntil(Date.now() + nextRemaining * 1000);
  }

  function skipRest() {
    setRestUntil(null);
    setRestTotal(null);
  }

  function saveSet() {
    const entries: LoggedSet[] = [];
    const base = {
      workoutItemId: item.id,
      exerciseId: item.exerciseId,
      setNumber: set,
    };
    const toRow = (value: number, side: Side | null): LoggedSet => ({
      ...base,
      reps: logsReps(item.type) ? value : null,
      seconds: logsReps(item.type) ? null : value,
      side,
      banded,
      bandLevel,
    });

    if (item.unilateral) {
      entries.push(toRow(main, "weak"), toRow(strong, "strong"));
    } else {
      entries.push(toRow(main, null));
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
  const showRange =
    item.type !== "amrap" && item.floor != null && ceiling != null && item.floor < ceiling;
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
          />
        )}
      </Shell>
    );
  }

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
          item.videoFile ? "min-h-44" : ""
        } ${
          videoExpanded ? "fixed inset-3 z-[70] mb-0 bg-black" : ""
        }`}
        style={{
          background: "var(--video-bg)",
          border: "1px solid var(--line)",
        }}
      >
        {item.videoFile ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={
              item.videoFile.startsWith("http")
                ? item.videoFile
                : `/videos/${encodeURIComponent(item.videoFile)}`
            }
            poster={item.posterUrl ?? undefined}
            autoPlay
            muted={videoMuted}
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
        {item.videoFile && (
          <div className="absolute bottom-3 left-3 right-3 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setVideoMuted(!videoMuted)}
              className="rounded-full bg-black/70 px-3 py-2 text-xs font-bold text-white"
            >
              {videoMuted ? "הפעל צליל" : "השתק"}
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

      {/* ההנחיה מהמנגנון: מה השתנה מאז האימון הקודם ואיך להתחיל היום */}
      {!recovery && item.advice && (
        <AdviceCard advice={item.advice} floor={item.floor} bandAllowed={item.bandAllowed} />
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
            {lastLine}
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
        <p className="mb-3 text-5xl font-extrabold wood-text">{target}</p>
        <div className="text-xs" style={{ color: "var(--dim)" }}>
          <span>מנוחה {resting > 0 ? activeRestTotal : item.rest} שנ׳</span>
        </div>
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
          <p className="mb-3 text-sm font-bold">כמה עשית בפועל?</p>

          {item.unilateral ? (
            <div className="space-y-3">
              <Stepper label={`צד חלש · ${unit}`} value={main} onChange={setMain} />
              <Stepper label={`צד חזק · ${unit}`} value={strong} onChange={setStrong} />
            </div>
          ) : (
            <Stepper label={unit} value={main} onChange={setMain} />
          )}

          {/*
            האפשרות מופיעה רק בתרגילים שאושרו לשימוש בגומייה ב-FITAY.
            הסימון נשמר עם הסט, כדי שההשוואה לפעם הקודמת תהיה מדויקת:
            עשר חזרות עם גומייה אינן אותו הישג כמו עשר בלעדיה.
          */}
          {item.bandAllowed && (
            <div
              className="mt-3 rounded-2xl px-4 py-3.5"
              style={{
                background: banded ? "rgba(180,133,79,.18)" : "var(--soft-2)",
                border: `1px solid ${banded ? "rgba(224,190,147,.5)" : "var(--line)"}`,
              }}
            >
              <p className="font-semibold">גומייה</p>
              <p className="text-xs" style={{ color: "var(--dim)" }}>
                {banded
                  ? `סימנת שהסט נעשה עם הגומייה ה${BAND_LABEL[bandLevel!]}`
                  : "אם אתה משתמש בגומייה, בחר איזו"}
              </p>
              {/*
                לחיצה על גומייה שכבר נבחרה מבטלת אותה, ולכן אין צורך
                בכפתור "בלי גומייה" חמישי שמנפח את השורה.
              */}
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {BAND_LEVELS.map((level) => {
                  const active = bandLevel === level.value;
                  return (
                    <button
                      key={level.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setBandLevel(active ? null : level.value)
                      }
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
}: {
  advice: Advice;
  floor: number | null;
  bandAllowed: boolean;
}) {
  /*
   * הניסוח כאן נבדק על שחקן כדורגל, לא על מי שכתב את המנגנון. "עברת את
   * התקרה" ו"תחתית הטווח" הם מונחים של הקוד, והוחלפו במספרים ובפעולות:
   * מה הצלחת, ומה בדיוק לעשות עכשיו.
   */
  const fromFloor = floor != null ? ` והתחל היום מ-${floor}` : " והתחל היום ממספר נמוך יותר";
  const content =
    advice === "harder"
      ? {
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
                {values.join(item.unilateral ? " / " : "")}{unit}
                {rows.some((row) => row.banded)
                  ? level
                    ? `  (* גומייה ${BAND_LABEL[level]})`
                    : "  (* עם גומייה)"
                  : ""}
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
    <div className="fixed inset-x-0 bottom-0 z-50 px-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex w-full max-w-md items-center gap-3 rounded-3xl p-3" style={{ background: "var(--nav-bg)", border: "1px solid var(--line)", backdropFilter: "blur(22px)" }}>
        <span className="shrink-0 text-sm font-bold" style={{ color: "var(--dim)" }}>
          סט {setNumber}/{totalSets}
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
}: {
  remaining: number;
  total: number;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
}) {
  const progress = total > 0 ? Math.min(100, (remaining / total) * 100) : 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl p-3" style={{ background: "var(--nav-bg)", border: "1px solid var(--line)", backdropFilter: "blur(22px)" }}>
        <div className="mb-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--soft-3)" }}>
          <div className="wood h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-20 text-center">
            <p className="text-2xl font-extrabold tabular-nums">{mmss(remaining)}</p>
            <p className="text-xs" style={{ color: "var(--dim)" }}>מתוך {mmss(total)}</p>
          </div>
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

/** הערך של הסט הראשון בפעם הקודמת — ברירת מחדל טובה יותר מאפס. */
function lastValue(item: Item): number | null {
  const first = item.last?.sets[0];
  if (!first) return null;
  return logsReps(item.type) ? first.reps : first.seconds;
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
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
            color: "var(--wood-1)",
          }}
        >
          {value}
        </div>
        <StepButton onClick={() => onChange(value + 1)}>+</StepButton>
      </div>
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
                {w.sets} × {w.reps != null ? w.reps : `${w.seconds} שנ׳`}
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
   * מי שעבר את התקרה בכל הסטים עולה דרגה. אותו חישוב שהשרת עושה, מוצג
   * כאן מיד כדי שההישג ייראה ברגע שהוא קרה ולא רק באימון הבא.
   */
  const promoted = recovery
    ? []
    : items.filter((item) => {
        if (item.type === "amrap" || item.floor == null) return false;
        const ceiling = item.type === "hold" ? item.seconds : item.reps;
        if (ceiling == null) return false;
        const rows = logs.filter(
          (log) => log.workoutItemId === item.id && log.side !== "strong"
        );
        if (rows.length === 0) return false;
        if (new Set(rows.map((log) => log.setNumber)).size < item.sets) return false;
        const bandedRows = rows.filter((log) => log.banded).length;
        if (bandedRows > 0 && bandedRows < rows.length) return false;
        return rows.every(
          (log) => (logsReps(item.type) ? log.reps ?? 0 : log.seconds ?? 0) >= ceiling
        );
      });

  async function save() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/client/completions", {
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
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחנו לשמור");
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <Shell>
      <div className="pt-8 text-center">
        <p className="mb-2 text-6xl">💪</p>
        <h1 className="mb-1 text-3xl font-bold">אימון הושלם</h1>
        <p className="mb-8 text-sm" style={{ color: "var(--dim)" }}>
          {mmss(durationSec)} דקות
        </p>
      </div>

      {/* הסיכום של האימון — כדאי שיראה מה נרשם */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="glass rounded-3xl px-3 py-4 text-center">
          <b className="block text-2xl font-extrabold wood-text tabular-nums">
            {totalReps}
          </b>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            חזרות סה״כ
          </span>
        </div>
        <div className="glass rounded-3xl px-3 py-4 text-center">
          <b className="block text-2xl font-extrabold tabular-nums">{totalSeconds}</b>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            שניות בהחזקות
          </span>
        </div>
      </div>

      {promoted.length > 0 && (
        <div
          className="mb-4 rounded-3xl px-5 py-4"
          style={{
            background: "rgba(180,133,79,.18)",
            border: "1px solid rgba(224,190,147,.45)",
          }}
        >
          <p className="mb-1 font-bold wood-text">עלית דרגה</p>
          {/*
            רשימה במקום משפט אחד ארוך. שמונה שמות תרגילים בשורה אחת עם
            פסיקים זה טקסט שאף אחד לא קורא, ובטח לא אחרי אימון.
          */}
          <p className="text-sm leading-relaxed">
            {promoted.length === 1
              ? `הגעת ליעד בכל הסטים של ${promoted[0].name}.`
              : `הגעת ליעד בכל הסטים בתרגילים האלה:`}
          </p>
          {promoted.length > 1 && (
            <ul className="mt-1.5 space-y-0.5 text-sm font-bold">
              {promoted.map((item) => (
                <li key={item.name}>· {item.name}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm leading-relaxed">
            {promoted.length === 1
              ? "באימון הבא התרגיל הזה נהיה קשה יותר: מנמיכים את הטבעות או מגדילים את השיפוע, ומתחילים שוב ממספר נמוך יותר. האפליקציה תזכיר לך את זה כשתגיע אליו."
              : "באימון הבא התרגילים האלה נהיים קשים יותר: מנמיכים את הטבעות או מגדילים את השיפוע, ומתחילים שוב ממספר נמוך יותר. האפליקציה תזכיר לך את זה כשתגיע אליהם."}
          </p>
        </div>
      )}

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
                <span className="shrink-0 text-left font-bold tabular-nums" style={{ color: comparable && delta != null && delta < 0 ? "var(--danger-text)" : "var(--wood-1)" }}>
                  {previous == null
                    ? `${current} · אין נתון קודם`
                    : !comparable
                      ? `${current} · אין השוואה ישירה`
                      : delta === 0
                        ? `${current} · ללא שינוי`
                        : delta! > 0
                          ? `${current} · עלייה של ${delta}`
                          : `${current} · ירידה של ${Math.abs(delta!)}`}
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
        <div className="flex gap-1" dir="rtl" aria-label="סולם כאב מ-0 עד 10">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              // לחיצה שנייה על אותו מספר מבטלת. אחרת מי שלחץ בטעות
              // נשאר עם דיווח כאב שהוא לא התכוון לשלוח.
              onClick={() => setPain(pain === n ? null : n)}
              className="min-w-0 flex-1 rounded-lg py-2.5 text-xs font-bold"
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
