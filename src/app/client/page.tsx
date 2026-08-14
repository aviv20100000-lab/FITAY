import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import LevelRequest from "@/components/LevelRequest";
import ProgramSetup from "@/components/ProgramSetup";
import LockedWorkoutCard from "@/components/LockedWorkoutCard";
import RepeatRequest from "@/components/RepeatRequest";
import { programLevelName } from "@/lib/program-levels";
import { getLevelCheckState } from "@/lib/level-check";
import { isRecoverySession } from "@/lib/progression";
import { getTrainingDayWindow } from "@/lib/training-days";
import WeekStrip from "@/components/WeekStrip";
import GateAction from "@/components/GateAction";
import { Bidi } from "@/components/Bidi";

function israelDayNumber(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
}

/**
 * בחירת אימון חורג חיה בכתובת ולא במסד.
 *
 * ברוב הזמן האפליקציה מסובבת בין אימוני השלב לבד, וזה מה שמופיע בשער.
 * לפעמים מתאמן רוצה לחזור על אותו אימון, ואז הוא בוחר אותו מהרשימה
 * למטה. הבחירה נטענת חזרה כפרמטר בכתובת, השרת מאמת אותה ומרכיב את
 * השער סביבה.
 *
 * למה לא בשרת: אין כאן העדפה קבועה. מתאמן שבוחר אימון אחר רוצה לעשות
 * אותו עכשיו, ובחירה שנשמרת במסד הופכת לבחירה נשכחת שממתינה לו בשקט
 * שבוע אחר כך. בכתובת היא חיה כל עוד המסך פתוח ומתאפסת מעצמה.
 *
 * ומה שאיתי רואה הוא האימון שבוצע, לא הכוונה. בחירה שלא הפכה לאימון
 * אינה אומרת לו כלום.
 */
