import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import PushToggle from "@/components/PushToggle";
import LevelRequestInbox, {
  type PendingRequest,
  type ProgramOption,
  type RequestClip,
} from "@/components/LevelRequestInbox";
import CoachAccount from "@/components/CoachAccount";
import HardeningInbox, {
  type PendingHardening,
  type HardeningSet,
} from "@/components/HardeningInbox";
import TraineeWeekRow from "@/components/TraineeWeekRow";
import { getCoachTrainingDays } from "@/lib/training-days";
import { UNTOUCHED_STREAK } from "@/lib/progression";
import { Suspense } from "react";

export default async function CoachHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const dashboardPromise = db.batch([
    `
      SELECT u.id, u.name, u.rehab_mode, u.active,
             (SELECT COUNT(*) FROM completions c WHERE c.trainee_id = u.id) AS done,
             (SELECT COUNT(*) FROM assignments a
               WHERE a.trainee_id = u.id AND a.status = 'active') AS programs
        FROM users u
       WHERE u.role = 'trainee'
       ORDER BY u.name
    `,
    // החימום לא נספר — הוא קבוע בכל אימון ולא נבחר לתוכנית.
    "SELECT COUNT(*) c FROM exercises WHERE category <> 'warmup'",
    /*
     * אימון ואימון, והאם כל הסטים בו אושרו בלי נגיעה במספר.
     *
     * MIN על עמודת דגל היא בדיקת "כולם": התוצאה היא 1 רק כשאין ולו סט
     * אחד שנערך ידנית. הרצף עצמו נספר בקוד, כי SQLite בלי חלונות הופך
     * ספירת רצף לשאילתה שאי אפשר לקרוא.
     */
    `
      SELECT trainee_id, logged_at, MIN(untouched) AS all_untouched
        FROM set_logs
       WHERE recovery = 0
       GROUP BY trainee_id, logged_at
       ORDER BY trainee_id, logged_at DESC
    `,
  ], "read");

  const [
    levelReqs,
    allPrograms,
    checkClips,
    hardenings,
    hardeningSets,
    declineReasons,
  ] = await db.batch([
    // בקשות מעבר רמה שממתינות. זה הדבר היחיד שחוסם מתאמן מלהתקדם,
    // ולכן הוא בראש המסך.
    `
      SELECT r.id, r.note, r.requested_at, u.name AS trainee_name,
             p.title AS from_title, r.trainee_id, r.from_program_id
        FROM level_requests r
        JOIN users u ON u.id = r.trainee_id
        JOIN programs p ON p.id = r.from_program_id
       WHERE r.status = 'pending'
       ORDER BY r.requested_at
    `,
    "SELECT id, title, level FROM programs WHERE is_template = 1 ORDER BY level, title",
    // סרטוני בדיקת הרמה של כל מי שממתין. שאילתה אחת לכולם ולא אחת לכל
    // בקשה, כי זה רץ בכל טעינה של מסך הבית של המאמן.
    `
      SELECT a.trainee_id, a.program_id, v.exercise_id, v.url,
             e.name AS exercise_name
        FROM level_check_videos v
        JOIN exercises e ON e.id = v.exercise_id
        JOIN assignments a ON a.id = v.assignment_id
        JOIN level_requests r
          ON r.trainee_id = a.trainee_id
         AND r.from_program_id = a.program_id
         AND r.status = 'pending'
       WHERE a.status = 'active'
       ORDER BY v.uploaded_at
    `,
    // הקשיות שממתינות להכרעה. לכאן מגיע רק מי שכל הסטים שלו אושרו בלי
    // נגיעה, כלומר אין ראיה שהרישום אמיתי.
    `
      SELECT pe.id, pe.kind, pe.created_at, u.name AS trainee_name,
             e.name AS exercise_name, e.type
        FROM progression_events pe
        JOIN users u ON u.id = pe.trainee_id
        JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.status = 'pending'
       ORDER BY pe.created_at
    `,
    // הסטים של אותו אימון בדיוק. כל שורות האימון חולקות logged_at, ולכן
    // החותמת של האירוע היא המפתח. שאילתה אחת לכל הבקשות ולא אחת לכל אחת.
    `
      SELECT pe.id AS event_id, sl.set_number, sl.reps, sl.seconds, sl.untouched
        FROM progression_events pe
        JOIN set_logs sl
          ON sl.workout_item_id = pe.workout_item_id
         AND sl.logged_at = pe.created_at
         AND (sl.side IS NULL OR sl.side = 'weak')
       WHERE pe.status = 'pending'
       ORDER BY pe.id, sl.set_number
    `,
    "SELECT body FROM decline_reasons ORDER BY position",
  ], "read");

  // המפתח הוא מתאמן ותוכנית, כי זה מה שמחבר בין בקשה לשיוך.
  const clipsByRequest = new Map<string, RequestClip[]>();
  for (const row of checkClips.rows) {
    const key = `${String(row.trainee_id)}:${String(row.program_id)}`;
    const list = clipsByRequest.get(key) ?? [];
    list.push({
      exerciseId: String(row.exercise_id),
      name: String(row.exercise_name),
      url: String(row.url),
    });
    clipsByRequest.set(key, list);
  }

  const pendingRequests: PendingRequest[] = levelReqs.rows.map((r) => ({
    id: String(r.id),
    traineeName: String(r.trainee_name),
    fromTitle: String(r.from_title),
    note: String(r.note ?? ""),
    requestedAt: String(r.requested_at),
    clips:
      clipsByRequest.get(`${String(r.trainee_id)}:${String(r.from_program_id)}`) ??
      [],
  }));

  const programOptions: ProgramOption[] = allPrograms.rows.map((p) => ({
    id: String(p.id),
    title: String(p.title),
    level: Number(p.level),
  }));

  const setsByEvent = new Map<string, HardeningSet[]>();
  for (const row of hardeningSets.rows) {
    const key = String(row.event_id);
    const list = setsByEvent.get(key) ?? [];
    list.push({
      setNumber: Number(row.set_number),
      value: Number(row.reps ?? row.seconds ?? 0),
      untouched: Number(row.untouched ?? 0) === 1,
    });
    setsByEvent.set(key, list);
  }

  const pendingHardenings: PendingHardening[] = hardenings.rows.map((row) => ({
    id: String(row.id),
    traineeName: String(row.trainee_name),
    exerciseName: String(row.exercise_name),
    kind: String(row.kind) === "drop-band" ? "drop-band" : "harder",
    createdAt: String(row.created_at),
    unit: String(row.type) === "hold" ? "שניות" : "חזרות",
    sets: setsByEvent.get(String(row.id)) ?? [],
  }));

  const reasons = declineReasons.rows.map((row) => String(row.body));

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
        <p className="text-sm" style={{ color: "var(--dim)" }}>
          שלום
        </p>
        <h1 className="mb-7 text-3xl font-bold tracking-tight">{user.name}</h1>

        <LevelRequestInbox requests={pendingRequests} programs={programOptions} />

        {/*
          מתחת לבקשות המעבר בכוונה. בקשת מעבר חוסמת מתאמן מלהתקדם, והקשיה
          שממתינה רק מחזיקה אותו בדרגה הנוכחית עוד קצת.
        */}
        <HardeningInbox requests={pendingHardenings} reasons={reasons} />

        <Suspense fallback={<CoachDashboardSkeleton />}>
          <CoachDashboardSections result={dashboardPromise} coachName={user.name} />
        </Suspense>
      </div>
    </main>
  );
}

