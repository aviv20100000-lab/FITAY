/**
 * ייבוא מתקני כושר ציבוריים מ-OpenStreetMap:
 *   npm run spots:sync
 *
 * למה זה סקריפט ולא שאילתה חיה מהאפליקציה:
 * Overpass הוא שירות ציבורי עם מכסה לפי כתובת IP. שתי שאילתות בדיקה
 * מאותו מחשב כבר החזירו "rate_limited". אפליקציה ששולחת שאילתה בכל
 * פתיחת מסך הייתה נחסמת ביום הראשון. לכן הנתונים נמשכים פעם אחת,
 * יושבים במסד שלנו, והמסך מדבר רק איתו.
 *
 * ── מה הסקריפט הזה לא עושה, וזה העיקר ──────────────────────────────────
 *
 * הוא לא נוגע בשורות שנוספו מהאפליקציה (source='user'), והוא לא נוגע
 * באישור של איתי, בדיווח של מתאמן, בהערה או בהסתרה, גם לא בשורות שהוא
 * עצמו הביא. הוא מעדכן קואורדינטה, שם ועיר, וזה הכל.
 *
 * זאת לא זהירות סתמית. `exercises:sync` דרס בשקט כל תיקון שאיתי כתב
 * מתוך האפליקציה, כי שם אותן עמודות נכתבות משני מקורות. ראה AGENTS.md.
 * כאן ההפרדה בנויה לתוך הטבלה: עמודות של OSM ועמודות של בני אדם.
 *
 * בטוח להרצה חוזרת. מתקן קיים מתעדכן, חדש נוסף, ואף אחד לא נמחק.
 * מתקן שנעלם מ-OSM נשאר במסד: יכול להיות שהוא נמחק שם בטעות, ומחיקה
 * אצלנו הייתה מוחקת איתו גם אישור שאיתי נתן.
 */
import { randomUUID } from "crypto";
import db, { initDb } from "../src/lib/db";

/**
 * שרתי Overpass, לפי סדר ניסיון.
 *
 * הראשון הוא הרשמי והעמוס ביותר, ובשעות מסוימות הוא מחזיר 504 או חסימת
 * מכסה בלי קשר למה שביקשנו. השאר הם מראות של אותם נתונים בדיוק. עם
 * רשימה אחת שורה זה ההבדל בין סקריפט שעובד לסקריפט שצריך לנסות בערב.
 */
const MIRRORS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
      "https://overpass.osm.jp/api/interpreter",
    ];

const ATTEMPTS_PER_MIRROR = 2;
const WAIT_MS = 20000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// תיבה סביב ישראל. גבולות גסים בכוונה: מתקן שנופל מחוץ לטווח שבו יש
// מתאמנים פשוט לא יופיע באף חיפוש, ולכן עדיף רחב מדי מצר מדי.
const BBOX = "29.4,34.2,33.4,35.95";

const QUERY = `[out:json][timeout:180];
(
  nwr["leisure"="fitness_station"](${BBOX});
  nwr["fitness_station"](${BBOX});
  nwr["leisure"="pitch"]["sport"="exercise"](${BBOX});
);
out center;`;

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function tryMirror(url: string): Promise<OverpassElement[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // בלי User-Agent השרת מחזיר "Not Acceptable" ולא נתונים. הוא חוסם
      // לקוחות אנונימיים, ו-fetch של Node לא שולח כזה מעצמו.
      "User-Agent": "FITAY/1.0 (spots sync; https://fitay.vercel.app)",
      Accept: "application/json",
    },
    body: new URLSearchParams({ data: QUERY }),
  });

  const text = await res.text();
  // Overpass מחזיר HTML עם הסבר כשהמכסה נגמרה או כשהשאילתה נפלה בזמן,
  // ולא JSON עם קוד שגיאה. לכן בודקים גם את תחילת הגוף ולא רק את הסטטוס.
  if (!res.ok || text.trimStart().startsWith("<")) {
    throw new Error(`${res.status} ${text.replace(/\s+/g, " ").slice(0, 160)}`);
  }

  return JSON.parse(text).elements ?? [];
}

/**
 * מעבר על השרתים, עם המתנה בין ניסיונות.
 *
 * 504 ו-429 הם המצב הרגיל בשעות עומס ולא תקלה אצלנו, ולכן שווה לחזור
 * ולנסות במקום ליפול. אם כל השרתים סירבו, השגיאה מפרטת מה כל אחד אמר.
 */
async function fetchElements(): Promise<OverpassElement[]> {
  const failures: string[] = [];

  for (const url of MIRRORS) {
    const host = new URL(url).host;
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MIRROR; attempt++) {
      try {
        console.log(`מנסה ${host} (ניסיון ${attempt})...`);
        return await tryMirror(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  לא הצליח: ${message}`);
        failures.push(`${host}: ${message}`);
        if (attempt < ATTEMPTS_PER_MIRROR) await sleep(WAIT_MS);
      }
    }
  }

  throw new Error(
    `אף שרת של Overpass לא החזיר נתונים.\n${failures.join("\n")}\nזה כמעט תמיד עומס זמני. נסה שוב בעוד רבע שעה.`
  );
}

async function main() {
  await initDb();

  console.log("מושך מ-OpenStreetMap...");
  const elements = await fetchElements();
  console.log(`התקבלו ${elements.length} מתקנים.`);

  const before = await db.execute(
    "SELECT osm_id FROM spots WHERE source = 'osm' AND osm_id IS NOT NULL"
  );
  const known = new Set(before.rows.map((row) => String(row.osm_id)));

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    // דרך או שטח בלי מרכז מחושב. בלי קואורדינטה אין מה לעשות עם הרשומה.
    if (typeof lat !== "number" || typeof lng !== "number") {
      skipped++;
      continue;
    }

    const tags = element.tags ?? {};
    const osmId = `${element.type}/${element.id}`;
    const name = (tags["name:he"] ?? tags.name ?? "").slice(0, 60);
    const city = (tags["addr:city"] ?? "").slice(0, 60);

    if (known.has(osmId)) updated++;
    else added++;

    await db.execute({
      sql: `INSERT INTO spots (id, source, osm_id, name, city, lat, lng, created_at)
            VALUES (?, 'osm', ?, ?, ?, ?, ?, ?)
            ON CONFLICT(osm_id) DO UPDATE SET
              name = excluded.name,
              city = excluded.city,
              lat  = excluded.lat,
              lng  = excluded.lng
            WHERE spots.source = 'osm'`,
      args: [
        randomUUID(),
        osmId,
        name,
        city,
        lat,
        lng,
        new Date().toISOString(),
      ],
    });
  }

  const total = await db.execute("SELECT COUNT(*) AS n FROM spots");
  console.log(`נוספו ${added}, עודכנו ${updated}, דולגו ${skipped}.`);
  console.log(`סך הכל במסד: ${Number(total.rows[0]?.n ?? 0)} מתחים.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
