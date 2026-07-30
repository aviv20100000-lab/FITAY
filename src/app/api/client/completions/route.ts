import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendToCoach } from "@/lib/push";

/** מעל זה מאמן FITAY מקבל התראה נפרדת ומיד, ולא רק שורה בכרטיס. */
const PAIN_ALERT_FROM = 5;

// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

/** סיום אימון. דיווח כאב נשמר רק אם המתאמן במצב שיקום. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "trainee") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const programId = String(body.programId ?? "");
  const workoutId = String(body.workoutId ?? "");
  if (!programId || !workoutId) {
    return NextResponse.json({ error: "חסרים פרטי אימון" }, { status: 400 });
  }

  await initDb();

  // אימות שהתוכנית באמת משויכת לו — אחרת אפשר לרשום אימונים על תוכניות של אחרים.
  const allowed = await db.execute({
    sql: "SELECT 1 FROM assignments WHERE trainee_id = ? AND program_id = ?",
    args: [user.id, programId],
  });
  if (!allowed.rows.length) {
    return NextResponse.json({ error: "התוכנית לא משויכת לך" }, { status: 403 });
  }

  // דיווח כאב פתוח לכל מתאמן. קודם הוא נשמר רק למי שסומן במצב שיקום,
  // כלומר מתאמן שנפצע באמצע תוכנית לא היה לו איפה לדווח. עדיין לא חובה:
  // מי שלא בחר מספר, לא נשמר לו כלום.
  const rawPain = body.painLevel;
  let painLevel: number | null = null;
  if (rawPain != null && rawPain !== "") {
    const n = Number(rawPain);
    if (Number.isFinite(n) && n >= 0 && n <= 10) painLevel = Math.round(n);
  }

  const durationSec =
    body.durationSec == null ? null : Math.max(0, Math.round(Number(body.durationSec)));

  // כל הרישומים של האימון הזה חולקים את אותה חותמת זמן — ככה שולפים
  // אחר כך את "הפעם הקודמת" כיחידה אחת.
  const at = new Date().toISOString();
  const completionId = randomUUID();

  await db.execute({
    sql: `INSERT INTO completions
            (id,trainee_id,program_id,workout_id,completed_at,duration_sec,mood,pain_level,notes)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [
      completionId, user.id, programId, workoutId, at,
      Number.isFinite(durationSec as number) ? durationSec : null,
      body.mood ? String(body.mood) : null,
      painLevel,
      String(body.notes ?? ""),
    ],
  });

  // ── הסטים שבוצעו בפועל ──────────────────────────────────────────────
  // נשמרים רק פריטים ששייכים באמת לאימון הזה, כדי שלא יירשמו סטים
  // על תרגילים של אימון אחר.
  const raw = Array.isArray(body.setLogs) ? body.setLogs : [];
  if (raw.length) {
    const itemsRes = await db.execute({
      sql: "SELECT id, exercise_id FROM workout_items WHERE workout_id = ?",
      args: [workoutId],
    });
    const validItems = new Map(
      itemsRes.rows.map((r) => [String(r.id), String(r.exercise_id)])
    );

    const num = (v: unknown) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };

    const statements = [];
    for (const entry of raw) {
      const itemId = String(entry?.workoutItemId ?? "");
      const exerciseId = validItems.get(itemId);
      if (!exerciseId) continue;

      const setNumber = num(entry?.setNumber);
      if (setNumber == null || setNumber < 1) continue;

      const reps = num(entry?.reps);
      const seconds = num(entry?.seconds);
      if (reps == null && seconds == null) continue;

      const side = entry?.side === "weak" || entry?.side === "strong" ? entry.side : null;
      // האם הסט בוצע בעזרת גומייה. זה מה שמאפשר להשוואה לפעם הקודמת
      // להישאר כנה, כי סט עם גומייה אינו אותו הישג כמו סט בלעדיה.
      const banded = entry?.banded === true ? 1 : 0;

      statements.push({
        sql: `INSERT INTO set_logs
                (id,trainee_id,workout_id,workout_item_id,exercise_id,set_number,reps,seconds,side,banded,logged_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          randomUUID(), user.id, workoutId, itemId, exerciseId,
          setNumber, reps, seconds, side, banded, at,
        ],
      });
    }
    if (statements.length) await db.batch(statements, "write");
  }

  // ── התראה למאמן FITAY ────────────────────────────────────────────────
  // רצה אחרי שהתשובה נשלחה. המתאמן סיים אימון והוא לא צריך לחכות
  // שהתראה תיסגר, ובטח לא שההעברה תיכשל ותפיל לו את הסיום.
  after(async () => {
    try {
      const workout = await db.execute({
        sql: "SELECT title FROM workouts WHERE id = ?",
        args: [workoutId],
      });
      const workoutTitle = String(workout.rows[0]?.title ?? "אימון");

      await sendToCoach({
        title: `${user.name} סיים אימון`,
        body: workoutTitle,
        url: `/coach/completions/${completionId}`,
        // tag לפי מתאמן: שני אימונים באותו יום לא ייערמו לשתי התראות.
        tag: `done-${user.id}`,
      });

      if (painLevel != null && painLevel >= PAIN_ALERT_FROM) {
        await sendToCoach({
          title: `${user.name} דיווח כאב ${painLevel}`,
          body: `אחרי ${workoutTitle}. פתח את הדיווח לפרטים.`,
          url: `/coach/completions/${completionId}`,
          tag: `pain-${user.id}`,
        });
      }
    } catch {
      // התראה שלא נשלחה לא הופכת אימון שהושלם לכישלון.
    }
  });

  return NextResponse.json({ ok: true });
}
