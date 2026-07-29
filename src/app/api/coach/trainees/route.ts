import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser, hashPassword, normalizePhone } from "@/lib/auth";

export async function POST(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  let name: string, phone: string, password: string, rehabMode: boolean;
  try {
    const body = await request.json();
    name = String(body.name ?? "").trim();
    phone = normalizePhone(String(body.phone ?? ""));
    password = String(body.password ?? "");
    rehabMode = Boolean(body.rehabMode);
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (!name) return NextResponse.json({ error: "צריך שם" }, { status: 400 });
  if (phone.length < 9) {
    return NextResponse.json({ error: "מספר טלפון לא תקין" }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "הסיסמה צריכה לפחות 4 תווים" }, { status: 400 });
  }

  await initDb();

  const taken = await db.execute({
    sql: "SELECT id FROM users WHERE phone = ?",
    args: [phone],
  });
  if (taken.rows.length) {
    return NextResponse.json(
      { error: "כבר קיים משתמש עם הטלפון הזה" },
      { status: 409 }
    );
  }

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO users (id,name,phone,password_hash,role,active,rehab_mode,notes,session_version,created_at)
          VALUES (?,?,?,?, 'trainee', 1, ?, '', 1, ?)`,
    args: [id, name, phone, await hashPassword(password), rehabMode ? 1 : 0, new Date().toISOString()],
  });

  return NextResponse.json({ id, name });
}
