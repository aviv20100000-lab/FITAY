import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import {
  getSessionUser,
  hashPassword,
  setSession,
  verifyPassword,
} from "@/lib/auth";

/**
 * החשבון של מאמן FITAY עצמו.
 *
 * מסלול המתאמנים מסנן role='trainee', ולכן איתי לא יכול היה לשנות שם או
 * סיסמה של עצמו בלי להריץ את סקריפט ה-seed. כאן זה נסגר.
 *
 * שינוי סיסמה דורש את הסיסמה הנוכחית. לא בגלל שמישהו אחר מגיע לכאן, אלא
 * כי טלפון פתוח ששוכב על הספסל הוא כל מה שצריך כדי לנעול את המאמן מחוץ
 * למערכת שלו.
 *
 * אחרי השינוי session_version עולה, כלומר כל המכשירים מתנתקים. המכשיר
 * שביצע את הפעולה מקבל מיד עוגייה חדשה, אחרת איתי היה מוצא את עצמו
 * במסך הכניסה בדיוק אחרי שהחליף סיסמה.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export async function PATCH(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  await initDb();

  const sets: string[] = [];
  const args: (string | number)[] = [];
  let passwordChanged = false;

  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "צריך שם" }, { status: 400 });
    sets.push("name = ?");
    args.push(name);
  }

  if (body.password) {
    const password = String(body.password).trim();
    const current = String(body.currentPassword ?? "");
    if (password.length < 4) {
      return NextResponse.json(
        { error: "הסיסמה צריכה לפחות 4 תווים" },
        { status: 400 }
      );
    }

    const stored = await db.execute({
      sql: "SELECT password_hash FROM users WHERE id = ?",
      args: [coach.id],
    });
    const hash = String(stored.rows[0]?.password_hash ?? "");
    const ok =
      (await verifyPassword(current, hash)) ||
      (current !== current.trim() &&
        (await verifyPassword(current.trim(), hash)));
    if (!ok) {
      return NextResponse.json({ error: "הסיסמה הנוכחית שגויה" }, { status: 403 });
    }

    sets.push("password_hash = ?");
    args.push(await hashPassword(password));
    passwordChanged = true;
  }

  if (!sets.length) {
    return NextResponse.json({ error: "אין מה לעדכן" }, { status: 400 });
  }
  if (passwordChanged) sets.push("session_version = session_version + 1");

  args.push(coach.id);
  await db.execute({
    sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });

  // העוגייה מונפקת מחדש רק אחרי שהמספר במסד כבר עלה, כדי שהיא תישא
  // את הגרסה החדשה ולא את זו שבדיוק פסלנו.
  if (passwordChanged) await setSession(coach);

  return NextResponse.json({ ok: true });
}
