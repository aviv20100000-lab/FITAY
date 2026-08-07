import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import AchievementsCalendar from "@/components/AchievementsCalendar";
import HardenedDays, { type HardeningRow } from "./HardenedDays";
import RecentWorkouts, { type RecentRow } from "./RecentWorkouts";
import { programLevelName } from "@/lib/program-levels";

export const metadata = { title: "הישגים · FITAY" };

/**
 * הלשונית הזאת עונה על שאלה אחת: מה הצטבר.
 *
 * קודם היא הציגה לכל תרגיל את סך החזרות באימון האחרון עם קו מגמה. זה היה
 * תקין טכנית וריק רגשית, כי הוא מדד מספרים בתוך תרגיל בזמן שההתקדמות
 * שהמתאמן חי אותה היא מעבר בין רמות. הוא גם הפך שינוי מרשם של המאמן
 * לירידה באדום: תרגיל שהתקרה בו שונתה מ-15 שניות ל-5 נראה כמו נפילה.
 *
 * החוק שמפריד בין הלשונית הזאת למסך הבית: הבית עונה מה עושים היום, וכאן
 * יושב מה שכבר נעשה. כל מה שמשפיע על האימון של היום נשאר בבית.
 *
 * מה שאסור להיכנס לכאן: השוואה בין חודשים, אחוזים, כל ניסוח שאומר פחות
 * מהקודם, ורצף שמתאפס. מתאמן שחוזר מפציעה או ממילואים לא צריך מסך
 * שמעניש אותו. ההשוואה בין חודשים שייכת למסכי המאמן, כי אצל איתי חודש
 * חלש הוא אות לפעולה.
 */
const LEGACY_MOODS: Record<string, string> = {
  easy: "קל",
  good: "מתאים",
  suitable: "מתאים",
  medium: "מתאים",
  hard: "קשה",
  קל: "קל",
  מתאים: "מתאים",
  קשה: "קשה",
};

/** כמה ימים אחורה נשלפים בשביל לוח החודש. חודש ועוד שוליים לאזורי זמן. */
const CALENDAR_DAYS = 40;

