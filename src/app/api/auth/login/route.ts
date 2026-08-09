import { NextResponse } from "next/server";
import { login, normalizePhone, setSession } from "@/lib/auth";
import db, { initDb } from "@/lib/db";

export const preferredRegion = "fra1";

const GENERIC_ERROR = "טלפון או סיסמה שגויים";
const MINUTE_MS = 60 * 1000;

function attemptKeys(request: Request, identifier: string) {
  const normalized = normalizePhone(identifier);
  const account = normalized || identifier.trim().toLocaleLowerCase("he");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return { account, ip };
}

async function lockedUntil(account: string, ip: string) {
  const result = await db.execute({
    sql: `SELECT MAX(locked_until) AS locked_until FROM login_attempts
           WHERE (scope = 'account' AND attempt_key = ?)
              OR (scope = 'ip' AND attempt_key = ?)`,
    args: [account, ip],
  });
  const value = result.rows[0]?.locked_until;
  return value == null ? null : String(value);
}

function failureResponse(until: string | null) {
  if (until && Date.parse(until) > Date.now()) {
    const minutes = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / MINUTE_MS));
    return NextResponse.json(
      { error: `${GENERIC_ERROR}. יותר מדי ניסיונות, נסה שוב בעוד ${minutes} דקות` },
      { status: 401 }
    );
  }
  return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
}

async function recordFailures(account: string, ip: string) {
  const now = new Date();
  const until = (minutes: number) => new Date(now.getTime() + minutes * MINUTE_MS).toISOString();
  const statement = (scope: "account" | "ip", key: string) => ({
    sql: `INSERT INTO login_attempts
            (scope, attempt_key, failure_count, locked_until, updated_at)
          VALUES (?, ?, 1, NULL, ?)
          ON CONFLICT(scope, attempt_key) DO UPDATE SET
            failure_count = login_attempts.failure_count + 1,
            locked_until = CASE
              WHEN login_attempts.failure_count + 1 >= 8 THEN ?
              WHEN login_attempts.failure_count + 1 = 7 THEN ?
              WHEN login_attempts.failure_count + 1 = 6 THEN ?
              WHEN login_attempts.failure_count + 1 = 5 THEN ?
              ELSE NULL
            END,
            updated_at = excluded.updated_at`,
    args: [scope, key, now.toISOString(), until(60), until(15), until(5), until(1)],
  });
  await db.batch([statement("account", account), statement("ip", ip)], "write");
}

async function resetFailures(account: string, ip: string) {
  await db.execute({
    sql: `UPDATE login_attempts
             SET failure_count = 0, locked_until = NULL, updated_at = ?
           WHERE (scope = 'account' AND attempt_key = ?)
              OR (scope = 'ip' AND attempt_key = ?)`,
    args: [new Date().toISOString(), account, ip],
  });
}

export async function POST(request: Request) {
  let phone: string, password: string;
  try {
    const body = await request.json();
    phone = String(body.phone ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (!phone.trim() || !password) {
    return NextResponse.json({ error: "צריך טלפון וסיסמה" }, { status: 400 });
  }

  await initDb();
  const { account, ip } = attemptKeys(request, phone);
  const currentLock = await lockedUntil(account, ip);
  if (currentLock && Date.parse(currentLock) > Date.now()) return failureResponse(currentLock);

  const user = await login(phone, password);
  if (!user) {
    await recordFailures(account, ip);
    return failureResponse(await lockedUntil(account, ip));
  }

  await resetFailures(account, ip);
  await setSession(user);
  return NextResponse.json({ role: user.role, name: user.name });
}
