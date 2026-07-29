/**
 * המרה ודחיסה של סרטוני אימון:
 *   npm run videos:convert -- "C:\מקור" "C:\יעד"
 *
 * שתי בעיות שהסקריפט פותר:
 *   1. .mov מהאייפון לא מתנגן בכרום ובאנדרואיד. ממירים ל-H.264/mp4.
 *   2. 30MB לקליפ זה יותר מדי לצפייה בטלפון באמצע אימון.
 *      הדחיסה מורידה לרוחב 720 ומביאה קליפ טיפוסי לכמה מגה.
 *
 * דורש ffmpeg. אם הוא לא מותקן:  winget install Gyan.FFmpeg
 */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { basename, extname, join } from "path";

const SOURCES = new Set([".mov", ".mp4", ".m4v", ".avi"]);
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + "MB";

function hasFfmpeg() {
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return !probe.error;
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

  let done = 0;
  for (const file of files) {
    const input = join(source, file);
    const output = join(target, basename(file, extname(file)) + ".mp4");
    if (existsSync(output)) {
      console.log(`• ${file} — כבר הומר, מדלג`);
      continue;
    }

    process.stdout.write(`⟳ ${file} (${mb(statSync(input).size)}) … `);
    const res = spawnSync(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", input,
        // H.264 + AAC — הצירוף היחיד שמתנגן בכל טלפון.
        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-crf", "26", "-preset", "slow",
        // רוחב 720, גובה מחושב וזוגי. בלי הגדלה של קליפ קטן.
        "-vf", "scale='min(720,iw)':-2",
        "-c:a", "aac", "-b:a", "96k",
        // מטא־דאטה בתחילת הקובץ — הסרטון מתחיל לנגן לפני שהכל ירד.
        "-movflags", "+faststart",
        output,
      ],
      { encoding: "utf8" }
    );

    if (res.status !== 0) {
      console.log("נכשל");
      console.error(res.stderr);
      continue;
    }
    console.log(`הומר → ${mb(statSync(output).size)}`);
    done++;
  }

  console.log(`\n✓ ${done} סרטונים מוכנים ב-${target}`);
  console.log(`עכשיו: npm run videos:upload -- "${target}"`);
}

main();
