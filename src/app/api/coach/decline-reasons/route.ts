import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

/** תקרה שפויה. רשימה ארוכה מזה מפסיקה להיות בחירה מהירה ברגע ההחלטה. */
const MAX_REASONS = 8;

/** אורך מרבי להודעה אחת, כמו בשאר שדות הטקסט החופשי באפליקציה. */
const MAX_LENGTH = 500;

/**
 * ההודעות המוכנות שאיתי בוחר מהן כשהוא לא מאשר הקשיה.
 *
 * כתיבה מלאה של הרשימה ולא עדכון שורה בודדת: המסך מציג את כולן יחד,
 * ואיתי עורך, מוסיף ומוחק בבת אחת. שליחה של רשימה ריקה נדחית, כי מסך
 * הדחייה בלי אף הודעה מוכנה מכריח לכתוב מאפס בכל פעם.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.reasons) ? body.reasons : null;
  if (!raw) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const reasons = raw
    .map((value: unknown) => String(value ?? "").trim().slice(0, MAX_LENGTH))
    .filter((value: string) => value.length > 0)
    .slice(0, MAX_REASONS);

  if (reasons.length === 0) {
    return NextResponse.json(
      { error: "צריך להשאיר לפחות הודעה אחת" },
      { status: 400 }
    );
  }

  await initDb();

  await db.batch(
    [
      { sql: "DELETE FROM decline_reasons", args: [] },
      ...reasons.map((text: string, index: number) => ({
        sql: "INSERT INTO decline_reasons (id, position, body) VALUES (?,?,?)",
        args: [randomUUID(), index, text],
      })),
    ],
    "write"
  );

  return NextResponse.json({ ok: true });
}
