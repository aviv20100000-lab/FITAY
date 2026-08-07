/**
 * בדיקת חיבור ל-R2: האם המפתחות עובדים והאם הדלי קיים.
 *   cd fitay-app
 *   npx tsx --env-file=.env.local ..\video-tools\r2-check.ts
 * קריאה בלבד.
 */
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

async function main() {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("חסרים משתני R2 ב-.env.local");
    process.exit(1);
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  // טוקן מסוג Object אינו רשאי לרשום דליים, ולכן ניגשים ישירות לדלי עצמו.
  const objects = await s3.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 5 })
  );
  console.log(`קריאה מהדלי ${R2_BUCKET} עובדת. קבצים בו: ${objects.KeyCount ?? 0}`);
  for (const o of objects.Contents ?? []) console.log(`  ${o.Key}`);

  // בדיקת כתיבה: קובץ זעיר שנמחק מיד.
  const key = "_connection-check.txt";
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: "ok",
      ContentType: "text/plain",
    })
  );
  console.log("כתיבה עובדת.");
  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  console.log("מחיקה עובדת. הטוקן מתאים להעלאות.");
}

main().catch((e) => {
  console.error("נכשל:", e.name, e.message);
  process.exit(1);
});
