import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import { escapeTelegramHtml, sendTelegramAlert } from "@/lib/telegram";

export const preferredRegion = "fra1";

const ERROR_COOLDOWN_MS = 30 * 60 * 1000;
const GLOBAL_COOLDOWN_MS = 60 * 1000;

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function redact(value: string) {
  return value
    .replace(/(?:Bearer\s+)?[A-Za-z0-9_-]{24,}/gi, "[hidden]")
    .replace(/\b\d{8,}\b/g, "[number]");
}

function roleLabel(role: string) {
  return role === "coach" ? "מאמן" : "מתאמן";
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "לא מחובר" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "דיווח לא תקין" }, { status: 400 });
  }

  const name = redact(clean(body.name, 80) || "Error");
  const message = redact(clean(body.message, 600));
  const stack = redact(clean(body.stack, 1200));
  const path = clean(body.path, 200).split("?")[0] || "unknown";
  if (!message) {
    return NextResponse.json({ error: "דיווח לא תקין" }, { status: 400 });
  }

  const fingerprint = crypto
    .createHash("sha256")
    .update(`${name}\n${message}\n${path}`)
    .digest("hex")
    .slice(0, 20);
  const now = Date.now();
  const errorKey = `client-error:${fingerprint}`;

  await initDb();
  const existing = await db.execute({
    sql: "SELECT updated_at FROM developer_alerts WHERE key = ?",
    args: [errorKey],
  });
  const lastSent = Date.parse(String(existing.rows[0]?.updated_at ?? ""));
  if (Number.isFinite(lastSent) && now - lastSent < ERROR_COOLDOWN_MS) {
    return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
  }

  const global = await db.execute({
    sql: "SELECT updated_at FROM developer_alerts WHERE key = ?",
    args: ["client-error:global"],
  });
  const lastGlobal = Date.parse(String(global.rows[0]?.updated_at ?? ""));
  if (Number.isFinite(lastGlobal) && now - lastGlobal < GLOBAL_COOLDOWN_MS) {
    return NextResponse.json({ accepted: true, throttled: true }, { status: 202 });
  }

  const timestamp = new Date(now).toISOString();
  await db.batch([
    {
      sql: `INSERT INTO developer_alerts (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [errorKey, "sent", timestamp],
    },
    {
      sql: `INSERT INTO developer_alerts (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: ["client-error:global", fingerprint, timestamp],
    },
  ]);

  const details = [
    "🚨 <b>FITAY — שגיאה באפליקציה</b>",
    `סוג משתמש: <b>${roleLabel(user.role)}</b>`,
    `מסך: <code>${escapeTelegramHtml(path)}</code>`,
    `שגיאה: <code>${escapeTelegramHtml(`${name}: ${message}`)}</code>`,
    `מזהה: <code>${fingerprint}</code>`,
  ];
  if (stack) {
    details.push(`Stack:\n<pre>${escapeTelegramHtml(stack)}</pre>`);
  }

  await sendTelegramAlert(details.join("\n"));
  return NextResponse.json(
    { accepted: true },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
}
