import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db, { initDb } from "@/lib/db";
import AchievementsCalendar from "@/components/AchievementsCalendar";
import HardenedDays, { type HardeningRow } from "./HardenedDays";
import ThenAndNow, { type ThenNowRow } from "./ThenAndNow";
import RecentWorkouts, { type RecentRow } from "./RecentWorkouts";
import { programLevelName } from "@/lib/program-levels";
import FitayIcon from "@/components/FitayIcon";

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

  const [
    totals,
    calendar,
    achievements,
    programs,
    recent,
    abandoned,
    activeLevel,
    thenNow,
  ] =
    await db.batch(
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
        /*
          to_step נשלף כי בלעדיו המסך יודע להגיד שתרגיל עלה דרגה ולא יודע
          להגיד לאן. שתי העמודות ישבו בטבלה מהיום שהיא נוצרה ומעולם לא
          נקראו, והשורה שיצאה מזה, "עלה דרגה פעמיים", היא רישום ולא מצב.
        */
        sql: `SELECT pe.kind, pe.to_step, pe.created_at, pe.decided_at, e.name
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
        sql: `SELECT c.id, c.completed_at, c.mood, c.duration_sec, w.title
                FROM completions c LEFT JOIN workouts w ON w.id = c.workout_id
               WHERE c.trainee_id = ?
               ORDER BY c.completed_at DESC LIMIT 15`,
        args: [user.id],
      },
      {
        sql: `SELECT id, started_day
                FROM aborted_workouts
               WHERE trainee_id = ?
               ORDER BY started_day DESC, reported_at DESC LIMIT 15`,
        args: [user.id],
      },
      /*
       * הרמה שהמתאמן נמצא בה עכשיו, בשביל מקטע "הדרך". קריאה בלבד, ובתוך
       * אותה חבילה כמו השאר כדי לא להוסיף סיבוב למסד. יכולות להיות כמה
       * שיוכים פעילים במקביל, ולכן נלקח האחרון שהוקצה, כמו שמסך הבית ממיין.
       */
      {
        sql: `SELECT p.level
                FROM assignments a JOIN programs p ON p.id = a.program_id
               WHERE a.trainee_id = ? AND a.status = 'active'
               ORDER BY a.assigned_at DESC LIMIT 1`,
        args: [user.id],
      },
      /*
       * אז והיום: הסט הראשון שנרשם אי פעם בכל תרגיל, מול השיא בדרגת
       * הקושי הנוכחית.
       *
       * הכל מצטבר במסד ולא נשלף כשורות גולמיות. ל-set_logs של מתאמן ותיק
       * יש יותר מאלף שורות, וגרירה שלהן לשרת בכל טעינת מסך בשביל שני
       * מספרים לכל תרגיל היא בזבוז.
       *
       * recovery = 0: אימון מוקל מקטין סטים בכוונה, והערכים שלו אינם
       * מדד ליכולת. זה כתוב בהערת הסכימה של set_logs.
       *
       * השיא נלקח בתוך דרגת הקושי הנוכחית בלבד, כי השוואה בין דרגות אינה
       * תקפה: מי שעלה דרגה רושם פחות חזרות והתקדם.
       *
       * הסינון n >= 4 מוציא תרגילים שנוסו פעם או פעמיים, שאין להם עדיין
       * מה לספר.
       *
       * המיון מציב את עליות הדרגה בראש ואת השיפורים אחריהן. עלייה בדרגת
       * מנח היא הישג גדול יותר מתוספת חזרות.
       */
      {
        sql: `WITH base AS (
                SELECT s.exercise_id, e.name, e.type AS ex_type,
                       s.difficulty_step, s.logged_at,
                       COALESCE(s.reps, s.seconds) AS val
                  FROM set_logs s JOIN exercises e ON e.id = s.exercise_id
                 WHERE s.trainee_id = ? AND s.recovery = 0
                   AND COALESCE(s.reps, s.seconds) IS NOT NULL
              ),
              steps AS (
                SELECT exercise_id, MAX(difficulty_step) AS cur_step, COUNT(*) AS n
                  FROM base GROUP BY exercise_id
              ),
              firsts AS (
                SELECT exercise_id, name, ex_type, val AS first_val,
                       difficulty_step AS first_step,
                       ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY logged_at) AS rn
                  FROM base
              ),
              bests AS (
                SELECT b.exercise_id, MAX(b.val) AS best_val
                  FROM base b
                  JOIN steps t ON t.exercise_id = b.exercise_id
                             AND b.difficulty_step = t.cur_step
                 GROUP BY b.exercise_id
              )
              SELECT f.name, f.ex_type, f.first_val, f.first_step,
                     t.cur_step, x.best_val
                FROM firsts f
                JOIN steps t ON t.exercise_id = f.exercise_id
                JOIN bests x ON x.exercise_id = f.exercise_id
               WHERE f.rn = 1 AND t.n >= 4
               ORDER BY (t.cur_step - f.first_step) DESC, x.best_val DESC`,
        args: [user.id],
      },
    ],
    "read"
  );

  /*
   * מי שלא זז לא מופיע. שורה שאומרת "10 ← 10" היא רעש, וזה נבדק על
   * נתונים אמיתיים: חמישה תרגילים מתוך עשרים וחמישה נפלו לשם.
   */
  const thenNowRows: ThenNowRow[] = thenNow.rows
    .map((r) => ({
      name: String(r.name),
      first: Number(r.first_val ?? 0),
      best: Number(r.best_val ?? 0),
      stepsUp: Number(r.cur_step ?? 0) - Number(r.first_step ?? 0),
      /*
        היחידה נקבעת לפי סוג התרגיל ולא לפי העמודה שבמקרה מלאה.

        סט של תרגיל החזקה נרשם בעמודת השניות, אבל בהיסטוריה יש שורות
        ישנות מלפני שהתצורה תוקנה שבהן הערך יושב בעמודת החזרות. הסקה
        מהעמודה גררה שורה שאומרת "30 חזרות" על תרגיל שנמדד בשניות.

        סוג התרגיל הוא מקור האמת, והוא לא משתנה עם שורה בודדת.
      */
      unit: (String(r.ex_type) === "hold" ? "seconds" : "reps") as
        | "reps"
        | "seconds",
    }))
    .filter((r) => r.stepsUp > 0 || r.best > r.first)
    /*
      סדר לפי כמה השתנה, ולא לפי סוג השינוי.

      המיון הקודם היה לפי דרגות, ולכן כל עליות הדרגה נערמו בראש: שש
      שורות רצופות שאומרות את אותו משפט בדיוק, וזה נקרא כרשימה מכנית.
      השורות החזקות באמת, כמו תרגיל שעלה מ-8 ל-75, נפלו מתחת לחיתוך
      ואיש לא ראה אותן.

      עליית דרגה שווה שתי נקודות, ושיפור במספר שווה את היחס שהשתפר.
      תרגיל שהוכפל פי תשעה עובר עליית דרגה אחת, ושתי דרגות עוברות
      שיפור קטן. התוצאה היא שראש הרשימה מעורבב, וכל שורה בו אומרת
      משהו אחר.
    */
    .sort((a, b) => {
      const score = (r: ThenNowRow) =>
        r.stepsUp * 2 + (r.first > 0 ? r.best / r.first - 1 : 0);
      return score(b) - score(a);
    });

  const workouts = Number(totals.rows[0].workouts ?? 0);
  const harderCount = Number(totals.rows[0].harder ?? 0);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });

  /** התאריך ככותרת של כרטיס יום: 7 באוגוסט 2026. */
  const dayHeading = (iso: string) =>
    new Date(iso).toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jerusalem",
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
      toStep: Number(row.to_step ?? 0),
      dayKey: date(iso),
      heading: dayHeading(iso),
    };
  });

  const recentRows: RecentRow[] = [
    ...recent.rows.map((c) => {
      // אימון שנמשך פחות מדקה הופיע כ"0 דק׳", שנראה כמו תקלה.
      // עיגול לפני הבדיקה, כי 25 שניות מתעגלות לאפס.
      const minutes = c.duration_sec ? Math.round(Number(c.duration_sec) / 60) : 0;
      return {
        id: String(c.id),
        kind: "completed" as const,
        title: c.title ? String(c.title) : "אימון",
        date: date(String(c.completed_at)),
        minutes: minutes >= 1 ? minutes : null,
        mood: c.mood ? LEGACY_MOODS[String(c.mood).toLowerCase()] ?? null : null,
        sortKey: String(c.completed_at),
      };
    }),
    ...abandoned.rows.map((row) => ({
      id: String(row.id),
      kind: "abandoned" as const,
      title: "אימון שלא הסתיים",
      date: date(`${String(row.started_day)}T12:00:00`),
      minutes: null,
      mood: null,
      sortKey: `${String(row.started_day)}T12:00:00`,
    })),
  ]
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, 15)
    .map(({ sortKey: _sortKey, ...row }) => row);

  /*
   * "הדרך" מציירת את מה שבאמת נחשב התקדמות כאן: מעבר בין שלוש הרמות.
   * התוכניות שהושלמו יושבות מתחת לרמה שלהן, ולכן שם הרמה כבר לא חוזר
   * בשורת התוכנית.
   */
  const currentLevel = activeLevel.rows[0]
    ? Number(activeLevel.rows[0].level)
    : null;

  /*
   * הדרך נעצרת ברמה שהמתאמן עומד בה.
   *
   * קודם הוצגו תמיד שלוש הרמות, ושתי הרמות שמעליו ישבו דהויות וריקות
   * כדי לומר שאין בהן כלום. מתאמן שקרא את המסך אמר שברמה שלו לא רשום
   * שום דבר בזמן שברמה שמתחתיה רשום הכל, וזה בדיוק מה שקורה כשמציגים
   * מדף ריק לצד מדף מלא: העין קוראת את הריק כחסר ולא כעתידי.
   *
   * מה שנשאר הוא איפה הוא היה ואיפה הוא עכשיו. לאן ממשיכים מכאן זה מה
   * שהמדריך אומר, וזה לא תפקידה של לשונית ההישגים.
   */
  const journey = [1, 2, 3]
    .filter((level) => currentLevel == null || level <= currentLevel)
    .map((level) => ({
      level,
      name: programLevelName(level),
      programs: programs.rows.filter((row) => Number(row.level) === level),
    }));

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      {/* אותו זוהר כמו במסך המדריך, כדי ששני המסכים ידברו באותה שפה. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_50%_4%,rgba(180,133,79,.2),transparent_58%)]" />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
        {/* שפת הכותרות של המסכים: שחור שמן, מילה בזהב, קו דוהה. */}
        <div className="mb-1 flex items-center gap-3">
          <h1 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
            ההישגים <span className="wood-text">שלך</span>
          </h1>
          <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
        </div>

        {workouts === 0 && recentRows.length === 0 ? (
          /*
           * מסך פתיחה למי שעוד לא התאמן, עם מועד פירעון קרוב.
           * "מה ייאסף כאן" לבדו משאיר מסך ריק בלי להגיד מתי הוא יפסיק
           * להיות ריק, וזה בדיוק המסך שנפסל. אחרי אימון אחד כבר יש כאן
           * נקודה בלוח ומונה שזז.
           */
          <div className="glass rounded-3xl px-6 py-14 text-center">
            <div className="mb-4 flex items-end justify-center" aria-hidden="true">
              <FitayIcon name="ring" size={64} />
            </div>
            <p className="mb-2 text-lg font-bold">האימון הראשון שלך יופיע כאן</p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
              כאן נאספים האימונים שהושלמו, התרגילים שעלו דרגה והתוכניות
              שנסגרו. אחרי האימון הראשון המסך הזה מתחיל להתמלא.
            </p>
          </div>
        ) : (
          <>
            {/*
              הגיבור של הלשונית, בשפת כרטיס האימון במסך הבית: לוח אטום
              עם צל, טבעת שיוצאת מהמסגרת, ומספר ענק בשתי שורות.

              קודם זה היה כרטיס זכוכית ממורכז עם אייקון קטן באמצע ומונה
              שני בשורה ממוסגרת מתחתיו. הוא לא נשא כלום: מרכוז מחליש,
              זכוכית על שחור כמעט לא נראית, ושני מונים באותו כרטיס אמרו
              שאין כאן דבר אחד חשוב. עכשיו יש מספר אחד, וההקשיות הן שורת
              תמיכה בתוך אותו משפט ולא מונה מתחרה.
            */}
            {/*
              המספר יושב על לוח עץ.

              שלוש גרסאות עמדו כאן. הראשונה הייתה לוח אטום ניטרלי, והמספר
              מילא ממנו כעשירית: קופסה שרוב שטחה ריק מדללת את מה שבתוכה
              במקום לתת לו נוכחות. השנייה הורידה את הקופסה לגמרי והשאירה
              את הספרה על הדף השחור.

              השנייה נכשלה מסיבה שנראתה רק כשכל הלשונית התנקתה: שלוש
              הלשוניות האחרות בנויות על חומר. בבית יש כרטיס צילום, במדריך
              לוח עץ, במתקנים לוח צילום. הישגים נשארה היחידה שהיא טקסט על
              שחור, ולכן היא לא נקראה כחלק מאותה אפליקציה.

              מה שנפסל היה המלבן הניטרלי ולא המשטח. הפתרון הוא החומר של
              FITAY ולא היעדר חומר, וזה אותו guide-wood.jpg בדיוק של כרטיס
              הדגשים במדריך, על כל שכבותיו. זהב על עץ הוא שלט הישג, וזה מה
              שהמקטע הזה אומר.

              בלי תמונה חמישית לאפליקציה. הכלל שנשאר הוא שתמונה נכנסת למסך
              שיש בה מה לזהות, וכאן אין טבעות לזהות, יש מספר.
            */}
            <section
              className="relative mb-9 overflow-hidden rounded-[2rem] px-6 py-9 text-center"
              style={{
                backgroundImage: "var(--guide-wood-veil), url('/guide-wood.jpg')",
                backgroundBlendMode: "normal, color",
                backgroundSize: "cover",
                backgroundPosition: "center",
                border: "2px solid var(--wood-border-light)",
                /*
                  בלי צל טקסט ובלי צבע כפוי.

                  הצעיף של העץ הוא הכהיה במצב הכהה ושטיפה לבנה של 74
                  אחוז במצב הבהיר, כלומר המשטח מתהפך יחד עם הערכה. טקסט
                  שיורש את צבע הטקסט הרגיל מתהפך איתו, וטקסט שנצבע ידנית
                  בגוון בהיר נעלם לגמרי על עץ בהיר. זה מה שקרה כאן.

                  זו גם הסיבה שכרטיס הדגשים במדריך עובד בשני המצבים על
                  אותו משטח בדיוק: הוא לא צובע כלום.
                */
              }}
            >
              {/*
                ממורכז. הכתב בעמוד הזה מיושר לימין כמו כל טקסט עברי, וזה
                נכון לשורות. לוח עם ספרה אחת הוא לא שורה, הוא שלט, וספרה
                שנדחקת לצד אחד שלו נראית כאילו היא נשארה שם במקרה.
              */}
              {/*
                סימן המים של הטבעות ירד מכאן.

                הוא נשען על קצה של כרטיס: שני עיגולים ששלושת רבעי מהם
                מחוץ למסגרת, וההצטלבות שנשארת בפנים היא מה שנקרא כטבעות.
                ברגע שהכרטיס ירד הוא נחתך על ידי מקטע בגובה הטקסט בלבד,
                ומה שנשאר על המסך היה כתם שנראה כמו ספרה שבורה.

                וממילא הטבעות באפליקציה הזאת הן צילום עכשיו, בכל ארבע
                הלשוניות. שני עיגולים מצוירים בגבול של ארבעה עשר פיקסלים
                הם הדבר החלש ביותר שיכול לייצג אותן.
              */}
              {/*
                מספר אחד ומילה אחת.

                גרסה קודמת נתנה את המספר בשחור ואת המילה "אימונים" בזהב
                ובגודל כמעט זהה, וזה הפך את היחס: העין קראה קודם את היחידה
                ורק אחר כך את ההישג. במסך הבית שתי שורות באותו גודל עובדות
                כי הן משפט אחד, "אימון 8 מתוך 24". כאן זה לא משפט אלא נתון,
                ובנתון המספר הוא הכל והמילה היא תווית.

                "מה שהצטבר" ושורת ההקשיות ירדו: הראשונה חזרה על כותרת
                העמוד שמעליה, והשנייה על כותרת המקטע שמתחת.
              */}
              {/*
                text-7xl ולא ערך חופשי. text-[4.5rem] נמדד בפועל כ-16
                פיקסלים על השרת המקומי בזמן שהמחלקות שלצידו כן תפסו,
                והמחלקה הסטנדרטית היא אותם 72 פיקסלים בלי ההימור.
              */}
              {/*
                בלי דריסת גובה שורה. text-7xl מגיע עם גובה שורה של 1,
                וכיווץ ל-0.85 עשה את תיבת השורה נמוכה מהספרה עצמה — הכרטיס
                הוא overflow-hidden בשביל הטבעת שברקע, ולכן הוא חתך את
                תחתית המספר.
              */}
              {/*
                בלי wood-text. הגרדיאנט שלו בנוי להיקרא על רקע כהה ואחיד,
                ועל משטח עץ הוא נבלע בו: אותם גוונים בדיוק, זה על גבי זה.
                צבע הטקסט הרגיל מתהפך עם הערכה ולכן הוא נכון בשני המצבים.
              */}
              <p className="relative text-7xl font-black tracking-[-.055em] tabular-nums">
                {workouts}
              </p>
              {/*
                התווית נושאת את ההיקף. "אימונים" לבד הופיע במסך הזה
                בשלושה מובנים שונים — הכל, תוכנית אחת, וחודש — ואי אפשר
                היה לדעת איזה מספר מדבר על מה.
              */}
              <p
                className="relative mt-3 text-base font-bold"
                style={{ color: "var(--dim)" }}
              >
                אימונים מאז שהתחלת
              </p>
            </section>

            {/*
              אז והיום עומד ראשון, מיד אחרי הלוח.

              זה המקטע היחיד בלשונית שעונה על "איפה אני עומד". כל השאר
              עונה על "מה עשיתי", וזו שאלה שאיש לא פותח את הלשונית הזאת
              בשבילה. הוא נבנה משורות עם קו מפריד דק, כמו כל רשימה כאן,
              ובלי שום דבר שלא קיים כבר במסך אחר.
            */}
            {thenNowRows.length > 0 && (
              <>
                <SectionTitle title="אז" accent="והיום" />
                <ThenAndNow rows={thenNowRows} />
              </>
            )}

            <SectionTitle title="הדרך" accent="שלך" />
            {/*
              סימן המים של מספר הרמה ירד. בשבע אחוזי אטימות הוא פשוט לא
              נראה על הרקע הכהה, כלומר קוד שלא עושה כלום.
            */}
            {/*
              בלי כרטיס. שלושת מקטעי התיעוד בלשונית הזאת כבר יושבים
              כשורות על הדף עם קו מפריד דק, וזה היה הרביעי שעטוף בזכוכית.
              ארבעה מלבנים זהים אחד מתחת לשני הם מה שאביב מזהה כברירת
              מחדל של ערכת ממשק, וכאן זה היה המבנה של כל הלשונית.
            */}
            <div>
              <div>
              {journey.map((step, i) => {
                const current = currentLevel === step.level;
                const done = step.programs.length > 0;
                return (
                  /*
                   * בלי קו מקשר בין הרמות. ציר זמן עם קו אנכי הוא בדיוק
                   * הדפוס שאביב סימן כגנרי, והתגים לבדם כבר מספרים סדר.
                   */
                  <div
                    key={step.level}
                    className={i > 0 ? "mt-4 pt-4" : ""}
                    style={{ borderTop: i > 0 ? "1px solid var(--line)" : "none" }}
                  >
                    <div className="flex items-center gap-3">
                      <JourneyBadge
                        level={step.level}
                        state={current ? "current" : done ? "done" : "future"}
                      />
                      {current ? (
                        <>
                          <span className="font-bold">{step.name}</span>
                          <span
                            /*
                              בלי מסגרת ובלי מילוי.

                              ההנמקה שעמדה כאן הייתה "אותה חתימה כמו תגי
                              ההקשיות", ותגי ההקשיות כבר לא קיימים: הם
                              הפכו לשורות עם קו מפריד. זה נשאר התג הבודד
                              בלשונית, ואחרי שהעיגולים ירדו מהמספרים הוא
                              נשאר הדבר היחיד בקופסה.

                              זו אותה כותרת קטנה של "האימון של היום"
                              בשורת העץ במסך הבית, ובאותה מידה בדיוק. שם
                              היא אומרת "זה שלך", וכאן אותו דבר.
                            */
                            className="text-[11px] font-black tracking-[.12em]"
                            style={{ color: "var(--wood-1)" }}
                          >
                            הרמה שלך
                          </span>
                        </>
                      ) : (
                        <span
                          className="font-semibold"
                          style={done ? undefined : { color: "var(--faint)" }}
                        >
                          {step.name}
                        </span>
                      )}
                    </div>

                    {step.programs.map((program, j) => (
                      <div
                        key={String(program.id)}
                        className="ps-10 py-2"
                        style={{
                          borderTop: j === 0 ? "none" : "1px solid var(--line)",
                        }}
                      >
                        <p className="truncate text-sm font-semibold">
                          {String(program.title)}
                        </p>
                        {/* התאריך מבדיל בין ריצות חוזרות של אותה תוכנית. */}
                        {/* משפט ולא ספרה: המספר הזה סופר תוכנית אחת, לא הכל. */}
                        <p className="text-xs" style={{ color: "var(--dim)" }}>
                          הושלמה אחרי {String(program.completed)} אימונים
                          {program.completed_at
                            ? ` · ${date(String(program.completed_at))}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
              </div>
            </div>

            {/*
              יומן וחודש הם תיעוד, לא הישג. שלוש כותרות ענק ברצף אמרו
              שהכל שווה במשקלו; עכשיו ההישגים צועקים והתיעוד תומך.
            */}
            {/*
              ההוכחה הקונקרטית שהגוף התחזק, בשמות של תרגילים אמיתיים.
              היא שייכת לחלק ההישגים ולא למיכל התיעוד: מתאמן שרוצה לדעת
              מה השתנה בו קורא כאן, לא בלוח הנוכחות.
            */}
            <div>
              <SectionTitle title="תרגילים" accent="שעלו דרגה" />
            </div>
            {hardenings.length === 0 ? (
              /*
                שורה ולא כרטיס.

                משפט אחד שאומר שאין עדיין כלום ישב בכרטיס זכוכית ממורכז
                בגובה שמונה יחידות ריפוד, כלומר המקטע הריק תפס יותר מקום
                מהמקטע המלא שמעליו. מצב ריק צריך להיות שקט.

                גם המרכוז ירד. כל שאר השורות בלשונית מיושרות לימין, ורק
                זו הייתה באמצע.
              */
              <p className="text-sm leading-6" style={{ color: "var(--dim)" }}>
                התרגיל הראשון שיעלה דרגה יופיע כאן. זה קורה כשמגיעים ליעד.
              </p>
            ) : (
              <HardenedDays rows={hardenings} />
            )}

            {/*
              מיכל היומן: הלוח ורשימת האימונים, תיעוד נוכחות.

              חשוב שיהיה, אסור שיתחרה. מיכל אחד שקט, קו דק בין שני
              המקטעים, וכותרות שקטות. כותרת "החודש" ירדה כי שם החודש
              כתוב ממילא בתוך הלוח.
            */}
            {/*
              המיכל עצמו ירד, והוא היה האחרון.

              ההנמקה שעמדה כאן, "מיכל אחד שקט", הייתה נכונה כשסביבו היו
              עוד שלושה כרטיסים והוא היה הרביעי. עכשיו כל השאר יושב על
              הדף, והוא נשאר המלבן היחיד בלשונית, כלומר בדיוק מה שהוא
              היה אמור לא להיות: מתחרה.

              הקו הדק בין הלוח לרשימת האימונים נשאר. הוא זה שמפריד בין
              שני מקטעי התיעוד, לא המסגרת.
            */}
            {/*
              בלי מיכל ובלי מרווחים משלו.

              שני המקטעים האלה ישבו בתוך עטיפה עם מרווח עליון ועם קו
              הפרדה ביניהם. מרגע שכל כותרת מביאה גבול משלה, השניים
              נערמו: שני קווים אחד מתחת לשני עם חלל ביניהם, וזה נראה
              כתקלה ולא כהפרדה.
            */}
            <div>
              {/*
                ללוח יש כותרת משלו.

                כשהוא ישב בתוך מיכל, המסגרת אמרה איפה הוא מתחיל. אחרי
                שהמיכל ירד הוא פשוט הופיע באמצע העמוד בלי שום דבר שאומר
                מה זה, ומתאמן שקרא את המסך אמר בדיוק את זה. שם החודש
                שכתוב בתוכו אומר איזה חודש, לא מה הלוח הזה מציג.

                ההנמקה הישנה, "כותרת החודש ירדה כי שם החודש כתוב ממילא
                בפנים", הייתה נכונה כשהייתה מסגרת. בלי מסגרת אין לה על מה
                לעמוד.
              */}
              <SectionTitle title="ימי" accent="האימון" />
              <div className="pb-6">
                <AchievementsCalendar
                  completedAt={calendar.rows.map((row) => String(row.completed_at))}
                />
              </div>

              <div>
                <SectionTitle title="אימונים" accent="אחרונים" />
                <RecentWorkouts rows={recentRows} />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}


