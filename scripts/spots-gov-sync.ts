/**
 * ייבוא מתקני כושר פתוחים ממאגר מתקני הספורט הממשלתי:
 *   npm run spots:gov
 *
 * למה צריך מקור שני:
 * OpenStreetMap ממופה בידי מתנדבים, ולכן הכיסוי שלו חזק במרכז וחלש
 * בכל השאר. ביהוד, למשל, כמעט אין בו כלום, בזמן שבפועל יש שם מתקני
 * כושר בגן אוקלהומה, גן בגין, גן כצנלסון וגן אפרסק. המאגר הממשלתי
 * מדווח בידי הרשויות עצמן, ולכן הוא מכסה גם ערים קטנות.
 *
 * הקואורדינטות שם הן ברשת ישראל ולא ב-GPS. ההמרה ואימותה מוסברים
 * ב-src/lib/itm.ts.
 *
 * ── מה הסקריפט הזה לא עושה ─────────────────────────────────────────────
 *
 * הוא נוגע אך ורק בשורות שהוא עצמו הביא (source='gov'), ורק בשם, בעיר
 * ובקואורדינטה. אישור של איתי, דיווח של מתאמן, הערה והסתרה לא נכתבים
 * כאן אף פעם, וגם לא שורות של OSM או של מתאמנים. אותה הפרדה בדיוק
 * שמתוארת ב-spots-sync.
 */
import { randomUUID } from "crypto";
import db, { initDb } from "../src/lib/db";
import { itmToWgs84, normalizeItm } from "../src/lib/itm";
import { distanceKm } from "../src/lib/spots";

const RESOURCE_ID = "f8dbd3ed-2c62-4d0e-bbaa-b6a15a0e5f7d";
const FACILITY_TYPE = "מתקן פתוח לכושר גופני";
const PAGE_SIZE = 200;

/**
 * מרחק שמתחתיו מתקן ממשלתי נחשב לאותו מקום שכבר קיים אצלנו.
 *
 * הקואורדינטות במאגר הממשלתי מדויקות לרמת כתובת: בהצלבה מול נקודות
 * OSM שתיארו את אותו מתקן, המרחק החציוני היה 119 מטר. סף של 60 מטר
 * כמו בהוספה מהאפליקציה היה יוצר כאן זוגות כפולים של אותו פארק.
 * המחיר הוא שני מתקנים נפרדים בפארק גדול שייספרו כאחד, וזה מחיר נמוך
 * בהרבה מרשימה שמציגה את אותו מקום פעמיים.
 */
const SAME_PLACE_METERS = 150;

type GovRecord = { [key: string]: string | null };

async function fetchPage(offset: number): Promise<GovRecord[]> {
  const url = new URL("https://data.gov.il/api/3/action/datastore_search");
  url.searchParams.set("resource_id", RESOURCE_ID);
  url.searchParams.set("filters", JSON.stringify({ "סוג מתקן": FACILITY_TYPE }));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<")) {
    throw new Error(
      `data.gov.il לא החזיר נתונים (${res.status}). ${text.replace(/\s+/g, " ").slice(0, 200)}`
    );
  }
  return JSON.parse(text).result.records ?? [];
}

async function fetchAll(): Promise<GovRecord[]> {
  const all: GovRecord[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage(offset);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    // עצירת ביטחון, שלא ניכנס ללולאה אינסופית אם ה-API משנה התנהגות.
    if (offset > 20000) break;
  }
  return all;
}

async function main() {
  await initDb();

  console.log("מושך ממאגר מתקני הספורט הממשלתי...");
  const records = await fetchAll();
  console.log(`התקבלו ${records.length} מתקנים פתוחים לכושר גופני.`);

  // כל מה שכבר במסד, פעם אחת, כדי לא לשאול את המסד על כל רשומה בנפרד.
  const existing = (
    await db.execute("SELECT gov_id, source, lat, lng FROM spots")
  ).rows.map((row) => ({
    govId: row.gov_id ? String(row.gov_id) : null,
    source: String(row.source),
    lat: Number(row.lat),
    lng: Number(row.lng),
  }));
  const knownGovIds = new Set(
    existing.filter((s) => s.govId).map((s) => s.govId as string)
  );

  let added = 0;
  let updated = 0;
  let merged = 0;
  let skipped = 0;

  for (const record of records) {
    const govId = String(record["מספר זיהוי"] ?? "").trim();
    const coords = normalizeItm(
      Number(record["ציר X"]),
      Number(record["ציר Y"])
    );
    if (!govId || !coords) {
      skipped++;
      continue;
    }

    const [lat, lng] = itmToWgs84(coords.x, coords.y);
    const isKnown = knownGovIds.has(govId);

    // מתקן שכבר מוכר לנו ממקור אחר. מוסיפים אותו פעם שנייה רק אם אין
    // כלום בסביבה, אחרת המתאמן רואה את אותו פארק פעמיים ברשימה.
    if (!isKnown) {
      const near = existing.find(
        (spot) =>
          distanceKm(lat, lng, spot.lat, spot.lng) * 1000 <= SAME_PLACE_METERS
      );
      if (near) {
        merged++;
        continue;
      }
    }

    const name = String(record["שם המתקן"] ?? "").trim().slice(0, 60);
    const city = String(record["רשות מקומית"] ?? "").trim().slice(0, 60);

    if (isKnown) updated++;
    else {
      added++;
      existing.push({ govId, source: "gov", lat, lng });
      knownGovIds.add(govId);
    }

    await db.execute({
      sql: `INSERT INTO spots (id, source, gov_id, name, city, lat, lng, created_at)
            VALUES (?, 'gov', ?, ?, ?, ?, ?, ?)
            ON CONFLICT(gov_id) DO UPDATE SET
              name = excluded.name,
              city = excluded.city,
              lat  = excluded.lat,
              lng  = excluded.lng
            WHERE spots.source = 'gov'`,
      args: [randomUUID(), govId, name, city, lat, lng, new Date().toISOString()],
    });
  }

  const total = await db.execute("SELECT COUNT(*) AS n FROM spots");
  console.log(
    `נוספו ${added}, עודכנו ${updated}, אוחדו עם קיימים ${merged}, דולגו ${skipped}.`
  );
  console.log(`סך הכל במסד: ${Number(total.rows[0]?.n ?? 0)} מתחים.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
