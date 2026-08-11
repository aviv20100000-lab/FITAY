import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser, hashPassword, normalizePhone } from "@/lib/auth";
import type { Gender } from "@/lib/gender";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

function readGender(value: unknown): { valid: boolean; gender: Gender } {
  if (value == null || value === "") return { valid: true, gender: null };
  if (value === "male" || value === "female") {
    return { valid: true, gender: value };
  }
  return { valid: false, gender: null };
}

export async function GET(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  await initDb();
  const result = await db.execute({
    sql: "SELECT gender FROM users WHERE id = ? AND role = 'trainee'",
    args: [id],
  });
  const row = result.rows[0];
  if (!row) {
    return NextResponse.json({ error: "המתאמן לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ gender: readGender(row.gender).gender });
}

export async function POST(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  let name: string, phone: string, password: string, rehabMode: boolean;
  let gender: Gender;
  try {
    const body = await request.json();
    name = String(body.name ?? "").trim();
    phone = normalizePhone(String(body.phone ?? ""));
    // חיתוך רווחים. רווח נגרר מהמקלדת נשמר בשקט ואז חוסם כניסה.
    password = String(body.password ?? "").trim();
    rehabMode = Boolean(body.rehabMode);
    const parsedGender = readGender(body.gender);
    if (!parsedGender.valid) {
      return NextResponse.json({ error: "בחירת המגדר לא תקינה" }, { status: 400 });
    }
    gender = parsedGender.gender;
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
  /*
    מגדר חובה בפתיחת מתאמן, ורק כאן. מתאמן שנפתח בלי מגדר מקבל פנייה
    ניטרלית לתמיד ואף אחד לא שם לב, כי שום מסך לא מתריע על זה.
    ב-PATCH המגדר נשאר אופציונלי בכוונה: שם מעדכנים שדה אחד בכל פעם,
    ובקשה שמדליקה מצב שיקום לא צריכה לשאת מגדר כדי לעבור.
  */
  if (!gender) {
    return NextResponse.json({ error: "צריך לבחור מגדר" }, { status: 400 });
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
    sql: `INSERT INTO users (id,name,phone,password_hash,role,active,rehab_mode,gender,notes,session_version,created_at)
          VALUES (?,?,?,?, 'trainee', 1, ?, ?, '', 1, ?)`,
    args: [
      id,
      name,
      phone,
      await hashPassword(password),
      rehabMode ? 1 : 0,
      gender,
      new Date().toISOString(),
    ],
  });

  // מחזירים את הטלפון כפי שנשמר אחרי נרמול, כדי שהמסך יציג בדיוק
  // את מה שצריך להקליד בכניסה ולא את מה שהוקלד בטופס.
  return NextResponse.json({ id, name, phone });
}

/**
 * עדכון מתאמן קיים. מאמן FITAY צריך את זה ביום־יום: להדליק מצב שיקום אחרי
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
  const args: (string | number | null)[] = [];
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

  if (body.gender !== undefined) {
    const parsedGender = readGender(body.gender);
    if (!parsedGender.valid) {
      return NextResponse.json({ error: "בחירת המגדר לא תקינה" }, { status: 400 });
    }
    sets.push("gender = ?");
    args.push(parsedGender.gender);
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

/**
 * מחיקת מתאמן.
 *
 * זו פעולה בלתי הפיכה. המסד מוחק בשרשור גם את כל מה שתלוי במשתמש:
 * שיוכי תוכניות, אימונים שהושלמו, כל הסטים שנרשמו, בקשות מעבר רמה
 * ומנויי ההתראות. אין שחזור.
 *
 * לכן שתי הגנות: המסלול דורש את שם המתאמן במדויק, והמסך מציג לפני כן
 * בדיוק מה עומד להימחק. למי שרק רוצה לחסום כניסה יש כיבוי חשבון,
 * שהוא הפיך ולא נוגע בנתונים.
 */
export async function DELETE(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? "");
  const confirmName = String(body?.confirmName ?? "").trim();
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  await initDb();

  const found = await db.execute({
    sql: "SELECT id, name, role FROM users WHERE id = ?",
    args: [id],
  });
  const target = found.rows[0];
  if (!target) {
    return NextResponse.json({ error: "המתאמן לא נמצא" }, { status: 404 });
  }

  // מאמן לא מוחק מאמן, וגם לא את עצמו. זו הדרך היחידה להישאר בלי גישה.
  if (String(target.role) !== "trainee") {
    return NextResponse.json({ error: "אפשר למחוק רק מתאמנים" }, { status: 400 });
  }

  if (confirmName !== String(target.name).trim()) {
    return NextResponse.json(
      { error: "השם שהוקלד לא תואם. הקלד את שם המתאמן במדויק." },
      { status: 400 }
    );
  }

  await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });

  return NextResponse.json({ ok: true });
}
