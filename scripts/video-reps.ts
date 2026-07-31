/**
 * זיהוי חזרות בקליפ אימון, לפי מדידה ולא לפי עין:
 *   npm run video:reps -- "C:\נתיב\117.mp4"
 *   npm run video:reps -- "C:\נתיב\117.mp4" --crop=300:900:140:60 --min-gap=0.8
 *
 * למה זה קיים:
 * כדי לחתוך קליפ הדגמה צריך לדעת איפה מתחילה חזרה, איפה התחתית ואיפה
 * הנעילה למעלה. בעין זה עובד, אבל על ספרייה שלמה זה גם איטי וגם לא אחיד,
 * וכל קליפ יוצא מתחיל במקום אחר. כאן זה חישוב.
 *
 * איך זה עובד:
 * ffmpeg מקבל את הפריים, ממיר לגווני אפור ומכווץ אותו לעמודה אחת בגובה
 * ROWS. כלומר כל פריים הופך למספר קטן של מספרים שמתארים "כמה כהה כל
 * גובה בתמונה". מרכז הכובד של הכהות הוא בקירוב טוב הגובה שבו נמצא הגוף,
 * והוא עולה ויורד בדיוק בקצב החזרות.
 *
 * זו לא ראיית מכונה, וזו בדיוק הנקודה: אין תלות בספרייה חיצונית ואין
 * מודל להריץ, רק ffmpeg שכבר נדרש כאן ממילא.
 *
 * מה שהשיטה מניחה:
 * מצלמה נייחת, ומתאמן כהה יותר מהרקע. בקליפים של FITAY, שמצולמים מול
 * שמיים בהירים, זה מתקיים. אם הרקע כהה יותר, --invert הופך את החישוב.
 */
import { spawn } from "child_process";
import { spawnSync } from "child_process";
import { existsSync } from "fs";

/** כמה שורות בפרופיל האנכי של כל פריים. יותר מזה לא מוסיף דיוק. */
const ROWS = 64;

const LEVELS = "▁▂▃▄▅▆▇█";

type Options = {
  file: string;
  crop: string | null;
  minGap: number;
  smooth: number;
  invert: boolean;
};

function parseArgs(argv: string[]): Options {
  const rest = argv.filter((a) => !a.startsWith("--"));
  const flag = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

  return {
    file: rest[0] ?? "",
    // crop=רוחב:גובה:x:y בקואורדינטות של התמונה כפי שהיא מוצגת.
    crop: flag("crop") ?? null,
    // המרווח המינימלי בשניות בין שתי נקודות קיצון. חזרה על טבעות לא
    // לוקחת פחות מזה, וזה מה שמונע ספירה של רעידות כחזרות.
    minGap: Number(flag("min-gap") ?? 0.6),
    smooth: Number(flag("smooth") ?? 5),
    invert: argv.includes("--invert"),
  };
}

function probe(file: string) {
  const res = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=r_frame_rate,width,height",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=0",
      file,
    ],
    { encoding: "utf8" }
  );
  if (res.error || res.status !== 0) {
    throw new Error("ffprobe נכשל. ודא ש-ffmpeg מותקן ונמצא ב-PATH.");
  }
  const get = (key: string) =>
    res.stdout.split("\n").find((l) => l.startsWith(`${key}=`))?.split("=")[1] ?? "";

  const [num, den] = get("r_frame_rate").split("/").map(Number);
  return {
    fps: den ? num / den : num,
    width: Number(get("width")),
    height: Number(get("height")),
    duration: Number(get("duration")),
  };
}

/** הפרופיל האנכי של כל פריים, ROWS מספרים לפריים. */
function readProfiles(file: string, crop: string | null): Promise<number[][]> {
  const filters = [
    crop ? `crop=${crop}` : null,
    "format=gray",
    // width=1 ממצע את כל הרוחב, ולכן נשאר רק "כמה כהה כל גובה".
    `scale=1:${ROWS}:flags=area`,
  ].filter(Boolean);

  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-v", "error",
      "-i", file,
      "-vf", filters.join(","),
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "-",
    ]);

    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.stderr.on("data", (c: Buffer) => errors.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString() || "ffmpeg נכשל"));
        return;
      }
      const data = Buffer.concat(chunks);
      const frames: number[][] = [];
      for (let i = 0; i + ROWS <= data.length; i += ROWS) {
        frames.push(Array.from(data.subarray(i, i + ROWS)));
      }
      resolve(frames);
    });
  });
}

