import { cache } from "react";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import db, { initDb } from "./db";
import type { Role, User } from "./types";
import type { Gender } from "./gender";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  verifySessionToken,
} from "./session-token";

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
  const gender: Gender =
    row.gender === "male" || row.gender === "female" ? row.gender : null;
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    role: row.role as Role,
    active: Number(row.active) === 1,
    gender,
    rehabMode: Number(row.rehab_mode) === 1,
    notes: (row.notes as string) ?? "",
    createdAt: row.created_at as string,
  };
}

export async function setSession(user: User) {
  await initDb();
  const res = await db.execute({
    sql: "SELECT session_version FROM users WHERE id = ?",
    args: [user.id],
  });
  const version = Number(res.rows[0]?.session_version ?? 1);
  const token = await createSessionToken(user, version);

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/**
 * המשתמש המחובר, או null.
 * מאמת גם את session_version — כך שמאמן FITAY יכול לנתק מתאמן מכל המכשירים
 * בכך שיעלה את המספר, בלי לחכות שהטוקן יפוג.
 *
 * עטוף ב-cache של React, שמאחד קריאות חוזרות בתוך אותה בקשה.
 *
 * הבעיה שזה פותר: כל מסך קורא לפונקציה פעמיים, פעם ב-layout ופעם
 * ב-page. שתי הקריאות מריצות את אותו `SELECT` על אותו משתמש, והמסד
 * יושב באירלנד בזמן שהפונקציות רצות בפרנקפורט — כלומר סבב רשת בין
 * מדינות שנשרף על נתון שכבר ביד. זה חל על /client, /client/progress,
 * /method ו-/spots, כלומר כמעט כל ניווט באפליקציה.
 *
 * זה איחוד בתוך בקשה אחת בלבד, לא מטמון בין בקשות. כל בקשה חדשה עדיין
 * שולפת מהמסד, ולכן ניתוק מתאמן דרך session_version ממשיך לתפוס מיד
 * ואין כאן שינוי התנהגות. ראה התיעוד של Next בנושא Deduplicating
 * requests.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await verifySessionToken(token);
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
});

/** למסלולי API של המאמן בלבד. זורק אם המשתמש אינו מאמן FITAY. */
export async function requireCoach(): Promise<User> {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") {
    throw new Error("אין הרשאה");
  }
  return user;
}

/**
 * התחברות לפי טלפון + סיסמה. רק מאמן FITAY פותח חשבונות — אין הרשמה עצמית.
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

  // קודם בדיוק כפי שהוקלד. אם נכשל, מנסים בלי רווחים בקצוות: מקלדת
  // אייפון מוסיפה רווח אחרי הקלדה, והמתאמן רואה סיסמה שנראית נכונה
  // ונדחית. סיסמאות חדשות נשמרות ממילא חתוכות.
  const hash = row.password_hash as string;
  const ok =
    (await verifyPassword(password, hash)) ||
    (password !== password.trim() && (await verifyPassword(password.trim(), hash)));
  if (!ok) return null;
  return rowToUser(row);
}