async function CoachDashboardSections({
  result,
  coachName,
}: {
  result: ReturnType<typeof db.batch>;
  coachName: string;
}) {
  // שתי השאילתות של ימי האימון רצות במקביל לדשבורד ולא אחריו, כי הן
  // עצמאיות ממנו. שאילתה אחת לכל המתאמנים ולא אחת לכל שורה.
  const [[trainees, exercises, sessions], trainingDays] = await Promise.all([
    result,
    getCoachTrainingDays(),
  ]);

  /*
   * מי עבר רצף של אימונים בלי לשנות אף מספר.
   *
   * זה לא אותו דבר כמו הקשיה שממתינה. הקשיה נוגעת לתרגיל אחד שהגיע
   * לתקרה, וזה אומר שהיומן כולו של המתאמן אינו אמין, כולל התרגילים
   * שהוא רחוק בהם מהתקרה. זו שיחה, ולא משהו שאלגוריתם פותר.
   *
   * השורות מגיעות ממוינות לפי מתאמן ולפי זמן יורד, ולכן די לספור מהתחלה
   * עד האימון הראשון שכן נגעו בו.
   */
  const untouchedStreak = new Map<string, number>();
  const streakClosed = new Set<string>();
  for (const row of sessions.rows) {
    const id = String(row.trainee_id);
    if (streakClosed.has(id)) continue;
    // האימון הראשון שנגעו בו סוגר את הרצף, וכל מה שלפניו כבר לא רלוונטי.
    if (Number(row.all_untouched ?? 0) !== 1) {
      streakClosed.add(id);
      continue;
    }
    untouchedStreak.set(id, (untouchedStreak.get(id) ?? 0) + 1);
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <DashboardStatLink href="#trainees" value={trainees.rows.length} label="מתאמנים" />
        <DashboardStatLink href="/coach/library" value={String(exercises.rows[0].c)} label="תרגילים בספרייה" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2.5">
        <Link
          href="/coach/trainees/new"
          className="wood rounded-2xl py-4 text-center font-extrabold"
          style={{
            color: "#f7ebda",
            boxShadow:
              "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
          }}
        >
          + מתאמן
        </Link>
        <Link
          href="/coach/programs"
          className="rounded-2xl py-4 text-center font-extrabold"
          style={{
            background: "rgba(255,255,255,.06)",
            border: "1px solid var(--line)",
            color: "var(--wood-1)",
          }}
        >
          תוכניות
        </Link>
      </div>

      {/*
        כרטיס הסרטונים ירד מכאן. הוא חי עכשיו בלשונית הספרייה שבסרגל
        התחתון, וקיצור דרך שני לאותו מקום רק גזל שטח מהמסך.
      */}

      <PushToggle hint="תקבל התראה על כל אימון שהושלם ועל דיווח כאב." />

      <CoachAccount name={coachName} />

      <h2 id="trainees" className="mb-3 scroll-mt-28 text-lg font-bold">המתאמנים שלי</h2>

      {trainees.rows.length === 0 ? (
        <div className="glass rounded-3xl px-6 py-12 text-center">
          <p className="mb-2 text-lg font-semibold">עוד אין מתאמנים</p>
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            כאן יופיעו המתאמנים אחרי שתוסיף אותם.
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl p-2">
          {trainees.rows.map((t, i) => (
            <Link
              key={String(t.id)}
              href={`/coach/trainees/${t.id}`}
              className="flex items-center gap-3 px-3 py-3.5"
              style={{
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
              }}
            >
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-bold"
                style={{
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.13)",
                  color: "var(--wood-1)",
                }}
              >
                {String(t.name).trim().charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{String(t.name)}</p>
                <p className="text-xs" style={{ color: "var(--dim)" }}>
                  {String(t.programs)} תוכניות · {String(t.done)} אימונים
                </p>
                {/* מה המתאמן סימן לעצמו לשבוע, ואם הוא מתאמן היום. */}
                <TraineeWeekRow
                  planned={trainingDays.planned.get(String(t.id)) ?? []}
                  completedAt={trainingDays.completedAt.get(String(t.id)) ?? []}
                />
                {/*
                  סימן שקט, לא התראה. הוא נשאר כל עוד התנאי מתקיים ונעלם
                  מעצמו ברגע שהמתאמן עורך ערך אחד, שזה הפתרון האמיתי היחיד.
                */}
                {(untouchedStreak.get(String(t.id)) ?? 0) >= UNTOUCHED_STREAK && (
                  <p
                    className="mt-1 text-xs font-semibold"
                    style={{ color: "#ffb4b6" }}
                  >
                    {untouchedStreak.get(String(t.id))} אימונים רצופים בלי שינוי
                    ידני אחד
                  </p>
                )}
              </div>
              {Number(t.active) !== 1 && (
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{
                    background: "rgba(229,72,77,.14)",
                    border: "1px solid rgba(229,72,77,.36)",
                    color: "#ffb4b6",
                  }}
                >
                  מושבת
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function DashboardStatLink({ href, value, label }: { href: string; value: string | number; label: string }) {
  return (
    <Link href={href} className="glass rounded-3xl px-3 py-4 text-center transition active:scale-[.98]">
      <b className="block text-2xl font-extrabold wood-text">{value}</b>
      <span className="block text-xs" style={{ color: "var(--dim)" }}>{label}</span>
      <span className="mt-1 block text-xs font-bold" style={{ color: "var(--wood-1)" }}>לפתיחה ←</span>
    </Link>
  );
}

function CoachDashboardSkeleton() {
  return (
    <div className="min-h-96 animate-pulse" aria-hidden="true">
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="glass h-[76px] rounded-3xl" />
        <div className="glass h-[76px] rounded-3xl" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-2.5">
        <div className="h-14 rounded-2xl bg-white/[.06]" />
        <div className="h-14 rounded-2xl bg-white/[.06]" />
      </div>
      <div className="glass mb-6 h-[76px] rounded-3xl" />
      <div className="glass h-48 rounded-3xl" />
    </div>
  );
}
