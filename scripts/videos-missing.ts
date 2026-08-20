/**
 * רשימת הצילומים שחסרים לאיתי:
 *   npm run videos:missing
 *
 * למה זה קיים:
 * איתי מצלם את סרטוני ההדגמה, והשאלה "מה עוד צריך לצלם" חוזרת בכל
 * סבב צילומים. במקום לעבור תרגיל־תרגיל בעורך, הסקריפט מדפיס רשימה
 * מקובצת לפי קטגוריה שמוכנה לשליחה בוואטסאפ כמו שהיא.
 *
 * הסקריפט קורא בלבד. שום כתיבה למסד ושום נגיעה ב-R2.
 *
 * מה נחשב חסר:
 * - video_file הוא הסרטון הראשי של כל תרגיל.
 * - תרגיל שמתקדם במנח (progression = 'stance') צריך שלושה סרטונים:
 *   הראשי הוא רמה 1, ובנוסף רמה 2 ורמה 3.
 * - חוץ מחימום. תרגיל חימום לא מציג רמות מנח גם אם הוא מסומן stance —
 *   זה אותו כלל בדיוק כמו `leveled` ב-ExerciseEditor.tsx, ובלעדיו
 *   הרשימה הייתה דורשת מאיתי לצלם סרטונים שאף מסך לא יציג.
 * - תרגיל שמותר בו גומייה (band_allowed) צריך גם סרטון גומייה.
 */
import db, { initDb } from "../src/lib/db";

/** הסדר כאן הוא סדר ההדפסה: מהחימום אל הסקיל, כמו בספרייה. */
const CATEGORY_NAMES: [string, string][] = [
  ["warmup", "חימום"],
  ["pull", "משיכה"],
  ["push", "דחיפה"],
  ["core", "ליבה"],
  ["isolation", "בידוד"],
  ["skill", "סקיל"],
];

/**
 * עמודת סרטון ריקה יכולה להיות NULL או מחרוזת ריקה, תלוי איך היא
 * נשמרה. שתיהן חסרות. לא String(value) — כי String(null) הוא "null".
 */
const empty = (value: unknown) => !(value ?? "");

async function main() {
  await initDb();

  const res = await db.execute(
    `SELECT name, category, progression, band_allowed,
            video_file, stance_video_level_2, stance_video_level_3,
            band_video_file
     FROM exercises ORDER BY position, name`
  );
  const rows = res.rows as unknown as Record<string, unknown>[];

  /**
   * מה חסר לכל תרגיל, לפי אותם כללים שקובעים מה המסכים מציגים.
   * תרגיל בלי שום חוסר לא נכנס לרשימה בכלל.
   */
  const missingOf = (r: Record<string, unknown>) => {
    const missing: string[] = [];
    if (empty(r.video_file)) missing.push("ראשי");
    // אותו תנאי כמו `leveled` בעורך התרגילים: חימום לעולם לא ברמות מנח.
    const leveled =
      String(r.progression) === "stance" && String(r.category) !== "warmup";
    if (leveled) {
      if (empty(r.stance_video_level_2)) missing.push("רמה 2");
      if (empty(r.stance_video_level_3)) missing.push("רמה 3");
    }
    // libsql יכול להחזיר מספר או bigint — השוואה מפורשת ולא truthiness.
    if (Number(r.band_allowed) === 1 && empty(r.band_video_file)) {
      missing.push("גומייה");
    }
    return missing;
  };

  // קטגוריה שלא מוכרת למפה עדיין מודפסת, תחת שמה הגולמי. עדיף שורה
  // מוזרה ברשימה מאשר תרגיל שנעלם מהספירה בשקט.
  const known = new Set(CATEGORY_NAMES.map(([key]) => key));
  const order: [string, string][] = [...CATEGORY_NAMES];
  for (const r of rows) {
    const cat = String(r.category);
    if (!known.has(cat)) {
      known.add(cat);
      order.push([cat, cat]);
    }
  }

  let covered = 0;
  let totalMissing = 0;

  console.log("צילומים חסרים לפי קטגוריה");
  console.log("=========================");
  for (const [key, label] of order) {
    const inCategory = rows.filter((r) => String(r.category) === key);
    if (inCategory.length === 0) continue;
    const withGaps = inCategory
      .map((r) => ({ name: String(r.name), missing: missingOf(r) }))
      .filter((e) => e.missing.length > 0);
    covered += inCategory.length - withGaps.length;
    if (withGaps.length === 0) continue;

    console.log(`\n${label}`);
    for (const e of withGaps) {
      totalMissing += e.missing.length;
      console.log(`• ${e.name} — ${e.missing.join(", ")}`);
    }
  }

  console.log(
    `\nמכוסים במלואם: ${covered} מתוך ${rows.length} תרגילים.` +
      ` נשארו ${totalMissing} סרטונים לצלם.`
  );

  /**
   * סרטונים שיושבים בקטלוג ולא משויכים לאף תרגיל.
   *
   * זה קורה כשסרטון הועלה וטרם חובר בעורך, והרשימה הזאת מונעת בקשה
   * מיותרת מאיתי לצלם משהו שכבר צולם. הבדיקה היא על הכתובת המוגשת
   * (url) מול ארבע עמודות הסרטון של התרגילים — אותה כתובת בדיוק,
   * כי השיוך בעורך שומר את url של הקטלוג כמו שהוא.
   */
  const assigned = new Set<string>();
  for (const r of rows) {
    for (const col of [
      "video_file",
      "stance_video_level_2",
      "stance_video_level_3",
      "band_video_file",
    ]) {
      if (!empty(r[col])) assigned.add(String(r[col]));
    }
  }

  const catalog = await db.execute(
    "SELECT filename, url, uploaded_at FROM videos ORDER BY uploaded_at ASC"
  );
  const orphans = (catalog.rows as unknown as Record<string, unknown>[]).filter(
    (v) => !assigned.has(String(v.url))
  );

  console.log("\nבקטלוג ולא משויכים לאף תרגיל");
  console.log("============================");
  if (orphans.length === 0) {
    console.log("אין. כל סרטון בקטלוג משויך.");
  } else {
    for (const v of orphans) {
      const date = String(v.uploaded_at).slice(0, 10);
      console.log(`• ${v.filename} — הועלה ${date}`);
    }
  }
}

main();
