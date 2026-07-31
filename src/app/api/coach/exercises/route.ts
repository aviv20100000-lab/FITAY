import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/exercises-data";

/**
 * ספריית התרגילים.
 *
 * עד עכשיו המסלול הזה ידע שני דברים בלבד, שיוך סרטון וסימון גומייה, וכל
 * שאר התוכן הגיע מ-exercises-data.ts דרך npm run exercises:sync. כלומר
 * תיקון מילה בהדגשים היה משימה למפתח. עכשיו מאמן FITAY עורך הכל מהמסך,
 * והסקריפט נשאר רק כדי לזרוע מסד חדש.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

const KINDS = ["strength", "rehab"];
const TYPES = ["reps", "hold", "amrap"];

async function isCoach() {
  const user = await getSessionUser();
  return !!user && user.role === "coach";
}

/** רשימת מחרוזות מהטופס: חיתוך רווחים, בלי שורות ריקות, בלי זנב אינסופי. */
function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((entry) => entry.slice(0, 200));
}

type Content = {
  name: string;
  category: string;
  kind: string;
  type: string;
  tempo: string;
  muscles: string;
  description: string;
  technique: string[];
  tips: string[];
  unilateral: number;
};

/** בודק ומנרמל את שדות התוכן. מחזיר מחרוזת שגיאה כשמשהו לא תקין. */
function readContent(body: Record<string, unknown>): Content | string {
  const name = String(body.name ?? "").trim();
  if (!name) return "צריך שם לתרגיל";

  const category = String(body.category ?? "").trim();
  if (!CATEGORIES[category]) return "קטגוריה לא מוכרת";

  const kind = String(body.kind ?? "strength").trim();
  if (!KINDS.includes(kind)) return "סוג תרגיל לא תקין";

  const type = String(body.type ?? "reps").trim();
  if (!TYPES.includes(type)) return "מדידה לא תקינה";

  return {
    name: name.slice(0, 80),
    category,
    kind,
    type,
    tempo: String(body.tempo ?? "").trim().slice(0, 16),
    muscles: String(body.muscles ?? "").trim().slice(0, 120),
    description: String(body.description ?? "").trim().slice(0, 1200),
    technique: cleanList(body.technique),
    tips: cleanList(body.tips),
    unilateral: body.unilateral ? 1 : 0,
  };
}

/** תרגיל חדש. נכנס לסוף הרשימה. */
export async function POST(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const content = readContent(body);
  if (typeof content === "string") {
    return NextResponse.json({ error: content }, { status: 400 });
  }

  await initDb();
  const pos = await db.execute(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM exercises"
  );

  // מזהה אקראי ולא שם מקוצר. המזהים הוותיקים נכתבו ביד בקוד, ותרגיל
  // חדש בעברית לא נותן מזהה קריא ממילא.
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO exercises
            (id,name,category,kind,type,tempo,muscles,description,technique,tips,
             video_file,unilateral,position,band_allowed)
          VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)`,
    args: [
      id,
      content.name,
      content.category,
      content.kind,
      content.type,
      content.tempo,
      content.muscles,
      content.description,
      JSON.stringify(content.technique),
      JSON.stringify(content.tips),
      content.unilateral,
      Number(pos.rows[0].next),
      body.bandAllowed ? 1 : 0,
    ],
  });

  return NextResponse.json({ id });
}

/**
 * עדכון תרגיל.
 *
 * כל בקשה נוגעת רק במה שנשלח בה, ולכן מסך הסרטונים ומסך התוכן יכולים
 * לעבוד על אותו תרגיל בלי לדרוס זה את זה. ההבחנה בין שדה חסר לשדה ריק
 * נעשית על קיום המפתח, כי videoFile ריק הוא בקשה לגיטימית לנתק סרטון.
 */
export async function PATCH(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const exerciseId = String(body.exerciseId ?? "");
  if (!exerciseId) {
    return NextResponse.json({ error: "חסר מזהה תרגיל" }, { status: 400 });
  }

  await initDb();

  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (body.bandAllowed != null) {
    sets.push("band_allowed = ?");
    args.push(body.bandAllowed ? 1 : 0);
  }

  if ("videoFile" in body) {
    const raw = body.videoFile == null ? "" : String(body.videoFile).trim();
    const videoFile = raw === "" ? null : raw;

    // רק כתובת שכבר בקטלוג מתקבלת — אחרת אפשר להזריק לינק חיצוני כלשהו.
    if (videoFile) {
      const known = await db.execute({
        sql: "SELECT 1 FROM videos WHERE url = ?",
        args: [videoFile],
      });
      if (!known.rows.length) {
        return NextResponse.json({ error: "הסרטון לא נמצא בספרייה" }, { status: 400 });
      }
    }
    sets.push("video_file = ?");
    args.push(videoFile);
  }

  // שדות התוכן מגיעים תמיד כחבילה שלמה מהטופס, ולכן נבדקים ביחד.
  if ("name" in body) {
    const content = readContent(body);
    if (typeof content === "string") {
      return NextResponse.json({ error: content }, { status: 400 });
    }
    sets.push(
      "name = ?",
      "category = ?",
      "kind = ?",
      "type = ?",
      "tempo = ?",
      "muscles = ?",
      "description = ?",
      "technique = ?",
      "tips = ?",
      "unilateral = ?"
    );
    args.push(
      content.name,
      content.category,
      content.kind,
      content.type,
      content.tempo,
      content.muscles,
      content.description,
      JSON.stringify(content.technique),
      JSON.stringify(content.tips),
      content.unilateral
    );
  }

  if (!sets.length) {
    return NextResponse.json({ error: "אין מה לעדכן" }, { status: 400 });
  }

  args.push(exerciseId);
  const res = await db.execute({
    sql: `UPDATE exercises SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ error: "התרגיל לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * מחיקת תרגיל.
 *
 * חסומה ברגע שהתרגיל יושב באיזושהי תוכנית או שמישהו כבר ביצע אותו.
 * set_logs מצביע על התרגיל לפי מזהה, ולכן מחיקה כזאת הייתה מייתמת
 * היסטוריית אימונים של מתאמנים.
 */
export async function DELETE(request: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  await initDb();

  const used = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM workout_items WHERE exercise_id = ?",
    args: [id],
  });
  if (Number(used.rows[0].n) > 0) {
    return NextResponse.json(
      { error: "התרגיל נמצא בתוכניות ולכן אי אפשר למחוק אותו. אפשר לערוך אותו." },
      { status: 409 }
    );
  }

  const logged = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM set_logs WHERE exercise_id = ?",
    args: [id],
  });
  if (Number(logged.rows[0].n) > 0) {
    return NextResponse.json(
      { error: "מתאמנים כבר ביצעו את התרגיל והוא שמור בהיסטוריה שלהם." },
      { status: 409 }
    );
  }

  const res = await db.execute({
    sql: "DELETE FROM exercises WHERE id = ?",
    args: [id],
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ error: "התרגיל לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
