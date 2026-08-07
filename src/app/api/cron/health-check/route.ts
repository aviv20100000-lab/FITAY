import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import { escapeTelegramHtml, sendTelegramAlert } from "@/lib/telegram";
import { bucketUsage } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

const REQUIRED_ENV = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "JWT_SECRET",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  // אחסון הסרטונים. החליף את BLOB_READ_WRITE_TOKEN אחרי המעבר ל-R2.
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
  "CRON_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
] as const;

/**
 * סף ההתראה על נפח האחסון.
 *
 * המסלול החינמי של R2 הוא עשרה ג'יגה־בייט, ומתריעים בשמונה. שני ג'יגה
 * מרווח הם כמה עשרות קליפים, כלומר מספיק זמן להחליט מה עושים לפני
 * שההעלאה הבאה מתחילה לעלות כסף.
 */
const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const STORAGE_ALERT_BYTES = 8 * 1024 * 1024 * 1024;

const gb = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(2);

type HealthCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  }

  const checks: HealthCheck[] = [];
  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  checks.push({
    name: "הגדרות השרת",
    ok: missingEnv.length === 0,
    detail: missingEnv.length ? `חסר: ${missingEnv.join(", ")}` : "תקין",
  });

  try {
    await initDb();
    const result = await db.execute(
      "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM completions) AS completions"
    );
    checks.push({
      name: "מסד הנתונים",
      ok: true,
      detail: `users=${Number(result.rows[0]?.users ?? 0)} completions=${Number(
        result.rows[0]?.completions ?? 0
      )}`,
    });
  } catch (error) {
    checks.push({
      name: "מסד הנתונים",
      ok: false,
      detail: errorMessage(error).slice(0, 180),
    });
  }

  /*
   * נפח האחסון. נכנס כאן ולא בקרון נפרד, כי זו בדיוק אותה שאלה שכל שאר
   * הבדיקות שואלות: האם משהו עומד להישבר. שינוי מצב הוא מה שמפעיל
   * הודעה, ולכן חציית הסף מודיעה פעם אחת ולא בכל בוקר.
   */
  try {
    const { bytes, count } = await bucketUsage();
    const over = bytes >= STORAGE_ALERT_BYTES;
    checks.push({
      name: "נפח האחסון",
      ok: !over,
      detail: over
        ? `${gb(bytes)}GB מתוך ${gb(STORAGE_LIMIT_BYTES)}GB במסלול החינמי, ${count} קבצים`
        : `${gb(bytes)}GB, ${count} קבצים`,
    });
  } catch (error) {
    checks.push({
      name: "נפח האחסון",
      ok: false,
      detail: errorMessage(error).slice(0, 180),
    });
  }

  const allOk = checks.every((check) => check.ok);
  const status = allOk ? "ok" : "fail";
  const checkedAt = new Date().toISOString();
  let previousStatus: string | null = null;
  let changed = true;
  // הרצה ראשונה אמיתית, להבדיל מהרצה שבה פשוט לא הצלחנו לקרוא את המצב
  // הקודם. רק הראשונה זכאית להודעת "הניטור פעיל".
  let firstRun = false;

  try {
    await initDb();
    const previous = await db.execute({
      sql: "SELECT value FROM developer_alerts WHERE key = ?",
      args: ["system-health"],
    });
    previousStatus = previous.rows[0]?.value
      ? String(previous.rows[0].value)
      : null;
    firstRun = previousStatus === null;
    /**
     * ההרצה הראשונה מדווחת גם כשהכל תקין.
     *
     * קודם היא שתקה, ולכן לא היה שום רגע שבו אפשר לדעת שהניטור מחובר.
     * בוט שמדבר רק כשנשבר משהו הוא בוט שמגלים שהוא מת ביום הכי גרוע.
     * הודעה אחת בהתחלה סוגרת את זה. מכאן והלאה הוא שותק עד שינוי מצב.
     */
    changed = previousStatus !== status;

    await db.execute({
      sql: `INSERT INTO developer_alerts (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at`,
      args: ["system-health", status, checkedAt],
    });
  } catch {
    changed = true;
  }

  if (changed) {
    const title = !allOk
      ? "🚨 <b>FITAY — זוהתה תקלה</b>"
      : firstRun
        ? "🟢 <b>ניטור FITAY פעיל</b>\nמכאן והלאה תקבל הודעה רק כשמשהו משתנה."
        : "✅ <b>FITAY חזרה לעבוד כרגיל</b>";
    const details = checks
      .map(
        (check) =>
          `${check.ok ? "✅" : "❌"} <b>${escapeTelegramHtml(
            check.name
          )}</b>: ${escapeTelegramHtml(check.detail)}`
      )
      .join("\n");
    await sendTelegramAlert(`${title}\n\n${details}`);
  }

  return NextResponse.json(
    {
      status,
      checks,
      alerted: changed,
      checkedAt,
    },
    { status: allOk ? 200 : 503 }
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