/**
 * מרכז הכובד האנכי של הגוף בפריים, בין 0 למעלה ל-1 למטה.
 *
 * המשקל של כל שורה הוא כמה היא כהה ביחס לשורה הבהירה ביותר בפריים.
 * ההשוואה היא בתוך הפריים ולא לערך קבוע, ולכן שינוי תאורה לאורך הקליפ
 * לא מזיז את הקו.
 */
function centroid(profile: number[], invert: boolean): number {
  const reference = invert
    ? Math.min(...profile)
    : Math.max(...profile);

  let weighted = 0;
  let total = 0;
  for (let row = 0; row < profile.length; row++) {
    const weight = Math.abs(reference - profile[row]);
    weighted += row * weight;
    total += weight;
  }
  // פריים אחיד לגמרי, למשל שחור מלא במעבר. מחזירים את האמצע.
  if (total === 0) return 0.5;
  return weighted / total / (profile.length - 1);
}

function smoothed(values: number[], window: number): number[] {
  if (window < 2) return values;
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length, i + half + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += values[j];
    return sum / (to - from);
  });
}

type Extreme = { frame: number; value: number; kind: "top" | "bottom" };

/**
 * נקודות הקיצון של העקומה, לסירוגין גבוה ונמוך.
 *
 * שני מסננים: מרווח זמן מינימלי בין נקודות, ומשרעת מינימלית ביניהן.
 * בלי המשרעת כל רעד קטן של המצלמה נספר כחזרה.
 */
function extremes(values: number[], fps: number, minGap: number): Extreme[] {
  const gap = Math.max(1, Math.round(minGap * fps));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (span === 0) return [];
  const threshold = span * 0.25;

  const found: Extreme[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const from = Math.max(0, i - gap);
    const to = Math.min(values.length, i + gap + 1);
    let isMax = true;
    let isMin = true;
    for (let j = from; j < to; j++) {
      if (values[j] > values[i]) isMax = false;
      if (values[j] < values[i]) isMin = false;
    }
    // ערך גבוה יותר משמעו נמוך יותר בתמונה, כלומר תחתית התנועה.
    if (isMax) found.push({ frame: i, value: values[i], kind: "bottom" });
    else if (isMin) found.push({ frame: i, value: values[i], kind: "top" });
  }

  const kept: Extreme[] = [];
  for (const point of found) {
    const previous = kept[kept.length - 1];
    if (!previous) {
      kept.push(point);
      continue;
    }
    if (previous.kind === point.kind) {
      // שתי תחתיות ברצף בלי עלייה ביניהן: משאירים את הקיצונית.
      const better =
        point.kind === "bottom"
          ? point.value > previous.value
          : point.value < previous.value;
      if (better) kept[kept.length - 1] = point;
      continue;
    }
    if (Math.abs(point.value - previous.value) < threshold) continue;
    kept.push(point);
  }
  return kept;
}

function sparkline(values: number[], columns = 100): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length / columns;

  let line = "";
  for (let c = 0; c < columns; c++) {
    const value = values[Math.min(values.length - 1, Math.floor(c * step))];
    const level = Math.round(((value - min) / span) * (LEVELS.length - 1));
    line += LEVELS[level];
  }
  return line;
}

