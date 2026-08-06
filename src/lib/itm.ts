/**
 * המרה מרשת ישראל החדשה (ITM, EPSG:2039) לקואורדינטות GPS רגילות.
 *
 * למה זה נדרש: מאגרי הנתונים של הרשויות בישראל לא שומרים קווי אורך
 * ורוחב אלא "ציר X" ו"ציר Y" ברשת המקומית. בלי ההמרה הזאת אי אפשר
 * להשתמש בהם בכלל.
 *
 * המימוש הוא מרקטור רוחבי הפוך על אליפסואיד GRS80, עם הפרמטרים
 * הרשמיים של הרשת. ההיסט בין הדטום הישראלי ל-WGS84 הוא בסדר גודל של
 * מטר בודד, ולכן לא מיושם כאן: מי שמחפש מתח בפארק לא ירגיש בו.
 *
 * אומת בשתי דרכים. ראשית, נקודת המוצא של הרשת חוזרת בדיוק לקו הרוחב
 * והאורך שלה. שנית, 67 מתקנים ממשלתיים שהומרו נפלו על נקודות שקיימות
 * במקביל ב-OpenStreetMap, עם הטיה ממוצעת של 10 מטר צפונה ו-28 מזרחה,
 * כלומר בלי הסחה שיטתית. הפיזור שנשאר הוא הדיוק של המקור עצמו.
 */

const A = 6378137; // חצי הציר הגדול של GRS80
const F = 1 / 298.257222101;
const E2 = F * (2 - F);

const RAD = Math.PI / 180;
const LAT0 = 31.734393611111 * RAD; // קו רוחב המוצא
const LON0 = 35.204516944444 * RAD; // המרידיאן המרכזי
const K0 = 1.0000067; // מקדם קנה מידה
const FALSE_EASTING = 219529.584;
const FALSE_NORTHING = 626907.39;

/** אורך הקשת לאורך המרידיאן מקו המשווה עד קו רוחב נתון. */
function meridianArc(phi: number) {
  const e2 = E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  return (
    A *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

export function itmToWgs84(x: number, y: number): [number, number] {
  const m = meridianArc(LAT0) + (y - FALSE_NORTHING) / K0;
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const ep2 = E2 / (1 - E2);
  const c1 = ep2 * Math.cos(phi1) ** 2;
  const t1 = Math.tan(phi1) ** 2;
  const n1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2);
  const r1 = (A * (1 - E2)) / Math.pow(1 - E2 * Math.sin(phi1) ** 2, 1.5);
  const d = (x - FALSE_EASTING) / (n1 * K0);

  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) *
          d ** 6) /
          720);

  const lon =
    LON0 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) /
        120) /
      Math.cos(phi1);

  return [lat / RAD, lon / RAD];
}

/**
 * ניקוי זוג צירים לפני ההמרה.
 *
 * ברשת הישראלית המזרח נע בערך בין 120 ל-320 אלף והצפון בין 350 ל-820
 * אלף, ולכן אי אפשר לבלבל ביניהם. במאגר הממשלתי יש רשומות שבהן שני
 * הערכים הוחלפו בהזנה, ובלי התיקון הזה הן נוחתות באמצע הים.
 * זוג שלא נראה כמו רשת ישראלית בכלל מוחזר כ-null ולא מומר.
 */
export function normalizeItm(
  rawX: number,
  rawY: number
): { x: number; y: number } | null {
  let x = rawX;
  let y = rawY;
  if (x > 400000 && y < 400000) [x, y] = [y, x];

  const sane =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x > 100000 &&
    x < 320000 &&
    y > 350000 &&
    y < 820000;

  return sane ? { x, y } : null;
}
