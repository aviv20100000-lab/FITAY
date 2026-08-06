/**
 * מתחים ציבוריים: שליפת הקרובים, והוספה מהשטח.
 *
 * המיקום של המתאמן מגיע כפרמטר, משמש לחישוב מרחק, ולא נשמר בשום מקום.
 */
import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToCoach } from "@/lib/push";
import { findSpotNear, nearestSpots } from "@/lib/spots";

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

/**
 * קואורדינטה שאפשר לסמוך עליה.
 *
 * הבדיקה המעניינת היא לא הטווח אלא האפס. דפדפן שמחזיר קליטה כושלת נותן
 * לפעמים 0,0, וזאת נקודה במפרץ גינאה. שורה כזאת במסד היא זבל שאי אפשר
 * לזהות אחר כך.
 */
function validCoords(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return false;
  return true;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!validCoords(lat, lng)) {
    return NextResponse.json({ error: "מיקום לא תקין" }, { status: 400 });
  }

  await initDb();
  // רק איתי רואה מתחים מוסתרים, וגם הוא רק כשהוא מבקש. בלי זה ההסתרה
  // היא דלת חד כיוונית ואי אפשר לבטל טעות.
  const includeHidden =
    user.role === "coach" && params.get("hidden") === "1";
  const { spots, radiusKm } = await nearestSpots(lat, lng, { includeHidden });
  return NextResponse.json({ spots, radiusKm });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!validCoords(lat, lng)) {
    return NextResponse.json(
      { error: "לא הצלחנו לקבל מיקום תקין. נסה שוב בחוץ, מתחת לשמיים." },
      { status: 400 }
    );
  }

  const name = String(body?.name ?? "").trim().slice(0, 60);
  const note = String(body?.note ?? "").trim().slice(0, 300);
  const ringsClaim = body?.ringsClaim === true ? 1 : 0;

  await initDb();

  // מתח שכבר רשום לא הופך לשורה שנייה. מי שהוסיף אותו מקבל אותו בחזרה
  // עם הודעה, וזה עדיף על רשימה שמתמלאת בכפילויות.
  const existing = await findSpotNear(lat, lng);
  if (existing) {
    return NextResponse.json({ ok: true, spot: existing, duplicate: true });
  }

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO spots
            (id, source, name, city, lat, lng, rings_claim, note, added_by, created_at)
          VALUES (?, 'user', ?, '', ?, ?, ?, ?, ?, ?)`,
    args: [id, name, lat, lng, ringsClaim, note, user.id, new Date().toISOString()],
  });

  // ההתראה רצה אחרי התשובה. המתאמן לא מחכה לה, ואם היא נכשלת המתח כבר
  // נרשם ואיתי יראה אותו במסך.
  after(async () => {
    try {
      await sendToCoach({
        title: "נוסף מתח חדש",
        body: `${user.name} הוסיף ${name || "מתח"}${ringsClaim ? ", ומדווח שהוא מתאים לטבעות" : ""}`,
        url: "/spots",
        tag: `spot-${id}`,
      });
    } catch {
      // התראה שלא נשלחה לא הופכת הוספה שנרשמה לכישלון.
    }
  });

  return NextResponse.json({ ok: true, id });
}