const seconds = (frame: number, fps: number) => frame / fps;
const fmt = (value: number) => value.toFixed(2);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.file) {
    console.error('שימוש: npm run video:reps -- "נתיב לקובץ" [--crop=w:h:x:y] [--invert]');
    process.exit(1);
  }
  if (!existsSync(options.file)) {
    console.error(`הקובץ לא נמצא: ${options.file}`);
    process.exit(1);
  }

  const info = probe(options.file);
  const profiles = await readProfiles(options.file, options.crop);
  if (profiles.length < 10) {
    console.error("לא הצלחתי לקרוא מספיק פריימים מהקובץ.");
    process.exit(1);
  }

  const raw = profiles.map((p) => centroid(p, options.invert));
  const curve = smoothed(raw, options.smooth);
  const points = extremes(curve, info.fps, options.minGap);

  console.log(`\nקובץ: ${options.file}`);
  console.log(
    `${info.width}x${info.height} · ${info.fps.toFixed(1)} פריימים לשנייה · ${fmt(info.duration)} שנ׳ · ${profiles.length} פריימים`
  );
  if (options.crop) console.log(`חיתוך: ${options.crop}`);

  console.log(`\nגובה הגוף לאורך הקליפ (למעלה בגרף = למעלה בתנועה):`);
  console.log(sparkline(curve.map((v) => -v)));

  if (points.length < 2) {
    console.log("\nלא זוהתה תנועה מחזורית. נסה --min-gap קטן יותר, או --crop סביב הגוף.");
    return;
  }

  // חזרה שלמה היא תחתית אחת. סופרים אותן ומודדים כל אחת מהשיא שלפניה
  // ועד השיא שאחריה, כי זה בדיוק הקטע שמעניין לחתוך.
  const bottoms = points.filter((p) => p.kind === "bottom");

  // חזרה נספרת רק אם יש לה שיא משני הצדדים. חזרה שהקליפ נחתך באמצעה
  // אינה ניתנת לחיתוך ממילא, ולכן היא מדווחת בנפרד ולא בטבלה.
  const reps: { index: number; start: number; bottom: number; end: number }[] = [];
  let partial = 0;
  for (const bottom of bottoms) {
    const before = [...points]
      .reverse()
      .find((p) => p.kind === "top" && p.frame < bottom.frame);
    const after = points.find((p) => p.kind === "top" && p.frame > bottom.frame);
    if (!before || !after) {
      partial++;
      continue;
    }
    reps.push({
      index: reps.length + 1,
      start: seconds(before.frame, info.fps),
      bottom: seconds(bottom.frame, info.fps),
      end: seconds(after.frame, info.fps),
    });
  }

  console.log(
    `\nזוהו ${reps.length} חזרות שלמות` +
      (partial > 0 ? ` ועוד ${partial} חתוכות בקצה הקליפ` : "") +
      ":\n"
  );
  console.log("  #   התחלה    תחתית    סיום     אורך");
  for (const rep of reps) {
    console.log(
      `  ${String(rep.index).padStart(2)}   ${fmt(rep.start).padStart(6)}   ${fmt(
        rep.bottom
      ).padStart(6)}   ${fmt(rep.end).padStart(6)}   ${fmt(
        rep.end - rep.start
      ).padStart(5)} שנ׳`
    );
  }

  if (reps.length < 2) return;

  /**
   * הרצף הכי אחיד, ולא הכי ארוך.
   *
   * לקליפ הדגמה רוצים חזרות שנראות אותו דבר. שלוש חזרות באותו קצב עדיפות
   * על שש שהאחרונות בהן כבר נשברות מעייפות, וזה בדיוק מה שקורה בסוף סט.
   */
  const windowSize = Math.min(3, reps.length);
  let best = { from: 0, spread: Infinity };
  for (let i = 0; i + windowSize <= reps.length; i++) {
    const slice = reps.slice(i, i + windowSize);
    const lengths = slice.map((r) => r.end - r.start);
    const spread = Math.max(...lengths) - Math.min(...lengths);
    if (spread < best.spread) best = { from: i, spread };
  }

  const chosen = reps.slice(best.from, best.from + windowSize);
  const from = chosen[0].start;
  const to = chosen[chosen.length - 1].end;
  console.log(
    `\nהרצף האחיד ביותר: חזרות ${chosen[0].index} עד ${chosen[chosen.length - 1].index}, ` +
      `${fmt(from)} עד ${fmt(to)} שנ׳`
  );
  console.log(`  -ss ${fmt(from)} -t ${fmt(to - from)}`);
}

main().catch((e) => {
  console.error("נכשל:", e instanceof Error ? e.message : e);
  process.exit(1);
});