export default async function ClientHome({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const pickedParam = (await searchParams).do;
  const picked = typeof pickedParam === "string" ? pickedParam : null;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  // ספירת האימונים הכוללת ירדה מראש המסך יחד עם כרטיס הברכה, ולכן גם
  // השאילתה שספרה אותה ירדה. המספר חי בלשונית ההישגים, שם הוא הכרטיס הראשי.
  const [
    programs,
    workouts,
    perWorkout,
    recentOrder,
    repeatRequests,
    openRequests,
    coachRow,
  ] =
    await db.batch([
    {
      sql: `SELECT p.id, p.title, p.level, p.weeks,
                   a.sessions_per_week, a.target_sessions,
                   (SELECT COUNT(*) FROM completions c
                     WHERE c.trainee_id = a.trainee_id
                       AND c.program_id = a.program_id
                       AND c.completed_at >= a.assigned_at) AS completed
              FROM assignments a JOIN programs p ON p.id = a.program_id
             WHERE a.trainee_id = ? AND a.status = 'active'
             ORDER BY a.assigned_at`,
      args: [user.id],
    },
    {
      sql: `SELECT w.id, w.title, w.phase, w.program_id,
                   (SELECT COUNT(*) FROM workout_items i WHERE i.workout_id = w.id) AS items
              FROM workouts w
             WHERE w.program_id IN (
               SELECT program_id FROM assignments WHERE trainee_id = ? AND status = 'active'
             )
             ORDER BY w.phase, w.position`,
      args: [user.id],
    },
    // כמה פעמים בוצע כל אימון ומתי לאחרונה — כדי לדעת מה הבא בתור.
    {
      sql: `SELECT c.workout_id, COUNT(*) AS times, MAX(c.completed_at) AS last
              FROM completions c
              JOIN assignments a
                ON a.trainee_id = c.trainee_id
               AND a.program_id = c.program_id
               AND a.status = 'active'
             WHERE c.trainee_id = ? AND c.completed_at >= a.assigned_at
             GROUP BY c.workout_id`,
      args: [user.id],
    },
    /*
      סדר הביצוע, מהאחרון לראשון. צריך אותו בשביל הכלל של איתי: אפשר
      לחזור על אותו אימון פעמיים ברצף, ובפעם השלישית הוא נעול.
      השאילתה שמעליה סופרת כמה פעמים בסך הכל, וזה לא אותו דבר: מתאמן
      שעשה משיכה, דחיפה, משיכה עומד על שתי משיכות בסך הכל ואף פעם לא
      חזר על עצמו.
    */
    {
      sql: `SELECT c.program_id, c.workout_id, c.completed_at
              FROM completions c
              JOIN assignments a
                ON a.trainee_id = c.trainee_id
               AND a.program_id = c.program_id
               AND a.status = 'active'
             WHERE c.trainee_id = ? AND c.completed_at >= a.assigned_at
             ORDER BY c.completed_at DESC`,
      args: [user.id],
    },
    // בקשות לחזור על אימון: הממתינות כדי לא להציע לבקש פעמיים, והמאושרות
    // כדי לדעת אילו נעילות נפתחו.
    {
      sql: `SELECT workout_id, status, decided_at FROM repeat_requests
             WHERE trainee_id = ? AND status IN ('pending','approved')`,
      args: [user.id],
    },
    // בקשות מעבר רמה שעדיין ממתינות, כדי לא להציע לבקש פעמיים.
    {
      sql: "SELECT from_program_id FROM level_requests WHERE trainee_id = ? AND status = ?",
      args: [user.id, "pending"],
    },
    // התוכניות שהסתיימו ירדו מכאן ועברו ללשונית ההישגים. הבית עונה על
    // מה עושים היום, והן תיעוד של מה שכבר נעשה.
    {
      sql: "SELECT phone FROM users WHERE role = 'coach' AND active = 1 LIMIT 1",
      args: [],
    },
  ], "read");

  /*
   * מצב בדיקת הרמה נשלף דרך אותה פונקציה שהשרת בודק לפיה, ולא בשאילתה
   * נפרדת כאן. שתי גרסאות של הכלל "אילו ארבעה תרגילים" נגמרות במסך שמציג
   * תרגיל אחד ובשרת שדורש אחר.
   *
   * רק לתוכניות שכבר הושלמו. לפני זה אין מה לצלם, ואין סיבה לשלם על סבב
   * רשת נוסף בכל טעינה של מסך הבית.
   */
  const finishedPrograms = programs.rows.filter(
    (p) =>
      Number(p.completed ?? 0) >= Number(p.target_sessions ?? 24)
  );
  const levelStates = new Map(
    await Promise.all(
      finishedPrograms.map(
        async (p) =>
          [String(p.id), await getLevelCheckState(user.id, String(p.id))] as const
      )
    )
  );

  // ההערה של איתי כשהוא החזיר לצילום מחדש. הבקשה עצמה כבר לא 'pending',
  // ולכן היא לא נספרת כבקשה פתוחה ולא חוסמת שליחה חדשה.
  const returnedNotes = new Map(
    (
      await db.execute({
        sql: `SELECT from_program_id, coach_note FROM level_requests
               WHERE trainee_id = ? AND status = 'returned'`,
        args: [user.id],
      })
    ).rows.map((r) => [String(r.from_program_id), String(r.coach_note ?? "")])
  );

  const trainingDays = await getTrainingDayWindow(user.id);

  const pendingLevel = new Set(
    openRequests.rows.map((r) => String(r.from_program_id))
  );

  const history = new Map(
    perWorkout.rows.map((r) => [
      String(r.workout_id),
      { times: Number(r.times), last: String(r.last) },
    ])
  );

  /**
   * האימון הבא: זה שבוצע הכי מעט פעמים, ובשוויון — הראשון בסדר התוכנית.
   * ככה הרוטציה מתקדמת לבד בלי לנהל לוח שנה.
   *
   * לכל תוכנית משלה. קודם זה חושב על כל האימונים של כל התוכניות הפעילות
   * יחד, ולכן למתאמן עם שתי תוכניות רק אחת מהן קיבלה תג "הבא בתור",
   * והשנייה נראתה כאילו אין בה מה לעשות.
   */
  const nextWorkoutByProgram = new Map<string, string>();
  for (const w of workouts.rows) {
    const programId = String(w.program_id);
    const best = nextWorkoutByProgram.get(programId);
    if (best == null) {
      nextWorkoutByProgram.set(programId, String(w.id));
      continue;
    }
    const times = history.get(String(w.id))?.times ?? 0;
    const bestTimes = history.get(best)?.times ?? 0;
    if (times < bestTimes) nextWorkoutByProgram.set(programId, String(w.id));
  }

  /*
   * מתי בוצע לאחרונה.
   *
   * "לאחרונה" אינו קישוט. השורה הזאת יושבת מתחת לכותרת "האימון של היום"
   * של אימון אחר, ו"בוצע 4 פעמים · היום" נקרא שם כאילו זה האימון של
   * היום. אותה מילה, משמעות הפוכה, שתי שורות זו מזו.
   */
  const daysSince = (iso: string) => {
    const days = israelDayNumber(new Date()) - israelDayNumber(new Date(iso));
    if (days <= 0) return "לאחרונה היום";
    if (days === 1) return "לאחרונה אתמול";
    return `לאחרונה לפני ${days} ימים`;
  };

  /**
   * השער — הבלוק הראשי במסך הבית.
   *
   * למה הוא קיים: עד עכשיו הדרך היחידה להתחיל אימון הייתה שורה בתוך רשימה
   * של 24, בתוך כרטיס התוכנית, מתחת לקיפול. לאפליקציה שכל תכליתה להתאמן
   * לא הייתה פעולה ראשית, ומתאמנים דיווחו שלא ברור מאיפה מתחילים.
   *
   * הוא לוקח את התוכנית הראשונה שיש בה אימון פתוח בפועל. תוכנית בלי קצב
   * אימונים ותוכנית שהושלמה נופלות החוצה, כי בשתיהן אין מה לפתוח והשער
   * היה מציג כפתור מת. במצבים האלה המסך ממשיך להציג את מה שהוא הציג תמיד:
   * בחירת קצב, או בקשת בדיקת רמה.
   */
  /**
   * הכלל של איתי: מותר לחזור על אותו אימון פעמיים ברצף, לא שלוש.
   *
   * נבדק על שני הביצועים האחרונים בתוכנית ולא על ספירה כוללת. מתאמן
   * שעשה משיכה, דחיפה, משיכה עומד על שתי משיכות בסך הכל ומעולם לא חזר
   * על עצמו, וספירה הייתה נועלת אותו בלי סיבה.
   */
  const repeatBlocked = new Map<string, Set<string>>();
  {
    /*
      שני כללים, ושניהם נבדקים על אותו רצף ביצוע.

      הראשון: אין שלוש פעמים ברצף. אם שני הביצועים האחרונים הם אותו
      אימון, הוא נעול עכשיו.

      השני: לכל אימון מגיעה כפילה אחת בתוכנית. ברגע שאימון כבר בוצע
      פעמיים ברצף אי פעם בתוכנית הזאת, הוא לא ייכפל בה שוב, גם אם
      עברו מאז עשרה אימונים אחרים.

      השני מכיל את הראשון ברוב המקרים, ובכל זאת שניהם כאן: הראשון הוא
      מה שקורה בזמן אמת, והשני הוא מה שנשאר נעול עד סוף התוכנית.

      הרצף מגיע מהחדש לישן, ולכן זוג סמוך ברשימה הוא זוג סמוך בזמן.
    */
    const sequence = new Map<string, { id: string; at: string }[]>();
    for (const r of recentOrder.rows) {
      const programId = String(r.program_id);
      const list = sequence.get(programId) ?? [];
      list.push({ id: String(r.workout_id), at: String(r.completed_at) });
      sequence.set(programId, list);
    }

    /*
      אישור מאיתי שווה כפילה אחת נוספת, לא היתר פתוח.

      הוא נצרך ברגע שהאימון בוצע שוב פעמיים ברצף אחרי שהאישור ניתן, ולכן
      מה שנשמר במסד הוא רק ההחלטה והזמן שלה. אין דגל "נוצל": דגל כזה הוא
      מקור אמת שני לאותה עובדה, והשניים נפרדים ביום שבו ביצוע נמחק.
    */
    const approvedAt = new Map<string, string>();
    for (const r of repeatRequests.rows) {
      if (String(r.status) !== "approved") continue;
      const at = String(r.decided_at ?? "");
      if (!at) continue;
      const key = String(r.workout_id);
      const best = approvedAt.get(key);
      if (!best || at > best) approvedAt.set(key, at);
    }

    for (const [programId, list] of sequence) {
      const locked = new Set<string>();
      for (let i = 0; i + 1 < list.length; i += 1) {
        if (list[i].id !== list[i + 1].id) continue;
        const id = list[i].id;
        // הכפילה תוארכת לפי הביצוע המאוחר מבין השניים.
        const at = list[i].at;
        const approved = approvedAt.get(id);
        // כפילה שקרתה אחרי האישור צרכה אותו, ולכן היא נועלת שוב.
        if (approved && at <= approved) continue;
        locked.add(id);
      }
      if (locked.size > 0) repeatBlocked.set(programId, locked);
    }
  }

  /** אימונים שכבר יש עליהם בקשה פתוחה, כדי לא להציע לבקש פעמיים. */
  const repeatPending = new Set(
    repeatRequests.rows
      .filter((r) => String(r.status) === "pending")
      .map((r) => String(r.workout_id))
  );

  /**
   * מה שהשער יפתח בפועל: מה שהמתאמן בחר, ואם לא בחר אז מה שהרוטציה
   * הציעה. הבחירה עוברת אימות מלא כאן ולא נסמכת על הכתובת: היא חייבת
   * להיות אימון קיים בתוכנית פעילה, והיא נופלת אם הוא נעול בכלל
   * החזרה. כתובת היא קלט של המשתמש כמו כל קלט אחר.
   */
  const chosenByProgram = new Map<string, string>();
  if (picked) {
    const row = workouts.rows.find((w) => String(w.id) === picked);
    if (row) {
      const programId = String(row.program_id);
      if (!repeatBlocked.get(programId)?.has(picked)) {
        chosenByProgram.set(programId, picked);
      }
    }
  }

  const activeWorkoutByProgram = new Map<string, string>();
  for (const p of programs.rows) {
    const programId = String(p.id);
    const id =
      chosenByProgram.get(programId) ?? nextWorkoutByProgram.get(programId);
    if (id) activeWorkoutByProgram.set(programId, id);
  }

  const gate = (() => {
    for (const p of programs.rows) {
      const sessionsPerWeek =
        p.sessions_per_week == null ? null : Number(p.sessions_per_week);
      if (sessionsPerWeek == null) continue;
      const completed = Number(p.completed ?? 0);
      const target = Number(p.target_sessions ?? 24);
      if (completed >= target) continue;
      const nextId = activeWorkoutByProgram.get(String(p.id));
      if (!nextId) continue;
      const row = workouts.rows.find((w) => String(w.id) === nextId);
      if (!row) continue;
      const level = Number(p.level);
      return {
        workoutId: nextId,
        href: `/client/workout/${nextId}`,
        /*
          שם האימון, ורק כשהמתאמן בחר אותו בעצמו.

          בלי זה הבחירה נגמרת באמונה: הוא לוחץ על משיכה בתחתית העמוד,
          עולה למעלה, ורואה בדיוק את אותו "אימון 12 מתוך 24" שהיה שם
          קודם. הדבר היחיד שהשתנה בשער הוא מספר התרגילים, מ-7 ל-8, ואף
          אחד לא קורא את זה כאישור.

          מי שלא בחר מקבל את מה שהוצע לו ממילא, ואצלו השם היה מוסיף
          שורה שלא עונה על שום שאלה.
        */
        title: chosenByProgram.get(String(p.id)) === nextId
          ? String(row.title)
          : null,
        // כותרת: "רמה 2" כשיש רמה מספרית, ואחרת שם התוכנית עצמה — תוכנית
        // אישית לא יושבת על הסולם ואין לה מספר להציג.
        where: Number.isFinite(level) && level > 0 ? `רמה ${level}` : String(p.title),
        number: completed + 1,
        target,
        items: Number(row.items ?? 0),
        recovery: isRecoverySession(completed),
      };
    }
    return null;
  })();

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      {/* הלוגו וכפתור היציאה במעטפת, כדי שיופיעו בכל הלשוניות */}
      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
        {/*
          הברכה מבודדת, ולא צמודה לשער.

          קודם עמד כאן לוח מלא עם שני מספרים, והוא דחף את הפעולה היחידה של
          המסך מתחת לקיפול. המספרים ירדו — הם הישגים ויש להם לשונית משלהם.
          הברכה נשארה, אבל עם אוויר משני הצדדים: כשהיא הייתה צמודה היא
          נראתה כאילו היא נדחסת לתוך הכרטיס הראשון.
        */}

        {gate && (
          <section className="mb-8">
            {/* אותה כותרת דו-גונית עם קו דוהה שיש לכל סקציה באפליקציה.
                היא ההקשר — איפה אתה בסולם — והלוח מתחתיה הוא מה שקורה עכשיו. */}
            <div className="mb-3.5 flex items-center gap-3">
              <h2 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.03em]">
                עכשיו <span className="wood-text">ב{gate.where}</span>
              </h2>
              <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
            </div>

            <Link
              href={gate.href}
              className="block overflow-hidden rounded-[2rem] border border-[var(--border-1)] transition active:scale-[.99]"
              style={{ background: "var(--panel)", boxShadow: "var(--panel-shadow)" }}
            >
              {/*
                צילום ולא טבעת מצוירת.

                הטבעת שהייתה כאן מילאה את הצד השמאלי, אבל היא ציור, וזה
                המסך שבו המתאמן עומד לצאת להתאמן. הצילום עושה את אותה
                עבודה עם חומר אמיתי. אותה טכניקה של כרטיס הפתיח במדריך:
                תמונה עם צעיף מעליה, אטום בצד שבו יושב הכתב.

                הפריים אופקי בכוונה. הכרטיס רחב ונמוך, וגוף אנכי היה
                נחתך לפלג גוף בלבד.

                כל החומר מצולם באותה חצר, וצילומים בכל מסך היו הופכים את
                האפליקציה לאלבום של בית אחד.

                כאן היה כתוב שזו התמונה הנוספת היחידה בכל האפליקציה. זה
                כבר לא נכון: יש ארבע, ושתיים מהן נכנסו אחרי. במדריך יושבת
                guide-rings.jpg, ובמתקנים spots-rings.jpg. הכלל שנשאר הוא
                שתמונה נכנסת למסך שיש בה מה לזהות, ולא כרקע לכל לוח.
              */}
              <div
                className="relative overflow-hidden px-5 pb-5 pt-6"
                style={{
                  backgroundImage:
                    "var(--home-photo-veil), url('/home-rings.jpg')",
                  backgroundSize: "cover",
                  /*
                    62 אחוז: הזרועות המושטות והטבעות באחיזה, עם הגוף
                    האופקי שנכנס מלמטה. נוסה גם פריים אחר עם רקע נקי
                    יותר, ואביב העדיף את זה. הרקע כאן עמוס יותר, אבל
                    התנוחה קריאה ומיידית וזה מה שהכריע.

                    נוסה 50, והוא הוחזר. בגובה ההוא שתי הטבעות אכן
                    נכנסות שלמות, וזה מה שנמדד, אבל מה שנכנס איתן הוא
                    שתי כפות ידיים חתוכות משני הצדדים בלי גוף, ומצנן
                    אוויר ומאוורר. הצעיף כאן הוא 100 מעלות, כלומר הוא
                    הכי שקוף בשמאל, ובדיוק שם יושבות הגרוטאות.

                    הלקח רשום כאן כי הוא יחזור: שלמות של פריט בתוך
                    הפריים היא לא אותו דבר כמו תמונה שנקראת. הראשונה
                    נמדדת בקלות והשנייה לא, ולכן קל לרדוף אחרי הראשונה.
                  */
                  backgroundPosition: "center 62%",
                }}
              >

                {/*
                  צבע קבוע ולא ירושה.

                  הצעיף של הצילום זהה בשני המצבים, כלומר המשטח כהה תמיד
                  גם כשהערכה בהירה. טקסט שיורש את צבע הטקסט הרגיל מתהפך
                  לכהה, ואז הוא כהה על כהה. on-photo הוא בדיוק צבע הטקסט
                  של המצב הכהה, ולכן הכהה לא זז והבהיר מקבל את מה שהכהה
                  כבר הראה.
                */}
                <p
                  className="relative text-[2.6rem] font-black leading-[.98] tracking-[-.05em]"
                  style={{ color: "var(--on-photo)" }}
                >
                  אימון {gate.number}
                </p>
                <p className="wood-text-photo relative text-[2.6rem] font-black leading-[.98] tracking-[-.05em]">
                  מתוך {gate.target}
                </p>

                {gate.recovery && (
                  <p className="relative mt-3 text-xs font-bold" style={{ color: "var(--recovery-text)" }}>
                    אימון התאוששות · חצי מהסטים
                  </p>
                )}

                {/*
                  בלי מסגרת. תג ממוסגר סביב טקסט קטן הוא הסימן המובהק של
                  ממשק שנוצר אוטומטית, והוא חזר כאן שוב ושוב. המשקל מגיע
                  מגודל הספרה ומהקו שמעליה, לא מקופסה סביבה.
                */}
                <div
                  className="relative mt-4 flex items-baseline gap-2.5 pt-3.5"
                  style={{ borderTop: "1px solid var(--wood-border)" }}
                >
                  {/* בלי leading-none. הוא מקטין את תיבת השורה של המספר,
                      וקו הבסיס שלו יוצא מיושר אחרת מהטקסט שלצידו. */}
                  {/* גם כאן: wood-1 במצב הבהיר הוא חום כהה, והמשטח כהה. */}
                  <span className="text-2xl font-black" style={{ color: "#e0be93" }}>
                    {gate.items}
                  </span>
                  <span className="text-sm" style={{ color: "var(--on-photo)", opacity: 0.72 }}>
                    {gate.title ? `תרגילים · ${gate.title}` : "תרגילים באימון הזה"}
                  </span>
                </div>
              </div>

              {/*
                סף עץ אמיתי, לא גרדיאנט. הצילום נשאר בהיר בכוונה: זו הפעולה
                שמתאמנים לא מצאו, והיא צריכה לתפוס את העין.
                הצעיף מגיע ממשתנה תלוי מצב, כי במצב בהיר אותו ערך הפך את
                הסף לפס כהה בתחתית כרטיס שמנת. הייצוב מתחת למילה הוא צל
                טקסט ולא עוד שכבת הכהיה — שכבה נוספת החשיכה את כל הרצועה
                והחזירה אותנו לגוון שלא נבחר.
              */}
              <div
                className="px-5 py-4 text-center"
                style={{
                  background: "var(--wood-band-veil), url('/wood-band.jpg') center/cover",
                  borderTop: "1px solid var(--wood-border-light)",
                }}
              >
                <span
                  className="text-[17px] font-black tracking-[.05em]"
                  style={{
                    color: "#fff6e8",
                    textShadow:
                      "0 1px 2px rgba(28,16,5,.85), 0 0 14px rgba(28,16,5,.55)",
                  }}
                >
                  <GateAction workoutId={gate.workoutId} />
                </span>
              </div>
            </Link>
          </section>
        )}

        {programs.rows.length > 0 && (
          <div className="mb-4 mt-8 flex items-center gap-3">
            <h2 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
              התוכניות <span className="wood-text">שלי</span>
            </h2>
            <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
          </div>
        )}

        {programs.rows.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-12 text-center">
            <p className="mb-2 text-lg font-semibold">עוד אין לך תוכנית</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              כשתשויך לך תוכנית ב-FITAY, היא תופיע כאן.
            </p>
            {(() => {
              const coachPhone = coachRow.rows[0]?.phone
                ? String(coachRow.rows[0].phone)
                : null;
              const links = coachPhone ? contactLinks(coachPhone) : null;
              if (!links) return null;
              return (
                <div className="mt-5 flex gap-2">
                  <a
                    href={links.tel}
                    className="min-h-11 flex-1 rounded-2xl px-3 py-3 text-center text-sm font-bold"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--wood-1)" }}
                  >
                    חיוג לאיתי
                  </a>
                  <a
                    href={links.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-11 flex-1 rounded-2xl px-3 py-3 text-center text-sm font-bold"
                    style={{ background: "rgba(37,211,102,.12)", border: "1px solid rgba(37,211,102,.32)", color: "#72dfa0" }}
                  >
                    WhatsApp
                  </a>
                </div>
              );
            })()}
          </div>
        ) : (
          programs.rows.map((p) => {
            const completed = Number(p.completed ?? 0);
            const target = Number(p.target_sessions ?? 24);
            const sessionsPerWeek =
              p.sessions_per_week == null ? null : Number(p.sessions_per_week);
            const levelState = levelStates.get(String(p.id)) ?? null;
            const mine = workouts.rows.filter(
              (w) => String(w.program_id) === String(p.id)
            );
            const phases = [1, 2]
              .map((phase) => ({
                phase,
                rows: mine.filter((w) => Number(w.phase) === phase),
              }))
              .filter((g) => g.rows.length > 0);

            return (
              <section
                key={String(p.id)}
                className="mb-7 overflow-hidden rounded-[2rem] border border-[var(--border-1)]"
                style={{ background: "var(--panel)", boxShadow: "var(--panel-shadow)" }}
              >
                <div
                  className="relative overflow-hidden px-5 py-5"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(180,133,79,.16), var(--surface-1) 68%)",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span className="absolute -left-4 -top-12 text-[8rem] font-black leading-none text-[var(--ghost-text)]">
                    {String(p.level).padStart(2, "0")}
                  </span>
                  <div className="relative mb-3 flex items-center justify-between gap-3">
                    <span
                      /* תג ממוסגר מרובע, לא גלולה. החתימה של FITAY. */
                      className="rounded-lg px-2.5 py-1 text-xs font-extrabold"
                      style={{
                        background: "rgba(180,133,79,.12)",
                        border: "1px solid rgba(180,133,79,.4)",
                        color: "var(--wood-1)",
                      }}
                    >
                      {programLevelName(Number(p.level))}
                    </span>
                  </div>
                  <h3 className="relative text-2xl font-black leading-tight tracking-[-.025em]">
                    {String(p.title)}
                  </h3>
                </div>

                <div className="p-4 pb-3">
                {/*
                  ההתקדמות בלי קופסה. קודם היא ישבה בכרטיס ממוסגר בתוך
                  כרטיס התוכנית, וזו הייתה רמת מסגרת שלישית באותו אזור.
                  הכלל כאן: מקשטים את המיכל פעם אחת, ומה שבתוכו הוא שורות,
                  קווים דקים וטיפוגרפיה. חמש רמות של מסגרות הן מה שגורם
                  למסך להיקרא כמו תבנית בסיסית.
                */}
                {sessionsPerWeek && (
                  <div className="mb-6">
                    <div className="mb-2.5 flex items-baseline justify-between gap-3">
                      <span className="text-xs font-bold text-[var(--dim)]">ההתקדמות שלך</span>
                      <span className="text-xs font-black" style={{ color: "var(--wood-1)" }}>
                        <Bidi text={`${Math.min(completed, target)} מתוך ${target} אימונים`} />
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
                      <div
                        className="wood h-full rounded-full"
                        style={{ width: `${Math.min(100, (completed / target) * 100)}%` }}
                      />
                    </div>
                    {/*
                      כמה נשאר יושב כאן, באזור המצב של הכרטיס, ולא בתחתיתו
                      אחרי רשימת האימונים. שם העין קראה אותו כאילו הוא עוד
                      שורה ברשימה — וזו הייתה בעיית מיקום ולא בעיית עיצוב.

                      המספר מודגש בתוך המשפט ולא עומד לבד: "נשארו 18
                      אימונים" הוא עובדה אחת, לא כותרת ותוכן. הקצב מצטרף
                      לאותה שורה כי שניהם עונים על אותה שאלה — כמה זמן
                      לוקח מכאן לסוף.
                    */}
                    <p className="mt-2.5 text-xs leading-5" style={{ color: "var(--faint)" }}>
                      נשארו{" "}
                      <span className="text-sm font-black" style={{ color: "var(--wood-1)" }}>
                        {Math.max(0, target - completed)}
                      </span>{" "}
                      אימונים · קצב של {sessionsPerWeek} בשבוע
                    </p>
                  </div>
                )}

                <ProgramSetup
                  programId={String(p.id)}
                  sessionsPerWeek={sessionsPerWeek}
                />

                {sessionsPerWeek && (mine.length === 0 ? (
                  <p
                    className="rounded-3xl px-6 py-8 text-center text-sm"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--line)",
                      color: "var(--dim)",
                    }}
                  >
                    אין עדיין אימונים בתוכנית
                  </p>
                ) : (
                  phases.map((g) => (
                    <div key={g.phase} className="mb-7">
                      {/* המתאמן רואה את כל התוכנית מראש — כולל לאן הוא הולך */}
                      {/*
                        המספר הממוסגר הוא העוגן לסריקה, והכיתוב לידו נושא
                        את מה שהוא לא יכול להגיד. קודם עמדו כאן שלוש
                        תצוגות של אותו מספר בשורה אחת.
                      */}
                      {/*
                        בלי ריבוע ממוסגר עם המספר. הכיתוב לידו אומר "שלב 1
                        מתוך 2", כלומר הריבוע חזר על אותה ספרה בדיוק. נשארה
                        הכותרת עם הקו הדוהה, שהיא ממילא שפת הכותרות כאן.
                      */}
                      <div className="mb-1 flex items-center gap-3">
                        <p className="shrink-0 text-sm font-extrabold">
                          שלב {g.phase} מתוך 2
                        </p>
                        <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/30 to-transparent" />
                      </div>

                      <div>
                        {g.rows.map((w, workoutIndex) => {
                          const id = String(w.id);
                          const past = history.get(id);
                          const isNext =
                            id === activeWorkoutByProgram.get(String(p.id));
                          const blockedReason = !sessionsPerWeek
                            ? "האימון ייפתח אחרי בחירת קצב אימונים."
                            : completed >= target
                              ? "האימון סגור כי התוכנית הושלמה."
                              : null;
                          /*
                            הרשימה ויתרה על תפקיד המשגר. השער בראש המסך הוא
                            הפעולה, וכשגם כאן היה רקע זהוב, מסגרת מוארת, צל
                            ותג "הבא בתור", אותה פעולה נקראה פעמיים במסך אחד
                            ושתי הקריאות נחלשו.
                            נשאר סימון שקט אחד — המספר הממוסגר בגוון עץ — כדי
                            שמי שגולל את כל התוכנית עדיין ידע איפה הוא עומד.
                          */
                          /*
                            שורה, לא כרטיס. קודם כל אימון היה כרטיס ממוסגר
                            עם ריבוע מספר ותג "לאימון" בקצה — שלוש מסגרות
                            לפריט אחד, בתוך כרטיס שגם הוא ממוסגר.
                            עכשיו: קו מפריד דק, המספר כטיפוגרפיה, והשורה
                            כולה היא הקישור. מי שעומד כאן מסומן בזהב ובמילה
                            אחת, בלי רקע ובלי צל שיתחרו בשער שלמעלה.
                          */
                          /*
                            השורה של היום מקבלת משטח משלה, ושאר השורות
                            נשארות שורות עם קו מפריד.

                            מה שנקרא גנרי הוא קופסה ניטרלית — אפורה, עם קו
                            דק, בלי סיבה. משטח בגוון עץ עם מסגרת עץ הוא
                            החתימה של FITAY, ואותה מתכונת בדיוק היא שהפכה
                            את כרטיס ארבעת הכללים במדריך ממשהו שטוח למשהו
                            שיש לו נוכחות.
                          */
                          const isTodayRow = isNext && !blockedReason;
                          /*
                            נבחר ידנית, כלומר לא מה שהרוטציה הציעה. משנה
                            רק את המילה שמעל השם: "האימון של היום" הוא
                            הבטחה של האפליקציה, ומי שבחר בעצמו יודע שזה
                            לא מה שהוצע לו, ומשפט שאומר לו אחרת נקרא
                            כתקלה.
                          */
                          const isPicked =
                            chosenByProgram.get(String(p.id)) === id;
                          /*
                            נעול בכלל החזרה: התרגיל הזה כבר בוצע פעמיים
                            ברצף. הוא נשאר ברשימה ונשאר קריא, הוא פשוט
                            לא ניתן לבחירה, ושורה מתחתיו אומרת למה.
                            הסתרה הייתה משאירה מתאמן מול רשימה שחסר בה
                            פריט בלי הסבר.
                          */
                          const repeatLocked =
                            Boolean(repeatBlocked.get(String(p.id))?.has(id)) &&
                            !isTodayRow;
                          /*
                            שורת האימון של היום לובשת את אותו עץ בדיוק
                            של כפתור "ממשיכים": אותה תמונה ואותה הכהיה.

                            קודם ישב כאן גוון חום שטוח, ואחריו דוגמית עץ
                            בהירה וכתומה משלו. שני עצים שונים במסך אחד
                            נקראים כשתי אפליקציות, ואביב ביקש שיהיו זהים.

                            אחר כך השורה קיבלה את מחלקת wood, שהיא מדרג
                            צבע ולא תמונה, בזמן שהכפתור עבר לתמונה. שוב
                            שני חומרים, ואיתי ראה את זה במסך אחד. עכשיו
                            שניהם קוראים את אותו wood-band.jpg.
                          */
                          const rowStyle = isTodayRow
                            ? {
                                background:
                                  "var(--wood-band-veil), url('/wood-band.jpg') center/cover",
                                border: "1px solid var(--wood-border-light)",
                                borderRadius: "1.25rem",
                                marginBlock: ".5rem",
                                /* צל טקסט נורש לכל השורה, אותו צל בדיוק
                                   של המילה "ממשיכים": נפילה של פיקסל
                                   ומעליה זוהר רחב.

                                   קודם ישבה כאן רק הנפילה, וזה החזיק
                                   בכהה בלבד. הצעיף מעל רצועת העץ במצב
                                   הבהיר הוא כמעט שקוף, 0.04 עד 0.13,
                                   ושם שורת המשנה הדקה באטימות 0.72
                                   נשטפה לתוך העץ הבהיר. הזוהר הוא מה
                                   שפותר את זה בכפתור, והוא פותר גם כאן.

                                   הדרך השנייה, להכהות את הצעיף במצב
                                   הבהיר, נפסלה: היא מכהה את השורה ולא
                                   את הכפתור, ואיתי ביקש במפורש ששניהם
                                   יהיו באותו צבע. */
                                textShadow:
                                  "0 1px 2px rgba(28,16,5,.85), 0 0 14px rgba(28,16,5,.6)",
                              }
                            : {
                                borderTop:
                                  workoutIndex === 0 ? "none" : "1px solid var(--line)",
                              };
                          /*
                            בלי מספור על השורות, וזו לא החלטה עיצובית.

                            בתוכנית יש ארבע תבניות אימון — משיכה ודחיפה בכל
                            שלב — והן מסתובבות לאורך 24 האימונים. מספר על
                            שורה נקרא כמספר אימון, והוא לא: "02" הוא התבנית
                            השנייה ולא האימון השני. במסך שבו השער מכריז
                            "אימון 6 מתוך 24", שתי מערכות מספור שנקראות
                            שתיהן "אימון" מבלבלות בהכרח.
                            נשאר מספר אימון אחד באפליקציה, וזה של השער.
                          */
                          const cardContent = (
                            <>
                              <div className="min-w-0 flex-1">
                                {/*
                                  קודם עמדה כאן המילה "כאן" בקצה השורה.
                                  היא הבליטה את השורה אבל לא אמרה כלום —
                                  גודל וצבע אומרים "שים לב", לא "זה שלך
                                  היום". השורה הזאת אומרת את זה במילים,
                                  והיא מה שהופך הדגשה למשמעות.
                                */}
                                {/*
                                  צבעי הטקסט על שורת העץ הם אלה של
                                  כפתור "ממשיכים". זהב על עץ בהיר כמעט
                                  לא נקרא, וזו אותה משפחה של צבעים.
                                */}
                                {isNext && !blockedReason && (
                                  <p
                                    className="mb-1 text-[11px] font-black tracking-[.12em]"
                                    style={{ color: "var(--on-wood)", opacity: 0.72 }}
                                  >
                                    {isPicked ? "האימון שבחרת" : "האימון של היום"}
                                  </p>
                                )}
                                <p
                                  className="truncate font-black"
                                  style={{
                                    fontSize: isNext && !blockedReason ? "1.15rem" : ".95rem",
                                    letterSpacing: "-.02em",
                                    color: isNext && !blockedReason
                                      ? "var(--on-wood)"
                                      : "var(--dim)",
                                  }}
                                >
                                  {String(w.title)}
                                </p>
                                <p
                                  className="mt-1 text-xs"
                                  style={
                                    isNext && !blockedReason
                                      ? { color: "var(--on-wood)", opacity: 0.72 }
                                      : { color: "var(--faint)" }
                                  }
                                >
                                  {String(w.items)} תרגילים
                                  {" · "}
                                  {past
                                    ? past.times === 1
                                      ? `בוצע פעם אחת · ${daysSince(past.last)}`
                                      : `בוצע ${past.times} פעמים · ${daysSince(past.last)}`
                                    : "עוד לא בוצע"}
                                </p>
                              </div>
                              {blockedReason ? (
                                <span
                                  className="shrink-0 text-[11px] font-bold"
                                  style={{ color: "var(--faint)" }}
                                >
                                  נעול
                                </span>
                              ) : null}
                            </>
                          );

                          if (blockedReason) {
                            return (
                              <LockedWorkoutCard
                                key={id}
                                reason={blockedReason}
                                style={rowStyle}
                              >
                                {cardContent}
                              </LockedWorkoutCard>
                            );
                          }

                          /*
                            שורת האימון של היום אינה קישור.

                            אותו אימון בדיוק נפתח מהשער בראש המסך, ושם
                            יושבת הפעולה. כששתי הנקודות משגרות את אותו
                            דבר הן מחלישות זו את זו, וזה בדיוק מה שכתוב
                            בהערה שלמעלה על התקופה שבה הרשימה התחרתה
                            בשער. העץ שהשורה לבשה כדי להבליט את היום
                            החזיר את התחרות בלי שהקישור ירד איתה.

                            היא נשארת סימון: היא אומרת איזה אימון הוא
                            של היום, והשער מפעיל אותו. ולכן ירדה גם
                            תגובת הלחיצה, כי משטח שמגיב למגע ולא עושה
                            כלום גרוע יותר מכפילות.

                            שאר השורות נשארות קישורים. הן פותחות אימון
                            אחר, וזו פעולה שאין לה שום נקודה שנייה במסך.
                          */
                          if (isTodayRow) {
                            return (
                              <div key={id}>
                                <div
                                  className="flex items-center gap-3.5 overflow-hidden px-4 py-4"
                                  style={rowStyle}
                                >
                                  {cardContent}
                                </div>
                                {/*
                                  רק אחרי בחירה ידנית.

                                  מי שלא בחר כלום מקבל את מה שהאפליקציה
                                  הציעה ממילא, והמשפט היה חוזר על מה
                                  שהשער כבר אומר בעצמו. מי שכן בחר עומד
                                  בתחתית העמוד מול שורה שהשתנתה, והשער
                                  שהשתנה איתה נמצא מסך אחד למעלה.
                                */}
                                {isPicked && (
                                  <p
                                    className="px-4 pt-1 text-[11px] leading-5"
                                    style={{ color: "var(--dim)" }}
                                  >
                                    מתחילים אותו מהכפתור בראש המסך.
                                  </p>
                                )}
                              </div>
                            );
                          }

                          /*
                            שורה נעולה. לא כפתור, ולא מוסתרת.
                          */
                          if (repeatLocked) {
                            return (
                              <div
                                key={id}
                                className="px-1 py-4"
                                style={rowStyle}
                              >
                                <div className="flex items-center gap-3.5 opacity-45">
                                  {cardContent}
                                </div>
                                <p
                                  className="mt-1.5 text-[11px] leading-5"
                                  style={{ color: "var(--dim)" }}
                                >
                                  כבר עשית אותו פעמיים ברצף בתוכנית הזאת.
                                </p>
                                <RepeatRequest
                                  workoutId={id}
                                  pending={repeatPending.has(id)}
                                />
                              </div>
                            );
                          }

                          /*
                            השורה בוחרת, היא לא משגרת.

                            עד עכשיו כל שורה הייתה קישור ישיר לאימון,
                            כלומר שתי דרכים להתחיל את אותו דבר. עכשיו
                            יש אחת: השער בראש המסך. לחיצה כאן טוענת את
                            הבית מחדש עם הבחירה, השער משתנה מול העיניים,
                            והמתאמן מפעיל אותו כשהוא מוכן.

                            הבחירה יושבת בכתובת ולא במסד, ולכן אין כאן
                            שמירה שאפשר לשכוח ואין מצב שנשאר תקוע.
                          */
                          return (
                            <Link
                              key={id}
                              href={`/client?do=${id}`}
                              scroll={false}
                              className="flex items-center gap-3.5 px-1 py-4 transition active:opacity-70"
                              style={rowStyle}
                            >
                              {cardContent}
                            </Link>
                          );
                        })}
                      </div>

                    </div>
                  ))
                ))}
                {/*
                  חלון ההתאוששות: אחרי כל 12 אימונים באים שני אימונים
                  מוקלים, והם נספרים בתוך ה-24. הכרטיס מוצג רק בתוך
                  החלון, כי הספירה קובעת — כל אימון שנפתח בזמן החלון
                  יהיה מוקל, לא רק "הבא בתור".
                */}
                {mine.length > 0 &&
                  sessionsPerWeek != null &&
                  completed < target &&
                  isRecoverySession(completed) && (
                    <RecoveryWindowCard
                      remaining={2 - (completed % 12)}
                    />
                  )}
                {/* בקשת מעבר לרמה הבאה. מוצג לכל תוכנית פעילה בנפרד. */}
                {/*
                  בדיקת הרמה נפתחת רק בסיום התוכנית. עד אז אין מה לצלם,
                  והמסך אומר כמה נשאר במקום להציג בלוק ריק.
                */}
                {sessionsPerWeek && (completed >= target && levelState ? (
                  <LevelRequest
                    programId={String(p.id)}
                    programTitle={String(p.title)}
                    pending={pendingLevel.has(String(p.id))}
                    assignmentId={levelState.assignmentId}
                    exercises={levelState.exercises}
                    videosReady={levelState.ready}
                    coachNote={returnedNotes.get(String(p.id)) ?? ""}
                  />
                ) : (
                  /*
                    ספירת מה שנשאר עלתה לאזור המצב, מתחת לפס ההתקדמות.
                    המשפט על מה שקורה בסוף התוכנית ירד מכאן: הוא הופיע
                    בתחתית הכרטיס לאורך כל 24 האימונים, בזמן שהוא רלוונטי
                    רק כשמגיעים לסוף — ואז ממילא מוצג במקומו כרטיס בקשת
                    המעבר עם ההסבר המלא.
                  */
                  null
                ))}
                </div>
              </section>
            );
          })
        )}

        {/*
          רצועת השבוע היא ברמת המתאמן ולא ברמת התוכנית, ולכן היא עומדת
          לבדה. בתוך מקטע תוכנית היא הייתה מופיעה פעמיים למי שיש לו שתי
          תוכניות פעילות.

          היא ירדה לתחתית העמוד. קודם היא ישבה בין הפאנל העליון לכותרת
          התוכניות, וזאת דלת שחצתה את הדרך: מי שפותח את האפליקציה בא
          לאימון של היום, ובדרך אליו עמדה כותרת במשקל מלא שמובילה למקום
          אחר. תכנון שבוע הוא מה שעושים אחרי שראית מה יש, לא לפני.

          מוצגת רק כשיש תוכנית עם קצב שנבחר. לפני זה כל האימונים נעולים,
          ורצועת תכנון מעל מסך נעול מזמינה לתכנן משהו שאי אפשר לפתוח.
        */}
        {programs.rows.some((p) => p.sessions_per_week != null) && (
          <WeekStrip
            planned={trainingDays.planned}
            completedAt={trainingDays.completedAt}
          />
        )}

      </div>
    </main>
  );
}

