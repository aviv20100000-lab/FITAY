/**
 * המרה ודחיסה של סרטוני אימון:
 *   npm run videos:convert -- "C:\מקור" "C:\יעד"
 *
 * שתי בעיות שהסקריפט פותר:
 *   1. .mov מהאייפון לא מתנגן בכרום ובאנדרואיד. ממירים ל-H.264/mp4.
 *   2. 30MB לקליפ זה יותר מדי לצפייה בטלפון באמצע אימון.
 *      הדחיסה מגבילה את הצלע הארוכה ל-1920 ומביאה קליפ טיפוסי לכמה מגה.
 *
 * דורש ffmpeg. אם הוא לא מותקן:  winget install Gyan.FFmpeg
 */
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, extname, join } from "path";
import {
  VIDEO_AUDIO_FLAGS,
  VIDEO_CRF,
  VIDEO_SCALE_FILTER,
} from "../src/lib/video-encode";

const SOURCES = new Set([".mov", ".mp4", ".m4v", ".avi"]);
const LEDGER = ".converted.json";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + "MB";

function hasFfmpeg() {
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return !probe.error;
}

/**
 * רישום של מה הומר, לפי טביעת אצבע של תוכן הקובץ.
 *
 * בלי זה ההחלטה "כבר הומר?" מתבססת על שם הקובץ — ואז IMG_1344.MP4
 * ו-IMG_1344.mov, שהם שני קליפים שונים לגמרי, נופלים על אותו שם פלט
 * ואחד מהם נעלם בשקט. זה בדיוק מה שקרה בהרצה הראשונה.
 */
function loadLedger(target: string): Record<string, string> {
  const path = join(target, LEDGER);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function saveLedger(target: string, ledger: Record<string, string>) {
  writeFileSync(join(target, LEDGER), JSON.stringify(ledger, null, 2), "utf8");
}

function main() {
  const [source, target] = process.argv.slice(2);
  if (!source || !target) {
    console.error(
      'חסרים נתיבים. דוגמה: npm run videos:convert -- "C:\\videos" "C:\\videos-web"'
    );
    process.exit(1);
  }
  if (!hasFfmpeg()) {
    console.error(
      "ffmpeg לא מותקן.\n" +
        "התקן אותו ואז הרץ שוב:  winget install Gyan.FFmpeg\n" +
        "(אחרי ההתקנה צריך לפתוח חלון טרמינל חדש)"
    );
    process.exit(1);
  }

  if (!existsSync(target)) mkdirSync(target, { recursive: true });

  const files = readdirSync(source)
    .filter((f) => SOURCES.has(extname(f).toLowerCase()))
    .sort();

  if (!files.length) {
    console.log("לא נמצאו סרטונים בתיקיית המקור.");
    return;
  }

  const ledger = loadLedger(target);
  const seen = new Map<string, string>();
  const taken = new Set(
    readdirSync(target).filter((f) => extname(f).toLowerCase() === ".mp4")
  );

  let done = 0;
  for (const file of files) {
    const input = join(source, file);
    const hash = createHash("sha256").update(readFileSync(input)).digest("hex");

    // גיבוי מהטלפון מייצר עותקים כפולים בשמות כמו "IMG_1341 (1).mov".
    const twin = seen.get(hash);
    if (twin) {
      console.log(`• ${file} — עותק זהה של ${twin}, מדלג`);
      continue;
    }
    seen.set(hash, file);

    const already = ledger[hash];
    if (already && existsSync(join(target, already))) {
      console.log(`• ${file} — כבר הומר (${already}), מדלג`);
      continue;
    }

    // שם פנוי: IMG_1344.mp4, ואם תפוס — IMG_1344-2.mp4 וכן הלאה.
    const stem = basename(file, extname(file));
    let name = `${stem}.mp4`;
    let n = 2;
    while (taken.has(name)) name = `${stem}-${n++}.mp4`;
    taken.add(name);
    const output = join(target, name);

    process.stdout.write(`⟳ ${file} (${mb(statSync(input).size)}) … `);
    const res = spawnSync(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", input,
        // בחירת רצועות מפורשת, זהה ל-src/lib/video-compress.ts.
        "-map", "0:v:0",
        ...VIDEO_AUDIO_FLAGS,
        "-dn", "-sn", "-ignore_unknown",
        // H.264 — הקידוד היחיד שמתנגן בכל טלפון.
        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-crf", VIDEO_CRF, "-preset", "medium",
        // התקרה והמסנן יושבים ב-video-encode.ts, משותפים לכל מסלולי ההמרה.
        "-vf", VIDEO_SCALE_FILTER,
        // מטא־דאטה בתחילת הקובץ — הסרטון מתחיל לנגן לפני שהכל ירד.
        "-movflags", "+faststart",
        output,
      ],
      { encoding: "utf8" }
    );

    if (res.status !== 0) {
      console.log("נכשל");
      console.error(res.stderr);
      taken.delete(name);
      continue;
    }

    ledger[hash] = name;
    saveLedger(target, ledger);
    done++;
    console.log(`הומר → ${name} (${mb(statSync(output).size)})`);
  }

  console.log(`\n✓ ${done} סרטונים חדשים ב-${target}`);
  console.log(`עכשיו: npm run videos:upload -- "${target}"`);
}

main();
