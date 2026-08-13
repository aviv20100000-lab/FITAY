/**
 * יוצר רשימת יישובים סטטית עם נקודות מרכז:
 *   npm run localities:generate
 *
 * רשימת השמות מגיעה מהמשאב הרשמי של רשות האוכלוסין ב-data.gov.il.
 * הקואורדינטות מותאמות מקומית לאובייקטי place וגבולות יישוב של OpenStreetMap,
 * שנמשכים בבקשה מרוכזת אחת מ-Overpass ונשמרים במטמון. כך לא מבצעים גאוקידוד
 * המוני מול Nominatim הציבורי, שאוסר שימוש שיטתי כזה.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RESOURCE_ID = "8f714b6f-c35c-4b40-a0e7-547b675eee0e";
const COORDINATES_RESOURCE_ID = "e9701dcb-9f1c-43bb-bd44-eb380ade542f";
const OFFICIAL_URL = `https://data.gov.il/api/3/action/datastore_search?resource_id=${RESOURCE_ID}&limit=2000`;
const COORDINATES_URL = `https://data.gov.il/api/3/action/datastore_search?resource_id=${COORDINATES_RESOURCE_ID}&limit=2000`;
const OVERPASS_URLS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
    ];
const USER_AGENT = "FITAY/1.0 (localities generator; https://fitay.vercel.app)";
const BBOX = { minLat: 29.4, maxLat: 33.4, minLng: 34.2, maxLng: 35.9 };
const CACHE_DIR = path.join(process.cwd(), "data", "localities-cache");
const OFFICIAL_CACHE = path.join(CACHE_DIR, "official-localities.json");
const COORDINATES_CACHE = path.join(CACHE_DIR, "government-coordinate-points.json");
const OSM_CACHE = path.join(CACHE_DIR, "osm-places.json");
const OUTPUT = path.join(process.cwd(), "src", "lib", "localities.ts");

type OfficialRecord = { city_code: number | string; city_name_he: string };
type CoordinateRecord = { symbol_number: number | string; name_in_hebrew: string; X: number | null; Y: number | null };
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
type Locality = { name: string; lat: number; lng: number };

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[׳’`]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/\s*[-‐‑‒–—―־]\s*/g, "-")
    .replace(/\s+/g, " ");

// מפתח משני שסובל מהבדלי מקפים, גרשיים וסוגריים אך אינו זורק מילות הבחנה.
const nameKey = (value: string) => normalize(value).replace(/[^\u05D0-\u05EA]/g, "");

const hebrewOnly = (value: string) => /[\u0590-\u05FF]/.test(value) && !/[A-Za-z]/.test(value);
const insideBox = (lat: number, lng: number) =>
  lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...init?.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 300)}`);
  return response.json() as Promise<T>;
}

async function readCache<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function loadOfficial(): Promise<OfficialRecord[]> {
  const cached = await readCache<OfficialRecord[]>(OFFICIAL_CACHE);
  if (cached) return cached;
  const data = await fetchJson<{ success: boolean; result: { total: number; records: OfficialRecord[] } }>(OFFICIAL_URL);
  if (!data.success || data.result.total !== 1310) throw new Error(`ציפינו ל-1310 רשומות רשמיות וקיבלנו ${data.result.total}`);
  await writeFile(OFFICIAL_CACHE, JSON.stringify(data.result.records, null, 2) + "\n", "utf8");
  return data.result.records;
}

async function loadCoordinatePoints(): Promise<CoordinateRecord[]> {
  const cached = await readCache<CoordinateRecord[]>(COORDINATES_CACHE);
  if (cached) return cached;
  const data = await fetchJson<{ success: boolean; result: { records: CoordinateRecord[] } }>(COORDINATES_URL);
  if (!data.success) throw new Error("משאב נקודות היישובים לא הוחזר בהצלחה");
  await writeFile(COORDINATES_CACHE, JSON.stringify(data.result.records, null, 2) + "\n", "utf8");
  return data.result.records;
}

/** המרת רשת ישראל החדשה EPSG:2039 ל-WGS84. */
function itmToWgs84(x: number, y: number): { lat: number; lng: number } {
  const a = 6378137;
  const e2 = 0.0066943800229;
  const ep2 = e2 / (1 - e2);
  const k0 = 1.0000067;
  const lat0 = (31.73439361111111 * Math.PI) / 180;
  const lon0 = (35.20451694444445 * Math.PI) / 180;
  const e0 = 219529.584;
  const n0 = 626907.39;
  const meridian = (lat: number) =>
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * lat) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat));
  const m = meridian(lat0) + (y - n0) / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const fp =
    mu +
    (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) +
    (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) +
    (151 * e1 ** 3 / 96) * Math.sin(6 * mu) +
    (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sin = Math.sin(fp);
  const cos = Math.cos(fp);
  const tan = Math.tan(fp);
  const c1 = ep2 * cos ** 2;
  const t1 = tan ** 2;
  const n1 = a / Math.sqrt(1 - e2 * sin ** 2);
  const r1 = (a * (1 - e2)) / (1 - e2 * sin ** 2) ** 1.5;
  const d = (x - e0) / (n1 * k0);
  const lat =
    fp -
    (n1 * tan / r1) *
      (d ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lng = lon0 +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) /
      cos;
  return { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI };
}

async function loadOsmPlaces(): Promise<OsmElement[]> {
  const cached = await readCache<OsmElement[]>(OSM_CACHE);
  if (cached) return cached;
  const box = `${BBOX.minLat},${BBOX.minLng},${BBOX.maxLat},${BBOX.maxLng}`;
  const query = `[out:json][timeout:180];\nnwr["place"](${box});\nout center tags;`;
  const failures: string[] = [];
  for (const url of OVERPASS_URLS) {
    try {
      const data = await fetchJson<{ elements: OsmElement[] }>(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
      });
      await writeFile(OSM_CACHE, JSON.stringify(data.elements, null, 2) + "\n", "utf8");
      return data.elements;
    } catch (error) {
      failures.push(`${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`אף מראת Overpass לא החזירה נתונים:\n${failures.join("\n")}`);
}