/** קישורי חיוג ו-WhatsApp למאמן, מאותו מנגנון שמשמש את המאמן מול המתאמנים שלו. */
function contactLinks(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
  const international = local.startsWith("0") ? `972${local.slice(1)}` : local;
  return { tel: `tel:${local}`, whatsapp: `https://wa.me/${international}` };
}

function HomeRings() {
  return (
    <div className="pointer-events-none absolute -left-9 -top-8 opacity-20" aria-hidden="true">
      <div className="h-32 w-32 rounded-full border-[14px] border-[#b4854f]/35" />
      <div className="-mt-20 ml-10 h-20 w-20 rounded-full border-[9px] border-[#e0be93]/35" />
    </div>
  );
}

/**
 * הכרטיס שמוצג בזמן חלון ההתאוששות. האפליקציה כבר מקטינה את הסטים
 * באימונים עצמם, ולכן אין כאן טבלת כללים — רק הסבר מה קורה עכשיו.
 */
function RecoveryWindowCard({ remaining }: { remaining: number }) {
  return (
    <aside className="glass relative mt-4 overflow-hidden rounded-3xl">
      <span
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-[#e0be93]/60 to-transparent"
        aria-hidden="true"
      />
      <div className="relative px-4 pb-4 pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span
            className="flex items-center gap-1.5 text-xs font-extrabold tracking-[.08em] wood-text"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--wood-2)" }}
            />
            חלק מהתוכנית
          </span>
          <span
            className="rounded-lg px-2.5 py-1 text-xs font-extrabold"
            style={{
              background: "rgba(180,133,79,.12)",
              border: "1px solid rgba(180,133,79,.4)",
              color: "var(--wood-1)",
            }}
          >
            {remaining === 1 ? "נשאר אימון אחד" : "נשארו 2 אימונים"}
          </span>
        </div>
        <h4 className="text-lg font-black tracking-[-.02em] text-[var(--text)]">
          אימוני התאוששות
        </h4>
        <p className="mt-1 text-xs leading-5 text-[var(--faint)]">
          {remaining === 1
            ? "האימון הבא מוקל: אותם תרגילים, חצי מהסטים, אותן חזרות. הוא נספר בתוך התוכנית."
            : "שני האימונים הבאים מוקלים: אותם תרגילים, חצי מהסטים, אותן חזרות. הם נספרים בתוך התוכנית."}
        </p>
        <p
          className="mt-2 border-r-2 pr-3 text-xs font-semibold leading-5 text-[var(--faint)]"
          style={{ borderColor: "var(--wood-border)" }}
        >
          לא מדלגים על האימונים האלה, גם כשמרגישים טוב.
        </p>
      </div>
    </aside>
  );
}
