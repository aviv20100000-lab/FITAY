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

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** גודל הקובץ באחסון, או null אם אינו קיים. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const meta = await s3().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key })
    );
    return meta.ContentLength ?? 0;
  } catch {
    return null;
  }
}

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