export default async function AchievementsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  /*
   * המיגרציה רצה כאן ולא רק בהתחברות. progression_events היא טבלה חדשה,
   * ומתאמן שכבר מחובר לא עובר דרך login, כלומר יכול היה להגיע למסך הזה
   * לפני שהטבלה נוצרה. הקריאה נשמרת בזיכרון התהליך ולכן היא עולה שאילתה
   * אחת בפעם הראשונה בלבד.
   */
  await initDb();

  const since = new Date(
    Date.now() - CALENDAR_DAYS * 86_400_000
  ).toISOString();

  const [totals, calendar, achievements, programs, recent] = await db.batch(
    [
      {
        sql: `SELECT
                (SELECT COUNT(*) FROM completions WHERE trainee_id = ?) AS workouts,
                (SELECT COUNT(*) FROM assignments
                  WHERE trainee_id = ? AND status = 'completed') AS programs,
                (SELECT COUNT(*) FROM progression_events
                  WHERE trainee_id = ? AND status IN ('earned','approved')) AS harder`,
        args: [user.id, user.id, user.id],
      },
      {
        sql: `SELECT completed_at FROM completions
               WHERE trainee_id = ? AND completed_at >= ?
               ORDER BY completed_at`,
        args: [user.id, since],
      },
      // אוסף ההקשיות. רק מה שבאמת קרה, כלומר הקשיה שבוצעה מיד והקשיה
      // שאיתי אישר. בקשה שממתינה או שלא אושרה אינה הישג.
      {
        sql: `SELECT pe.kind, pe.created_at, pe.decided_at, e.name
                FROM progression_events pe
                JOIN exercises e ON e.id = pe.exercise_id
               WHERE pe.trainee_id = ? AND pe.status IN ('earned','approved')
               ORDER BY COALESCE(pe.decided_at, pe.created_at) DESC
               LIMIT 60`,
        args: [user.id],
      },
      // התוכניות שהושלמו. עברו לכאן ממסך הבית, וזה מפנה את הבית.
      {
        sql: `SELECT a.id, p.title, p.level, a.completed_at,
                     (SELECT COUNT(*) FROM completions c
                       WHERE c.trainee_id = a.trainee_id
                         AND c.program_id = a.program_id
                         AND c.completed_at >= a.assigned_at
                         AND c.completed_at <= COALESCE(a.completed_at, c.completed_at)) AS completed
                FROM assignments a JOIN programs p ON p.id = a.program_id
               WHERE a.trainee_id = ? AND a.status = 'completed'
               ORDER BY a.completed_at DESC`,
        args: [user.id],
      },
      {
        sql: `SELECT c.completed_at, c.mood, c.duration_sec, w.title
                FROM completions c LEFT JOIN workouts w ON w.id = c.workout_id
               WHERE c.trainee_id = ?
               ORDER BY c.completed_at DESC LIMIT 15`,
        args: [user.id],
      },
    ],
    "read"
  );

  const workouts = Number(totals.rows[0].workouts ?? 0);
  const programCount = Number(totals.rows[0].programs ?? 0);
  const harderCount = Number(totals.rows[0].harder ?? 0);

  const date = (iso: string) => new Date(iso).toLocaleDateString("he-IL");

  /** התאריך ככותרת של כרטיס יום: 7 באוגוסט 2026. */
  const dayHeading = (iso: string) =>
    new Date(iso).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  /*
   * הקיבוץ לפי יום נשען על אותה מחרוזת תאריך שגם מוצגת, ולכן מה שנראה
   * כיום אחד באמת נספר כיום אחד. חישוב היום פעמיים בשתי דרכים היה יוצר
   * כרטיס עם כותרת אחת ושני ימים בפנים.
   */
  const hardenings: HardeningRow[] = achievements.rows.map((row) => {
    const iso = String(row.decided_at ?? row.created_at);
    return {
      name: String(row.name),
      kind: String(row.kind),
      dayKey: date(iso),
      heading: dayHeading(iso),
    };
  });

  const recentRows: RecentRow[] = recent.rows.map((c) => {
    // אימון שנמשך פחות מדקה הופיע כ"0 דק׳", שנראה כמו תקלה.
    // עיגול לפני הבדיקה, כי 25 שניות מתעגלות לאפס.
    const minutes = c.duration_sec ? Math.round(Number(c.duration_sec) / 60) : 0;
    return {
      title: c.title ? String(c.title) : "אימון",
      date: date(String(c.completed_at)),
      minutes: minutes >= 1 ? minutes : null,
      mood: c.mood ? LEGACY_MOODS[String(c.mood).toLowerCase()] ?? null : null,
    };
  });

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
        <h1 className="mb-1 text-3xl font-bold tracking-tight">הישגים</h1>
        <p className="mb-7 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          כל מה שאספת מאז שהתחלת. המספרים כאן רק עולים.
        </p>

        {workouts === 0 ? (
          /*
           * מסך פתיחה למי שעוד לא התאמן, עם מועד פירעון קרוב.
           * "מה ייאסף כאן" לבדו משאיר מסך ריק בלי להגיד מתי הוא יפסיק
           * להיות ריק, וזה בדיוק המסך שנפסל. אחרי אימון אחד כבר יש כאן
           * נקודה בלוח ומונה שזז.
           */
          <div className="glass rounded-3xl px-6 py-14 text-center">
            <p className="mb-3 text-5xl">🏅</p>
            <p className="mb-2 text-lg font-bold">האימון הראשון שלך יופיע כאן</p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
              כאן נאספים האימונים שעשית, התרגילים שהוקשו, והתוכניות
              שסיימת. אחרי האימון הראשון תראה את זה מתחיל להיבנות.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-7 grid grid-cols-3 gap-2.5">
              <Counter value={workouts} label="אימונים" />
              <Counter value={harderCount} label="תרגילים שהוקשו" />
              <Counter value={programCount} label="תוכניות שסיימת" />
            </div>

            <SectionTitle title="החודש" />
            <AchievementsCalendar
              completedAt={calendar.rows.map((row) => String(row.completed_at))}
            />

            <div className="mt-10">
              <SectionTitle
                title="תרגילים שהוקשו"
                hint="בכל אחד מהם הגעת ליעד בכל הסטים, והתרגיל נהיה קשה יותר"
              />
            </div>
            {hardenings.length === 0 ? (
              <p
                className="glass rounded-3xl px-6 py-8 text-center text-sm leading-relaxed"
                style={{ color: "var(--dim)" }}
              >
                עוד לא הוקשה אצלך תרגיל. זה קורה כשמגיעים ליעד בכל הסטים.
              </p>
            ) : (
              <HardenedDays rows={hardenings} />
            )}

            {programs.rows.length > 0 && (
              <>
                <div className="mt-12">
                  <SectionTitle title="תוכניות שסיימת" tone="quiet" />
                </div>
                <div className="glass rounded-3xl p-2">
                  {programs.rows.map((program, i) => (
                    <div
                      key={String(program.id)}
                      className="flex items-center gap-3 px-3.5 py-3"
                      style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black"
                        style={{
                          background: "rgba(180,133,79,.18)",
                          border: "1px solid rgba(224,190,147,.35)",
                          color: "var(--wood-1)",
                        }}
                      >
                        ✓
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {String(program.title)}
                        </p>
                        {/* התאריך מבדיל בין ריצות חוזרות של אותה תוכנית. */}
                        <p className="text-xs" style={{ color: "var(--dim)" }}>
                          {programLevelName(Number(program.level))} ·{" "}
                          {String(program.completed)} אימונים
                          {program.completed_at
                            ? ` · ${date(String(program.completed_at))}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mt-12">
              <SectionTitle title="אימונים אחרונים" tone="quiet" />
            </div>
            <RecentWorkouts rows={recentRows} />
          </>
        )}
      </div>
    </main>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="glass rounded-3xl px-2 py-5 text-center">
      {/* המונים הם הגיבור של המסך, ולכן הם המספר הגדול ביותר בדף. */}
      <b className="block text-3xl font-extrabold wood-text tabular-nums">
        {value}
      </b>
      <span className="text-xs leading-4" style={{ color: "var(--dim)" }}>
        {label}
      </span>
    </div>
  );
}

/**
 * כותרת מקטע. הקו הדוהה הוא אותו סימן שכבר משמש במסך המדריך ובתיבות
 * האישור של המאמן, ולכן הוא לא מכניס שפה חדשה למסך.
 *
 * quiet הוא המשקל של הזנב. המונים והלוח למעלה הם הגיבור, ההקשיות
 * אחריהם, והמקטעים האחרונים הם תיעוד. כשכל הכותרות באותו גודל הדף
 * מאבד את הסדר הזה והכל נקרא חשוב באותה מידה.
 */
function SectionTitle({
  title,
  hint,
  tone = "loud",
}: {
  title: string;
  hint?: string;
  tone?: "loud" | "quiet";
}) {
  const quiet = tone === "quiet";
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        <h2
          className={`shrink-0 ${quiet ? "text-base font-semibold" : "text-lg font-bold"}`}
          style={quiet ? { color: "var(--dim)" } : undefined}
        >
          {title}
        </h2>
        <span
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(to left, rgba(180,133,79,.45), transparent)",
          }}
        />
      </div>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
