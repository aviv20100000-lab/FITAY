/**
 * רשת ביטחון לדחיסה.
 *
 * הדחיסה עצמה רצה מיד אחרי ההעלאה, בתוך אותה הפעלה של השרת. אם ההפעלה
 * נחתכה באמצע, או שהקליפ היה ארוך מהתקרה, השורה נשארת ב-pending או
 * ב-failed. המסלול הזה אוסף אותן ומנסה שוב.
 *
 * מופעל אוטומטית לפי vercel.json. אין פה שום צעד ידני.
 */
import { after, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { compressVideo, pendingVideoIds } from "@/lib/video-compress";
import { generatePoster, postersPendingIds } from "@/lib/video-poster";
import { sweepLevelCheckVideos } from "@/lib/level-check";
import { isCronAuthorized } from "@/lib/cron-auth";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export const maxDuration = 300;

// שמונה השניות האחרונות נשארות לשאילתות הסיום, לתשובה ולהפעלת השרשור הבא.
const WORK_BUDGET_MS = 292 * 1000;

/**
 * כמה זמן חייב להישאר כדי להתחיל דחיסה נוספת.
 *
 * כאן ישב 290 שניות, בזמן שהתקציב הכולל הוא 292. המשמעות היא שהתנאי
 * נכשל מיד אחרי הקליפ הראשון, ולכן **כל הפעלה טיפלה בקליפ אחד בלבד**
 * ונשענה על השרשור לכל השאר. ההערה שמעל הלולאה תמיד אמרה 50 שניות,
 * כלומר הכוונה המקורית הייתה אחרת מהמספר שנכתב.
 *
 * זה נמדד ב-19 באוגוסט 2026: לחיצה על Run טיפלה בשלושה קליפים ואז
 * התור עמד עשר דקות בלי תזוזה, ושבעה קליפים הושלמו ידנית מהמחשב.
 *
 * 75 שניות ולא 50: הקליפים גדלו מאז ל-4K, ומדידה בפרודקשן על קליפ של
 * 32MB נתנה 24 שניות מקצה לקצה. 75 נותן מרווח גם לקליפ כבד וגם לרשת
 * איטית, ומאפשר שלושה קליפים בהפעלה במקום אחד.
 *
 * מה ששומר על זה בטוח הוא הדדליין שמועבר ל-compressVideo. בלעדיו קליפ
 * שמתחיל מאוחר בלולאה היה מקבל חלון של הפעלה שלמה ונחתך באמצע.
 */
const COMPRESSION_START_BUDGET_MS = 75 * 1000;
// זה deadline לכל הפוסטר, כולל הורדה והעלאה, ולא טיימר חדש לכל ניסיון ffmpeg.
const POSTER_BUDGET_MS = 20 * 1000;
const QUEUE_BATCH_SIZE = 25;
const MAX_CHAIN_DEPTH = 12;

type WorkResult = {
  id: string;
  kind: "compression" | "poster";
  status: string;
  reason?: string;
};

type RunReport = {
  processed: number;
  results: WorkResult[];
  workRemaining: boolean;
  stopReason: "empty" | "budget" | "compression_queue" | "poster_batch";
  elapsedMs: number;
};

function depthFrom(request: Request) {
  const raw = new URL(request.url).searchParams.get("depth");
  if (raw === null) return 0;
  if (!/^(0|[1-9]\d*)$/.test(raw)) return null;

  const depth = Number(raw);
  return Number.isSafeInteger(depth) && depth <= MAX_CHAIN_DEPTH ? depth : null;
}

function resultFor(
  id: string,
  kind: WorkResult["kind"],
  outcome: { status: string; reason?: string }
): WorkResult {
  return {
    id,
    kind,
    status: outcome.status,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
  };
}

async function runQueue(startedAt: number): Promise<RunReport> {
  const results: WorkResult[] = [];
  const timeLeft = () => WORK_BUDGET_MS - (Date.now() - startedAt);
  let stoppedForBudget = false;

  await initDb();

  /*
   * דחיסה נוספת מתחילה רק אם נשאר לה חלון מלא, ולא לפי המהירות של
   * הקליפ הקודם. ראה COMPRESSION_START_BUDGET_MS.
   *
   * הדדליין מועבר פנימה ולא מחושב מחדש בכל קליפ: הוא של ההפעלה כולה,
   * כדי שקליפ שמתחיל מאוחר בלולאה לא יחשוב שיש לו חלון שכבר נגמר.
   */
  const compressionIds = await pendingVideoIds(QUEUE_BATCH_SIZE);
  for (const id of compressionIds) {
    if (timeLeft() < COMPRESSION_START_BUDGET_MS) {
      stoppedForBudget = true;
      break;
    }
    const outcome = await compressVideo(id, {
      deadlineAt: startedAt + WORK_BUDGET_MS,
    });
    results.push(resultFor(id, "compression", outcome));
  }

  const compressionStillPending = (await pendingVideoIds(1)).length > 0;
  if (compressionStillPending) {
    return {
      processed: results.length,
      results,
      workRemaining: true,
      stopReason: stoppedForBudget ? "budget" : "compression_queue",
      elapsedMs: Date.now() - startedAt,
    };
  }

  /*
   * פוסטרים מתחילים רק אחרי שתור הדחיסה התרוקן, כי הדחיסה מחליפה את כתובת
   * הסרטון. אותו deadline עוצר את כל שלבי הפוסטר ולא רק את ffmpeg.
   */
  const posterIds = await postersPendingIds(QUEUE_BATCH_SIZE);
  for (const id of posterIds) {
    if (timeLeft() < POSTER_BUDGET_MS) {
      stoppedForBudget = true;
      break;
    }
    const outcome = await generatePoster(id, {
      deadlineAt: Math.min(
        Date.now() + POSTER_BUDGET_MS,
        startedAt + WORK_BUDGET_MS
      ),
    });
    results.push(resultFor(id, "poster", outcome));
  }

  const postersStillPending = (await postersPendingIds(1)).length > 0;
  return {
    processed: results.length,
    results,
    workRemaining: postersStillPending,
    stopReason: postersStillPending
      ? stoppedForBudget
        ? "budget"
        : "poster_batch"
      : "empty",
    elapsedMs: Date.now() - startedAt,
  };
}

async function triggerNext(request: Request, depth: number, secret: string) {
  try {
    const url = new URL(request.url);
    url.searchParams.set("depth", String(depth + 1));
    url.searchParams.set("background", "1");
    await fetch(url, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
  } catch {
    // הכשל שייך לשרשור הבא; העבודה שכבר הסתיימה בהפעלה הזאת נשארת הצלחה.
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  // ב-Vercel ה-cron מגיע עם CRON_SECRET בכותרת. בלי הבדיקה כל אחד ברשת
  // היה יכול להפעיל תור דחיסה ולשרוף זמן חישוב.
  //
  // האימות חובה גם בפיתוח, כי גם השרת המקומי מחובר למסד החי.
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  }
  const secret = process.env.CRON_SECRET!.trim();

  const depth = depthFrom(request);
  if (depth === null) {
    return NextResponse.json(
      { error: `depth חייב להיות מספר שלם בין 0 ל-${MAX_CHAIN_DEPTH}` },
      { status: 400 }
    );
  }

  const background = new URL(request.url).searchParams.get("background") === "1";

  /*
   * ניקוי סרטוני בדיקת הרמה רוכב על ה-cron הזה ולא על רשומה רביעית
   * ב-vercel.json. רק בחוליה הראשונה: המסלול קורא לעצמו שוב כשנשארה
   * עבודה, ואין סיבה לסרוק את אותן שורות שוב בכל חוליה.
   */
  if (depth === 0) {
    after(async () => {
      try {
        await initDb();
        await sweepLevelCheckVideos();
      } catch {
        // ניקוי שנכשל ינסה שוב מחר. הוא לא אמור להפיל את תור הדחיסה.
      }
    });
  }

  if (background) {
    after(async () => {
      const report = await runQueue(startedAt);
      if (report.workRemaining && depth < MAX_CHAIN_DEPTH && secret) {
        await triggerNext(request, depth, secret);
      }
    });
    return NextResponse.json({ accepted: true, depth }, { status: 202 });
  }

  const report = await runQueue(startedAt);
  const canChain = report.workRemaining && depth < MAX_CHAIN_DEPTH && Boolean(secret);
  if (canChain) {
    after(() => triggerNext(request, depth, secret!));
  }

  const chainReason = !report.workRemaining
    ? "no_work"
    : depth >= MAX_CHAIN_DEPTH
      ? "depth_cap"
      : !secret
        ? "missing_secret"
        : "scheduled";

  return NextResponse.json({
    ...report,
    depth,
    chain: { scheduled: canChain, reason: chainReason },
  });
}
