import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import { escapeTelegramHtml, sendTelegramAlert } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

const REQUIRED_ENV = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "JWT_SECRET",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
] as const;

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
