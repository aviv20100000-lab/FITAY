import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import db, { initDb } from "./db";
import type { Role, User } from "./types";

/**
 * נקרא בזמן הבקשה ולא בזמן הטעינה. אחרת חסר JWT_SECRET מפיל את כל הבילד
 * בשגיאה שלא מסבירה כלום — ובדיוק ככה נכשל הדיפלוי הראשון ב-Vercel.
 */
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error(
      "JWT_SECRET חסר. הוסף אותו ב-Vercel תחת Settings → Environment Variables, ואז Redeploy."
    );
  }
  return new TextEncoder().encode(value);
}

const COOKIE_NAME = "fitay-session";
const MAX_AGE_SEC = 60 * 60 * 24 * 365; // שנה — מתאמן לא צריך להתחבר כל שבוע

/** מספרי טלפון מגיעים עם מקפים/רווחים/+972 — משווים תמיד על הצורה המנורמלת. */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(row: any): User {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    role: row.role as Role,
    active: Number(row.active) === 1,
    rehabMode: Number(row.rehab_mode) === 1,
    notes: (row.notes as string) ?? "",
    createdAt: row.created_at as string,
  };
}

async function createToken(user: User, version: number) {
  return new SignJWT({ sub: user.id, role: user.role, ver: version })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("365d")
    .sign(secret());
}

export async function setSession(user: User) {
  await initDb();
  const res = await db.execute({
    sql: "SELECT session_version FROM users WHERE id = ?",
    args: [user.id],
  });
  const version = Number(res.rows[0]?.session_version ?? 1);
  const token = await createToken(user, version);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SEC,
    path: "/",
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * המשתמש המחובר, או null.
 * מאמת גם את session_version — כך שאיתי יכול לנתק מתאמן מכל המכשירים
 * בכך שיעלה את המספר, בלי לחכות שהטוקן יפוג.
 */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    await initDb();
    const res = await db.execute({
      sql: "SELECT * FROM users WHERE id = ?",
      args: [payload.sub as string],
    });
    const row = res.rows[0];
    if (!row) return null;
    if (Number(row.session_version) !== Number(payload.ver)) return null;
    if (Number(row.active) !== 1) return null;
    return rowToUser(row);
  } catch {
    return null;
  }
}

/** למסלולי API של המאמן בלבד. זורק אם המשתמש אינו איתי. */
export async function requireCoach(): Promise<User> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") {
    throw new Error("אין הרשאה");
  }
  return user;
}

/**
 * התחברות לפי טלפון + סיסמה. רק איתי פותח חשבונות — אין הרשמה עצמית.
 *
 * קלט שאין בו ספרות כלל (למשל "FITAY") מחפש התאמה מדויקת בשדה המזהה,
 * כדי לאפשר חשבונות בדיקה בלי מספר טלפון. מספר טלפון אמיתי תמיד עובר
 * נרמול קודם, ולכן ההתנהגות עבורו לא משתנה.
 */
export async function login(identifier: string, password: string): Promise<User | null> {
  await initDb();
  const phone = normalizePhone(identifier);
  if (!phone && !identifier.trim()) return null;
  const res = phone
    ? await db.execute({
        sql: "SELECT * FROM users WHERE phone = ?",
        args: [phone],
      })
    : await db.execute({
        sql: "SELECT * FROM users WHERE phone = ? COLLATE NOCASE",
        args: [identifier.trim()],
      });
  const row = res.rows[0];
  if (!row) return null;
  if (Number(row.active) !== 1) return null;
  const ok = await verifyPassword(password, row.password_hash as string);
  if (!ok) return null;
  return rowToUser(row);
}
