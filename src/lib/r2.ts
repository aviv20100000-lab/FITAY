/**
 * אחסון הסרטונים ב-Cloudflare R2.
 *
 * החלף את Vercel Blob אחרי שהמאגר שם הושעה וחסם גם קריאה. R2 מדבר S3,
 * ולכן כל הגישה כאן עוברת דרך לקוח S3 רגיל. מה שהמתאמן מוריד לא עובר
 * דרכנו אלא ישירות מהכתובת הציבורית של הדלי, ובלי חיוב על תעבורה יוצאת.
 *
 * המשתנים ב-.env.local וגם בהגדרות הפרויקט בוורסל:
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_URL
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { stat } from "fs/promises";

const PUBLIC_BASE = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

function bucket() {
  const name = process.env.R2_BUCKET;
  if (!name) throw new Error("R2_BUCKET חסר");
  return name;
}

let client: S3Client | null = null;

function s3() {
  if (client) return client;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("הגדרות R2 חסרות ב-env");
  }
  client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

/** הכתובת שהדפדפן מושך ממנה. */
export function publicUrl(key: string) {
  if (!PUBLIC_BASE) throw new Error("R2_PUBLIC_URL חסר");
  return `${PUBLIC_BASE}/${key.replace(/^\/+/, "")}`;
}

/** האם הכתובת שייכת לאחסון שלנו. שומר מפני רישום לינק חיצוני כסרטון. */
export function isOurStorage(url: string) {
  if (!PUBLIC_BASE) return false;
  try {
    return new URL(url).origin === new URL(PUBLIC_BASE).origin;
  } catch {
    return false;
  }
}

/** המפתח בתוך הדלי, מתוך כתובת ציבורית מלאה. */
export function keyFromUrl(url: string) {
  if (!isOurStorage(url)) return null;
  return new URL(url).pathname.replace(/^\/+/, "");
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
) {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      // הסרטונים לא משתנים אחרי ההעלאה, ולכן שמירה ארוכה בדפדפן.
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return publicUrl(key);
}

/**
 * העלאת קובץ מהדיסק, בלי לקרוא אותו כולו לזיכרון.
 *
 * הצינור של הדחיסה כותב ל-/tmp ואז מעלה. קריאה מלאה לזיכרון של קובץ
 * וידאו בפונקציה עם תקרת זיכרון היא בדיוק הדרך להפיל אותה, ולכן זרם
 * עם אורך ידוע: S3 דורש ContentLength כשהגוף הוא זרם.
 */
export async function putFile(
  key: string,
  path: string,
  contentType: string
) {
  const { size } = await stat(path);
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: createReadStream(path),
      ContentLength: size,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return publicUrl(key);
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** גודל הקובץ באחסון, או null אם אינו קיים. */
export async function objectSize(key: string): Promise<number | null> {
  return (await objectInfo(key))?.size ?? null;
}

/**
 * גודל וסוג התוכן של קובץ באחסון, או null אם אינו קיים.
 *
 * הסוג נבדק כי R2 לא אוכף את מה שנחתם: נמדד, PUT ששלח סוג אחר מזה
 * שבחתימה התקבל והסוג שלו נשמר. כלומר הסוג שמוגש נקבע בפועל על ידי
 * מי שהעלה, ולכן הרישום לקטלוג הוא המקום לוודא שזה באמת סרטון.
 */
export async function objectInfo(
  key: string
): Promise<{ size: number; contentType: string } | null> {
  try {
    const meta = await s3().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key })
    );
    return {
      size: meta.ContentLength ?? 0,
      contentType: meta.ContentType ?? "",
    };
  } catch {
    return null;
  }
}

/** סוגי הווידאו שמותר לרשום בקטלוג. */
export const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

/** סך הבתים והקבצים בדלי. משמש את בדיקת השימוש. */
export async function bucketUsage() {
  let bytes = 0;
  let count = 0;
  let token: string | undefined;
  do {
    const page = await s3().send(
      new ListObjectsV2Command({ Bucket: bucket(), ContinuationToken: token })
    );
    for (const o of page.Contents ?? []) {
      bytes += o.Size ?? 0;
      count++;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { bytes, count };
}

/**
 * רשימת האובייקטים תחת קידומת.
 *
 * משמש את איסוף הקליפים שהועלו ומעולם לא נרשמו למסד. סריקה שעוברת רק
 * על שורות במסד לא מגיעה אליהם בהגדרה.
 */
export async function listObjects(prefix: string) {
  const items: { key: string; url: string; size: number; uploadedAt: Date }[] = [];
  let token: string | undefined;
  do {
    const page = await s3().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const o of page.Contents ?? []) {
      if (!o.Key) continue;
      items.push({
        key: o.Key,
        url: publicUrl(o.Key),
        size: o.Size ?? 0,
        uploadedAt: o.LastModified ?? new Date(0),
      });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return items;
}

/**
 * שם ייחודי לקובץ, בלי לדרוס העלאה קודמת.
 *
 * מחליף את addRandomSuffix שהיה ב-Blob. שני קליפים בשם IMG_1341.mov
 * משני טלפונים הם מקרה רגיל לגמרי, ובלי הסיומת השנייה הייתה מוחקת
 * את הראשונה בשקט.
 */
export function uniqueKey(prefix: string, filename: string) {
  const dot = filename.lastIndexOf(".");
  const stem = (dot > 0 ? filename.slice(0, dot) : filename) || "video";
  const ext = dot > 0 ? filename.slice(dot).toLowerCase() : "";
  const safe = stem.replace(/[^\w.-]+/g, "_").slice(0, 60);
  return `${prefix.replace(/\/+$/, "")}/${safe}-${randomUUID().slice(0, 8)}${ext}`;
}

/**
 * כתובת חתומה להעלאה ישירה מהדפדפן.
 *
 * הקובץ עולה מהטלפון אל R2 ולא דרך השרת, אחרת מגבלת גוף הבקשה הייתה
 * חוסמת כל קליפ מעל ארבעה וחצי מגה, וקליפ מאייפון הוא בקלות שלושים.
 *
 * המפתח הוא מה שהחתימה באמת נועלת: אי אפשר לכתוב לשום מקום אחר בדלי.
 *
 * סוג התוכן נחתם, אבל R2 לא אוכף אותו. נמדד: PUT ששלח סוג אחר התקבל,
 * והסוג ששלח הוא זה שנשמר. לכן הוא לא גדר, והבדיקה האמיתית יושבת
 * ברישום לקטלוג, מול מה שבאמת נמצא בדלי.
 *
 * שום כותרת נוספת לא נכנסת לחתימה. כל כותרת חתומה היא כותרת שהדפדפן
 * חייב לשלוח באותו ערך בדיוק, ו-CacheControl כאן היה שובר כל העלאה.
 * הקובץ שמוגש למתאמן הוא ממילא הפלט של הדחיסה, שעולה דרך putFile
 * וכן מקבל שם שמירה ארוכה.
 */
export async function presignPut(
  key: string,
  contentType: string,
  expiresIn = 600
) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

/** סוג התוכן לפי סיומת. R2 לא מנחש לבד, ובלי זה הדפדפן לא מנגן. */
export function contentTypeFor(filename: string) {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "application/octet-stream";
}
