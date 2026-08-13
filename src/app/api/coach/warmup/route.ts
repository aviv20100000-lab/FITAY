import { NextResponse } from "next/server";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * מנות החימום.
 *
 * החימום זהה בכל האימונים ולכן הוא רשימה אחת, לא פריטים בתוך אימון.
 * עד עכשיו הרשימה הייתה קבועה בקוד, וכל שינוי של איתי דרש דחיפה. כאן
 * הוא עורך אותה כמו כל שאר התוכן.
 *
 * PUT מקבל את הרשימה כולה ולא שורה בודדת: הסדר הוא חלק מהמשמעות, ושמירת
 * שורה אחת בכל פעם הייתה מחייבת לתאם מיקומים בין קריאות.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד.
export const preferredRegion = "fra1";

/** תקרה שפויה. שישה עד שמונה תרגילים הם חימום, שלושים הם אימון. */
const MAX_ITEMS = 12;

async function isCoach() {
  const user = await getSessionUser();
  return !!user && user.role === "coach";
}

/**
 * מספר חיובי בתוך תחום.
 *
 * null כשהשדה ריק, "range" כשהמספר קיים אבל מחוץ לתחום. חיתוך שקט אל
 * התקרה היה שומר 600 שניות למי שהתכוון ל-90 והקליד 900, ומחזיר "נשמר".
 */
function positive(value: unknown, max: number): number | null | "range" {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return "range";
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > max) return "range";
  return rounded;
}

export async function PUT(req: Request) {
  if (!(await isCoach())) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  await initDb();

  const body = (await req.json()) as { items?: unknown };
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "רשימה חסרה" }, { status: 400 });
  }
  if (body.items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `אפשר עד ${MAX_ITEMS} תרגילים בחימום` },
      { status: 400 }
    );
  }

  /*
   * רק תרגילים שקיימים בספרייה ומסומנים כחימום. בלי הבדיקה הזאת אפשר
   * היה לשתול בחימום תרגיל כוח, והמתאמן היה מקבל מתח לפני שהתחמם.
   */
  const known = await db.execute(
    "SELECT id, name FROM exercises WHERE category = 'warmup'"
  );
  const allowed = new Set(known.rows.map((row) => String(row.id)));

  const names = new Map(known.rows.map((row) => [String(row.id), String(row.name)]));
  const seen = new Set<string>();
  const rows: {
    id: string;
    sets: number;
    reps: number | null;
    seconds: number | null;
  }[] = [];

  for (const entry of body.items) {
    const item = entry as Record<string, unknown>;
    const id = String(item.exerciseId ?? "").trim();

    /*
     * שורה שאי אפשר לשמור עוצרת את כל הבקשה במקום להידלג בשקט.
     * דילוג היה מחזיר "נשמר" בזמן שתרגיל נעלם מהחימום, והמאמן היה
     * מגלה את זה רק בטעינה הבאה של המסך.
     */
    if (!id || !allowed.has(id)) {
      return NextResponse.json(
        {
          error:
            "אחד התרגילים ברשימה כבר לא קיים בספריית החימום. רענן את המסך ונסה שוב.",
        },
        { status: 409 }
      );
    }
    if (seen.has(id)) {
      return NextResponse.json(
        { error: `${names.get(id) ?? "אותו תרגיל"} מופיע פעמיים בחימום` },
        { status: 400 }
      );
    }
    seen.add(id);

    const where = names.get(id) ?? "אחד התרגילים";
    const sets = positive(item.sets, 10);
    if (sets === "range") {
      return NextResponse.json(
        { error: `מספר הסטים ב${where} צריך להיות בין 1 ל-10` },
        { status: 400 }
      );
    }

    const reps = positive(item.reps, 200);
    if (reps === "range") {
      return NextResponse.json(
        { error: `מספר החזרות ב${where} צריך להיות בין 1 ל-200` },
        { status: 400 }
      );
    }

    const seconds = positive(item.seconds, 600);
    if (seconds === "range") {
      return NextResponse.json(
        { error: `מספר השניות ב${where} צריך להיות בין 1 ל-600` },
        { status: 400 }
      );
    }

    // אחד מהשניים, לא שניהם. חזרות גוברות כשמולאו שניהם בטעות.
    if (reps == null && seconds == null) {
      return NextResponse.json(
        { error: `חסר מספר ב${where}` },
        { status: 400 }
      );
    }

    rows.push({
      id,
      sets: sets ?? 1,
      reps,
      seconds: reps == null ? seconds : null,
    });
  }

  /*
   * מחיקה והכנסה מחדש בתוך אצווה אחת. הטבלה קטנה, והחלופה — עדכון לפי
   * הפרש — הייתה משאירה מיקומים כפולים אם קריאה נופלת באמצע.
   */
  await db.batch(
    [
      { sql: "DELETE FROM warmup_plan", args: [] },
      ...rows.map((row, index) => ({
        sql: `INSERT INTO warmup_plan (exercise_id, position, sets, reps, seconds)
              VALUES (?, ?, ?, ?, ?)`,
        args: [row.id, index, row.sets, row.reps, row.seconds],
      })),
    ],
    "write"
  );

  return NextResponse.json({ ok: true, count: rows.length });
}
