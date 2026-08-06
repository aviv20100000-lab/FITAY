/**
 * מתחים ציבוריים: מציאת הקרובים ביותר לנקודה.
 *
 * המסד הוא SQLite ואין בו פונקציות גיאוגרפיות, ולכן החישוב עובד בשני
 * שלבים. קודם תיבה מלבנית סביב הנקודה, שהאינדקס יודע לצמצם, ואחר כך
 * מרחק אמיתי בקוד על מה שחזר. תיבה מסננת יותר מדי רק בקצוות, והכמות
 * שמגיעה ממנה קטנה מספיק כדי שהחישוב בקוד יהיה זניח.
 */
import db from "./db";

export type Spot = {
  id: string;
  source: "osm" | "user";
  name: string;
  city: string;
  lat: number;
  lng: number;
  ringsOk: boolean;
  ringsClaim: boolean;
  hidden: boolean;
  note: string;
  distanceKm: number;
};

const EARTH_KM = 6371;
const KM_PER_DEG_LAT = 111;

export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * רדיוסי החיפוש, מהקרוב להרחב.
 *
 * הרשימה קיימת כדי שלא יהיה מסך ריק. יש כמה מאות מתחים במסד ורובם במרכז,
 * ומתאמן ביישוב קטן שהיה מקבל "לא נמצאו תוצאות" היה מסיק שהמסך שבור.
 * במקום זה החיפוש מתרחב עד שיש משהו, והמסך אומר בכנות כמה רחוק זה.
 */
const RADII_KM = [3, 10, 30, 120];

function boxArgs(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  // קווי אורך מתקרבים זה לזה ככל שעולים בקו רוחב. הרצפה מונעת חלוקה
  // באפס ליד הקטבים, מקום שאיש מהמתאמנים לא יהיה בו.
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const dLng = radiusKm / (KM_PER_DEG_LAT * cos);
  return [lat - dLat, lat + dLat, lng - dLng, lng + dLng];
}

const SELECT_COLUMNS = `id, source, name, city, lat, lng, rings_ok, rings_claim, hidden, note`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSpot(row: any, fromLat: number, fromLng: number): Spot {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  return {
    id: String(row.id),
    source: String(row.source) === "osm" ? "osm" : "user",
    name: String(row.name ?? ""),
    city: String(row.city ?? ""),
    lat,
    lng,
    ringsOk: Number(row.rings_ok) === 1,
    ringsClaim: Number(row.rings_claim) === 1,
    hidden: Number(row.hidden) === 1,
    note: String(row.note ?? ""),
    distanceKm: distanceKm(fromLat, fromLng, lat, lng),
  };
}

/**
 * המיון הוא לפי מרחק בלבד.
 *
 * מפתה להעלות את המאושרים לראש הרשימה, אבל אז מתח מאושר במרחק 20 קילומטר
 * יושב מעל מתח לא מאושר במרחק 200 מטר, וזאת רשימה שאי אפשר לסמוך עליה.
 * ההבחנה בין מאושר לכזה שלא נעשית בתג, במקום בסדר.
 */
export async function nearestSpots(
  lat: number,
  lng: number,
  { limit = 20, includeHidden = false }: { limit?: number; includeHidden?: boolean } = {}
): Promise<{ spots: Spot[]; radiusKm: number }> {
  for (const radiusKm of RADII_KM) {
    const res = await db.execute({
      sql: `SELECT ${SELECT_COLUMNS} FROM spots
             WHERE (hidden = 0 OR ?)
               AND lat BETWEEN ? AND ?
               AND lng BETWEEN ? AND ?
             LIMIT 500`,
      args: [includeHidden ? 1 : 0, ...boxArgs(lat, lng, radiusKm)],
    });

    const spots = res.rows
      .map((row) => rowToSpot(row, lat, lng))
      .filter((spot) => spot.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    if (spots.length) return { spots, radiusKm };
  }

  return { spots: [], radiusKm: RADII_KM[RADII_KM.length - 1] };
}

/**
 * מתח קיים באותה נקודה בערך.
 *
 * שני אנשים שיוסיפו את אותו מתח מגן השכונה יוצרים שתי שורות, ואחרי חודש
 * הרשימה מלאה כפילויות ונראית מוזנחת. המרחק נדיב בכוונה: קליטת GPS בין
 * בניינים סוטה בעשרות מטרים, ושתי נקודות במרחק כזה הן כמעט תמיד אותו מתקן.
 */
export async function findSpotNear(lat: number, lng: number, meters = 60) {
  const radiusKm = meters / 1000;
  const res = await db.execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM spots
           WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
           LIMIT 50`,
    args: boxArgs(lat, lng, radiusKm),
  });

  const near = res.rows
    .map((row) => rowToSpot(row, lat, lng))
    .filter((spot) => spot.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return near[0] ?? null;
}
