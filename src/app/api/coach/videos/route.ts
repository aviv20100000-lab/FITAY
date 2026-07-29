import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { del, head } from "@vercel/blob";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const BLOB_HOST = ".public.blob.vercel-storage.com";

/** רק כתובות של האחסון שלנו. אחרת אפשר לרשום לינק חיצוני כלשהו כסרטון. */
function isOurBlob(url: string) {
  try {
    return new URL(url).hostname.endsWith(BLOB_HOST);
  } catch {
    return false;
  }
}

async function requireCoach() {
  const user = await getSessionUser();
  return user && user.role === "coach" ? user : null;
}

/** רישום סרטון שהדפדפן העלה זה עתה. */
export async function POST(request: Request) {
  if (!(await requireCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url = String(body?.url ?? "");
  const filename = String(body?.filename ?? "").trim() || "סרטון";

  if (!isOurBlob(url)) {
    return NextResponse.json({ error: "כתובת לא תקינה" }, { status: 400 });
  }

  await initDb();

  const existing = await db.execute({
    sql: "SELECT id FROM videos WHERE url = ?",
    args: [url],
  });
  if (existing.rows.length) return NextResponse.json({ ok: true });

  // מוודאים שהקובץ באמת קיים באחסון לפני שהוא נכנס לקטלוג.
  let size = 0;
  try {
    const meta = await head(url);
    size = meta.size;
  } catch {
    return NextResponse.json({ error: "הקובץ לא נמצא באחסון" }, { status: 400 });
  }

  await db.execute({
    sql: `INSERT INTO videos (id,filename,url,hash,size,label,uploaded_at)
          VALUES (?,?,?,NULL,?,'',?)`,
    args: [randomUUID(), filename, url, size, new Date().toISOString()],
  });

  return NextResponse.json({ ok: true });
}

/** מחיקת סרטון — מהאחסון, מהקטלוג, ומכל תרגיל שהיה מקושר אליו. */
export async function DELETE(request: Request) {
  if (!(await requireCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url = String(body?.url ?? "");
  if (!isOurBlob(url)) {
    return NextResponse.json({ error: "כתובת לא תקינה" }, { status: 400 });
  }

  await initDb();

  // מנתקים לפני המחיקה — אחרת תרגיל היה מצביע לקובץ שכבר לא קיים.
  await db.execute({
    sql: "UPDATE exercises SET video_file = NULL WHERE video_file = ?",
    args: [url],
  });
  await db.execute({
    sql: "UPDATE workout_items SET video_file = NULL WHERE video_file = ?",
    args: [url],
  });
  await db.execute({ sql: "DELETE FROM videos WHERE url = ?", args: [url] });

  try {
    await del(url);
  } catch {
    // הקובץ כבר לא באחסון — הקטלוג נקי וזה מה שחשוב.
  }

  return NextResponse.json({ ok: true });
}