function namesOf(element: OsmElement): string[] {
  const tags = element.tags ?? {};
  return [tags["name:he"], tags.name, tags["official_name:he"], tags["short_name:he"], tags["alt_name:he"], tags.alt_name]
    .flatMap((name) => (name ? name.split(";") : []))
    .map(normalize)
    .filter(hebrewOnly);
}

function choose(elements: OsmElement[]): OsmElement | undefined {
  return elements
    .filter((element) => {
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      return typeof lat === "number" && typeof lng === "number";
    })
    .sort((a, b) => {
      const score = (element: OsmElement) =>
        (element.tags?.place ? 20 : 0) + (element.type === "node" ? 10 : 0) + Number(element.tags?.population ?? 0) / 1_000_000;
      return score(b) - score(a);
    })[0];
}

async function main() {
  const started = Date.now();
  await mkdir(CACHE_DIR, { recursive: true });
  const [official, coordinatePoints, osm] = await Promise.all([loadOfficial(), loadCoordinatePoints(), loadOsmPlaces()]);

  const byCode = new Map<string, OsmElement[]>();
  const byName = new Map<string, OsmElement[]>();
  const byNameKey = new Map<string, OsmElement[]>();
  for (const element of osm) {
    const code = element.tags?.["ref:IL:CBS"] ?? element.tags?.["ref:IL:cbs"];
    if (code) byCode.set(code, [...(byCode.get(code) ?? []), element]);
    for (const name of namesOf(element)) {
      byName.set(name, [...(byName.get(name) ?? []), element]);
      const key = nameKey(name);
      byNameKey.set(key, [...(byNameKey.get(key) ?? []), element]);
    }
  }
  const coordinatesByCode = new Map(coordinatePoints.map((point) => [String(point.symbol_number), point]));
  const coordinatesByName = new Map(coordinatePoints.map((point) => [nameKey(point.name_in_hebrew), point]));

  const localities: Locality[] = [];
  const failed: string[] = [];
  const outside: string[] = [];
  const seen = new Set<string>();
  for (const record of official) {
    const name = normalize(record.city_name_he);
    if (!name || !hebrewOnly(name) || seen.has(name)) continue;
    seen.add(name);
    const coordinatePoint = coordinatesByCode.get(String(record.city_code)) ?? coordinatesByName.get(nameKey(name));
    const converted = coordinatePoint && typeof coordinatePoint.X === "number" && typeof coordinatePoint.Y === "number"
      ? itmToWgs84(coordinatePoint.X, coordinatePoint.Y)
      : null;
    const match = converted ? undefined : choose(byCode.get(String(record.city_code)) ?? byName.get(name) ?? byNameKey.get(nameKey(name)) ?? []);
    if (!converted && !match) {
      failed.push(name);
      continue;
    }
    const lat = converted?.lat ?? match!.lat ?? match!.center!.lat;
    const lng = converted?.lng ?? match!.lon ?? match!.center!.lon;
    if (!insideBox(lat, lng)) {
      outside.push(name);
      continue;
    }
    localities.push({ name, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
  }

  localities.sort((a, b) => a.name.localeCompare(b.name, "he"));
  const generated = new Date().toISOString().slice(0, 10);
  const header = `/**\n * שמות היישובים: רשות האוכלוסין, data.gov.il (${RESOURCE_ID}).\n * נקודות המרכז: משאב הקואורדינטות הפתוח ב-data.gov.il, עם השלמות מ-OpenStreetMap דרך Overpass. נוצר ב-${generated}.\n * יצירה מחדש: npm run localities:generate (המטמון נמצא ב-data/localities-cache).\n */\n`;
  const rows = localities.map(({ name, lat, lng }) => `  { name: ${JSON.stringify(name)}, lat: ${lat}, lng: ${lng} },`).join("\n");
  const footer = `] as const satisfies readonly Locality[];\n\nexport type Locality = { name: string; lat: number; lng: number };\n\nexport function searchLocalities(query: string, limit = 12): Locality[] {\n  const needle = query.trim().replace(/\\s+/g, " ");\n  if (!needle) return [];\n  return LOCALITIES.filter((locality) => locality.name.includes(needle)).slice(0, limit);\n}\n`;
  await writeFile(OUTPUT, `${header}export const LOCALITIES = [\n${rows}\n${footer}`, "utf8");

  console.log(JSON.stringify({ official: official.length, unique: seen.size, written: localities.length, failed, outside, seconds: Math.round((Date.now() - started) / 100) / 10 }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