/**
 * התג של רמה במקטע "הדרך". שלושה מצבים באותה צורה בדיוק, ורק המילוי
 * משתנה: רמה שהושלמה מקבלת את תג המותג השקוף עם וי, הרמה הנוכחית מקבלת
 * מילוי מלא, ורמה שעוד לא נפתחה נשארת דהויה. אין מנעול ואין הסבר מה חסר,
 * כי הלשונית הזאת מתעדת את מה שכבר נעשה.
 */
function JourneyBadge({
  level,
  state,
}: {
  level: number;
  state: "done" | "current" | "future";
}) {
  /*
    ספרה ולא תג.

    כאן ישבה ספרה קטנה בתוך ריבוע ממוסגר, וברמות שכבר הושלמו היא הוחלפה
    ב-"✓" — תו מקלדת בתפקיד אייקון, בדיוק הדפוס שהוסר משורות האימונים
    האחרונים באותה לשונית וממסך האימון. עכשיו זו אותה ספרה גדולה בגוון
    העץ שיש בכל שאר האפליקציה, ואטימות היא מה שמבדיל בין שלוש המדרגות.

    הסימון של רמה שהושלמה עבר לתוכן: התוכניות שלה מופיעות מתחתיה ממילא,
    והתג "הרמה שלך" אומר איפה עומדים. שני סימנים לאותו דבר הם אחד יותר
    מדי.
  */
  const style =
    state === "current"
      ? { color: "var(--wood-1)", opacity: 1 }
      : state === "done"
        ? { color: "var(--wood-1)", opacity: 0.5 }
        : { color: "var(--wood-1)", opacity: 0.24 };

  return (
    <span
      className="w-7 shrink-0 select-none text-center text-[1.6rem] font-black leading-none tabular-nums"
      style={style}
      aria-hidden="true"
    >
      {level}
    </span>
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
  accent,
  hint,
  tone = "loud",
}: {
  title: string;
  /** המילה הצבועה בעץ, כמו "שלי" ב"התוכניות שלי". שפת הכותרות של המדריך והבית. */
  accent?: string;
  hint?: string;
  tone?: "loud" | "quiet";
}) {
  /*
    משקל אחד לכל הכותרות במסך.

    היו כאן שלוש חתימות שונות: אחת גדולה עם מילה בעץ, אחת גדולה לבנה
    לגמרי, ואחת קטנה ואפורה. מתאמן שקרא את המסך אמר שכל כותרת נראית
    אחרת ושהוא לא ידע על מה לשים את העין, וזה בדיוק מה שקורה כשהחתימה
    משתנה בין מקטע למקטע: היא מפסיקה לסמן היררכיה ומתחילה לסמן רעש.

    הגרסה השקטה ירדה. היא נועדה לומר שהתיעוד בתחתית הוא זנב, אבל הסדר
    בעמוד כבר אומר את זה, וכותרת אפורה קטנה בין כותרות ענק נקראה כשגיאה.
  */
  void tone;
  return (
    /*
      גבול עליון לכל מקטע.

      מתאמן שקרא את המסך אמר שאין גבולות בין דבר לדבר ושזה נקרא כדוח.
      זה היה מדויק: אחרי שכל הקופסאות ירדו, מה שהפריד בין מקטע למקטע
      היה מרווח בלבד, ומרווח לבדו לא נקרא כגבול כשמתחתיו יושבות שורות
      שגם ביניהן יש מרווח.

      קו דק לרוחב מלא הוא אותו סימן שכבר מפריד בין שורה לשורה בכל
      הרשימות כאן, בקנה מידה של מקטע. הוא לא מחזיר מסגרת ולא מחזיר
      קופסה: הוא קו אחד, ובדיוק זה שכבר בשימוש.

      pt גדול מ-mt בכוונה. הקו צמוד למה שמעליו ופתוח למה שמתחתיו, וכך
      הוא נקרא כפתיחה של מקטע ולא כסגירה של הקודם.
    */
    <div
      /* mt-9 ו-pt-6: הגרסה הקודמת הייתה 12 ו-8, ובטלפון זה יצא שמונים
         פיקסלים ריקים מעל כל כותרת. גבול צריך להפריד, לא לרוקן. */
      className="mb-3 mt-9 pt-6"
      style={{ borderTop: "1px solid var(--wood-border)" }}
    >
      <div className="flex items-center gap-3">
        <h2 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
          {title}
          {accent && <> <span className="wood-text">{accent}</span></>}
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
