import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { compressVideo } from "@/lib/video-compress";
import { generatePoster } from "@/lib/video-poster";
import {
  deleteObject,
  isOurStorage,
  keyFromUrl,
  objectInfo,
  VIDEO_TYPES,
} from "@/lib/r2";

// הדחיסה רצה ב-after, כלומר אחרי שהתשובה נשלחה אבל בתוך אותה הפעלה.
// לכן התקרה של המסלול היא גם התקרה של הדחיסה.
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

export const maxDuration = 300;

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
  /*
   * תמונת פתיחה שהדפדפן חילץ מהקליפ עוד לפני ההעלאה. בלעדיה הכרטיס
   * מציג מלבן שחור עד שהדחיסה בשרת מסיימת, וזו דקה שבה איתי לא יודע
   * איזה קליפ הוא בכלל העלה.
   */
  const rawPoster = String(body?.posterUrl ?? "");
  const posterUrl = rawPoster && isOurStorage(rawPoster) ? rawPoster : null;

  const key = keyFromUrl(url);
  if (!key) {
    return NextResponse.json({ error: "כתובת לא תקינה" }, { status: 400 });
  }

  await initDb();

  const existing = await db.execute({
    sql: "SELECT id FROM videos WHERE url = ?",
    args: [url],
  });
  if (existing.rows.length) return NextResponse.json({ ok: true });

  // מוודאים שהקובץ באמת קיים באחסון לפני שהוא נכנס לקטלוג.
  const info = await objectInfo(key);
  if (info === null) {
    return NextResponse.json({ error: "הקובץ לא נמצא באחסון" }, { status: 400 });
  }
  // וגם שהוא באמת סרטון. R2 לא אוכף את הסוג שנחתם, ולכן הסוג שנשמר
  // הוא מה שהדפדפן שלח. קובץ שמוגש כ-HTML מהדומיין הציבורי של הדלי
  // הוא בדיוק מה שלא צריך להיות שם.
  if (!VIDEO_TYPES.has(info.contentType)) {
    return NextResponse.json({ error: "הקובץ אינו סרטון" }, { status: 400 });
  }
  const size = info.size;

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO videos
            (id,filename,url,hash,size,label,uploaded_at,compress_state,poster_url)
          VALUES (?,?,?,NULL,?,'',?,'pending',?)`,
    args: [id, filename, url, size, new Date().toISOString(), posterUrl],
  });

  // התשובה חוזרת מיד, והדחיסה ממשיכה ברקע. אם ההפעלה נחתכת באמצע,
  // השורה נשארת ב-pending וה-cron אוסף אותה.
  after(async () => {
    try {
      const outcome = await compressVideo(id);
      if (outcome.status === "done") {
        await generatePoster(id);
      }
    } catch {
      // עבודת הרקע לא מעכבת את תשובת ההעלאה; ה-cron הוא רשת הביטחון.
    }
  });

  return NextResponse.json({ ok: true });
}

/**
 * שינוי שם תצוגה לסרטון.
 *
 * איתי מעלה קבצים מהטלפון עם שמות כמו IMG_6380.mp4, והשם הזה הוא מה
 * שהספרייה מציגה ומה שהחיפוש מחפש בו. השינוי נוגע רק בעמודת filename,
 * לא בכתובת הקובץ באחסון, ולכן שום שיוך לתרגיל לא זז.
 */
export async function PATCH(request: Request) {
  if (!(await requireCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url = String(body?.url ?? "");
  const filename = String(body?.filename ?? "").trim();
  if (!filename) {
    return NextResponse.json({ error: "צריך שם לסרטון" }, { status: 400 });
  }

  await initDb();

  const res = await db.execute({
    sql: "UPDATE videos SET filename = ? WHERE url = ?",
    args: [filename.slice(0, 120), url],
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ error: "הסרטון לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/** מחיקת סרטון — מהאחסון, מהקטלוג, ומכל תרגיל שהיה מקושר אליו. */
export async function DELETE(request: Request) {
  if (!(await requireCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url = String(body?.url ?? "");
  if (!isOurStorage(url)) {
    return NextResponse.json({ error: "כתובת לא תקינה" }, { status: 400 });
  }

  await initDb();

  // המקור נשמר לצד הגרסה הדחוסה, ולכן מחיקה צריכה לקחת את שניהם.
  // בלי זה הקובץ הכבד היה נשאר באחסון בלי שאף אחד מצביע אליו.
  const row = await db.execute({
    sql: "SELECT original_url FROM videos WHERE url = ?",
    args: [url],
  });
  const originalUrl = row.rows[0]?.original_url;

  // מנתקים לפני המחיקה — אחרת תרגיל היה מצביע לקובץ שכבר לא קיים.
  await db.execute({
    sql: "UPDATE exercises SET video_file = NULL WHERE video_file = ?",
    args: [url],
  });
  await db.execute({
    sql: "UPDATE exercises SET stance_video_level_2 = NULL WHERE stance_video_level_2 = ?",
    args: [url],
  });
  await db.execute({
    sql: "UPDATE exercises SET stance_video_level_3 = NULL WHERE stance_video_level_3 = ?",
    args: [url],
  });
  await db.execute({
    sql: "UPDATE exercises SET band_video_file = NULL WHERE band_video_file = ?",
    args: [url],
  });
  await db.execute({
    sql: "UPDATE workout_items SET video_file = NULL WHERE video_file = ?",
    args: [url],
  });
  await db.execute({ sql: "DELETE FROM videos WHERE url = ?", args: [url] });

  for (const target of [url, originalUrl ? String(originalUrl) : null]) {
    const targetKey = target ? keyFromUrl(target) : null;
    if (!targetKey) continue;
    try {
      await deleteObject(targetKey);
    } catch {
      // הקובץ כבר לא באחסון — הקטלוג נקי וזה מה שחשוב.
    }
  }

  return NextResponse.json({ ok: true });
}
