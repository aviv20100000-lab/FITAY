/**
 * מדיניות CORS על דלי הסרטונים.
 *
 * ההעלאה מהדפדפן היא PUT ישיר אל R2, ובלי המדיניות הזאת הדפדפן חוסם
 * את הבקשה עוד לפני שהיא יוצאת. GET נדרש כדי שהנגן יוכל למשוך את
 * הקובץ, ו-ETag נחשף כי העלאה רב-חלקית קוראת אותו מהתשובה.
 *
 * הרצה: npm run r2:cors          מציג את המדיניות הנוכחית
 *        npm run r2:cors -- --apply  כותב אותה
 *
 * אם הטוקן של R2 הוא לקריאה וכתיבה של אובייקטים בלבד, הכתיבה תיכשל
 * ב-AccessDenied. זו הגדרה ברמת הדלי, ואז צריך להגדיר אותה מלוח הבקרה
 * של Cloudflare. הסקריפט מדפיס בדיוק מה להזין שם.
 */
import {
  S3Client,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type CORSRule,
} from "@aws-sdk/client-s3";

const ORIGINS = [
  "https://fitay.vercel.app",
  // פריסות התצוגה מקבלות כתובת משתנה, ומשתני R2 מוגדרים גם עליהן.
  // בלי זה העלאה מפריסת תצוגה נחסמת בדפדפן.
  "https://*.vercel.app",
  "http://localhost:3000",
];

const RULES: CORSRule[] = [
  {
    AllowedOrigins: ORIGINS,
    AllowedMethods: ["PUT", "GET", "HEAD"],
    AllowedHeaders: ["*"],
    // ETag נחשף בשביל העלאה רב-חלקית, שקוראת אותו מכל חלק.
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  },
];

function client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("הגדרות R2 חסרות ב-env");
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucket() {
  const name = process.env.R2_BUCKET;
  if (!name) throw new Error("R2_BUCKET חסר");
  return name;
}

async function show(s3: S3Client) {
  try {
    const res = await s3.send(new GetBucketCorsCommand({ Bucket: bucket() }));
    console.log("המדיניות הנוכחית:");
    console.log(JSON.stringify(res.CORSRules, null, 2));
  } catch (e) {
    const name = e instanceof Error ? e.name : String(e);
    if (name === "NoSuchCORSConfiguration") {
      console.log("אין כרגע מדיניות CORS על הדלי.");
    } else {
      console.log(`לא הצלחנו לקרוא את המדיניות: ${name}`);
    }
  }
}

async function main() {
  const s3 = client();
  console.log(`דלי: ${bucket()}`);
  await show(s3);

  if (!process.argv.includes("--apply")) {
    console.log("\nלכתיבה: npm run r2:cors -- --apply");
    console.log("מה שייכתב:");
    console.log(JSON.stringify(RULES, null, 2));
    return;
  }

  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: bucket(),
        CORSConfiguration: { CORSRules: RULES },
      })
    );
    console.log("\nנכתב. המדיניות אחרי הכתיבה:");
    await show(s3);
  } catch (e) {
    const name = e instanceof Error ? e.name : String(e);
    console.error(`\nהכתיבה נכשלה: ${name}`);
    console.error(
      "\nזו הגדרה ברמת הדלי, והטוקן הנוכחי כנראה מוגבל לאובייקטים.\n" +
        "להגדיר ידנית ב-Cloudflare: R2 > הדלי > Settings > CORS Policy,\n" +
        "ולהדביק שם:\n"
    );
    console.error(
      JSON.stringify(
        [
          {
            AllowedOrigins: ORIGINS,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

main();
