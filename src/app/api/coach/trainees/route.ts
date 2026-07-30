import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser, hashPassword, normalizePhone } from "@/lib/auth";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

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
    // חיתוך רווחים. רווח נגרר מהמקלדת נשמר בשקט ואז חוסם כניסה.
    password = String(body.password ?? "").trim();
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

  // מחזירים את הטלפון כפי שנשמר אחרי נרמול, כדי שהמסך יציג בדיוק
  // את מה שצריך להקליד בכניסה ולא את מה שהוקלד בטופס.
  return NextResponse.json({ id, name, phone });
}

/**
 * עדכון מתאמן קיים. איתי צריך את זה ביום־יום: להדליק מצב שיקום אחרי
 * פציעה, לאפס סיסמה למי ששכח, ולהשבית מי שעזב בלי למחוק את ההיסטוריה.
 *
 * שינוי סיסמה או השבתה מעלים את session_version — כלומר מנתקים את
 * המתאמן מכל המכשירים מיד, בלי לחכות שהטוקן יפוג.
 */
export async function PATCH(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  await initDb();
  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE id = ? AND role = 'trainee'",
    args: [id],
  });
  if (!existing.rows.length) {
    return NextResponse.json({ error: "המתאמן לא נמצא" }, { status: 404 });
  }

  const sets: string[] = [];
  const args: (string | number)[] = [];
  let kickDevices = false;

  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "צריך שם" }, { status: 400 });
    sets.push("name = ?");
    args.push(name);
  }

  if (body.rehabMode != null) {
    sets.push("rehab_mode = ?");
    args.push(body.rehabMode ? 1 : 0);
  }

  if (body.active != null) {
    const active = body.active ? 1 : 0;
    sets.push("active = ?");
    args.push(active);
    if (active === 0) kickDevices = true;
  }

  if (body.notes != null) {
    sets.push("notes = ?");
    args.push(String(body.notes));
  }

  if (body.password) {
    const password = String(body.password).trim();
    if (password.length < 4) {
      return NextResponse.json(
        { error: "הסיסמה צריכה לפחות 4 תווים" },
        { status: 400 }
      );
    }
    sets.push("password_hash = ?");
    args.push(await hashPassword(password));
    kickDevices = true;
  }

  if (!sets.length) {
    return NextResponse.json({ error: "אין מה לעדכן" }, { status: 400 });
  }
  if (kickDevices) sets.push("session_version = session_version + 1");

  args.push(id);
  await db.execute({
    sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });

  return NextResponse.json({ ok: true });
}
