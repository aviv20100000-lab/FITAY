import { createClient } from "@libsql/client";

type DbClient = ReturnType<typeof createClient>;

let _db: DbClient | null = null;

function getDb(): DbClient {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL חסר ב-.env.local");
    _db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return _db;
}

const db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (stmt: any) => getDb().execute(stmt),
  executeMultiple: (stmt: string) => getDb().executeMultiple(stmt),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  batch: (stmts: any, mode?: any) => getDb().batch(stmts, mode),
};

// Bump whenever a migration is added below.
const SCHEMA_VERSION = 22;

// Idempotent, but it costs several remote round-trips — run it at most once per
// server process. Concurrent callers all await the same in-flight promise.
let initPromise: Promise<void> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── משתמשים ──────────────────────────────────────────────────────────────
-- role: 'coach' (FITAY) | 'trainee'
-- rehab_mode: המתג לכל מתאמן. כבוי = מתאמן רגיל, דלוק = נפתחים דיווח כאב
--             ותרגילי שיקום. רוב המתאמנים כבויים.
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('coach','trainee')),
  active          INTEGER NOT NULL DEFAULT 1,
  rehab_mode      INTEGER NOT NULL DEFAULT 0,
  notes           TEXT NOT NULL DEFAULT '',
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ── ספריית התרגילים ──────────────────────────────────────────────────────
-- kind: 'strength' | 'rehab'  — כדי שתרגילי שיקום יופיעו רק למי שבמצב שיקום
-- type: 'reps' | 'hold' | 'amrap'
-- unilateral: תרגיל חד־צדדי. לפי החוברת מתחילים תמיד מהצד החלש.
CREATE TABLE IF NOT EXISTS exercises (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'strength' CHECK (kind IN ('strength','rehab')),
  type         TEXT NOT NULL CHECK (type IN ('reps','hold','amrap')),
  tempo        TEXT NOT NULL DEFAULT '',
  muscles      TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  technique    TEXT NOT NULL DEFAULT '[]',  -- JSON array
  tips         TEXT NOT NULL DEFAULT '[]',  -- JSON array
  video_file   TEXT,
  unilateral   INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL DEFAULT 0
);

-- ── תוכניות ──────────────────────────────────────────────────────────────
-- level: 1..3 — שלוש הרמות מהחוברת.
-- is_template: תוכנית מובנית שמאמן FITAY משכפל ממנה. שכפול יוצר תוכנית אישית
--              עם template_id שמצביע למקור, כך שהמקור נשאר נקי.
-- weeks: שריד. התוכנית נמדדת ב-24 אימונים לפי assignments.target_sessions,
--        ולא במשך זמן. העמודה לא מוצגת בשום מסך והיא נשארת כאן רק כדי לא
--        למחוק נתונים קיימים. אין להוסיף עליה תצוגה חדשה.
CREATE TABLE IF NOT EXISTS programs (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  level        INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  weeks        INTEGER NOT NULL DEFAULT 8,
  is_template  INTEGER NOT NULL DEFAULT 0,
  template_id  TEXT REFERENCES programs(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_programs_template ON programs(is_template);

-- ── אימונים בתוך תוכנית ──────────────────────────────────────────────────
-- phase: 1 או 2 — כל רמה מחולקת לשני שלבים, חצי מ-24 האימונים כל אחד.
CREATE TABLE IF NOT EXISTS workouts (
  id         TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  phase      INTEGER NOT NULL DEFAULT 1 CHECK (phase IN (1,2)),
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_workouts_program ON workouts(program_id);

-- ── תרגיל בתוך אימון ─────────────────────────────────────────────────────
-- ring_height + body_angle: שני המרכיבים שקובעים את רמת הקושי לפי החוברת.
--   גובה נמוך יותר = קשה יותר. מאמן FITAY קובע אותם לכל מתאמן בנפרד.
-- seconds משמש ל-hold/amrap, reps ל-reps.
-- target_min: תחתית טווח העבודה. reps/seconds הם התקרה, וההתקדמות היא
--   מהתחתית אל התקרה. NULL = תחתית ברירת מחדל, 60 אחוז מהתקרה, מחושבת
--   בזמן קריאה (rangeFloor ב-progression.ts) כדי שלא יהיו שני מקורות אמת.
CREATE TABLE IF NOT EXISTS workout_items (
  id          TEXT PRIMARY KEY,
  workout_id  TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  position    INTEGER NOT NULL DEFAULT 0,
  sets        INTEGER NOT NULL DEFAULT 3,
  reps        INTEGER,
  seconds     INTEGER,
  target_min  INTEGER,
  rest        INTEGER NOT NULL DEFAULT 60,
  ring_height TEXT,
  body_angle  TEXT,
  video_file  TEXT,
  notes       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_items_workout ON workout_items(workout_id);

-- ── שיוך תוכנית למתאמן ───────────────────────────────────────────────────
-- כל שורה היא ריצה אחת של תוכנית, לא "התוכנית של המתאמן". מתאמן שחוזר
-- על אותה תוכנית מקבל שורה חדשה, והריצה הקודמת נשארת עם הסטטוס
-- 'completed' כדי שההיסטוריה שלו לא תימחק. האינדקס הייחודי החלקי הוא מה
-- שמונע שתי ריצות פעילות במקביל על אותה תוכנית.
CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  trainee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id  TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL,
  sessions_per_week INTEGER CHECK (sessions_per_week IN (3,4)),
  target_sessions INTEGER NOT NULL DEFAULT 24,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  -- 'returned' הוא החזרה לביצוע חוזר: איתי ראה את הסרטונים ורוצה שהמתאמן
  -- יצלם שוב. משם חוזרים ל-'pending' בשליחה נוספת, ולכן זה לא מצב סופי.
  initial_check_status TEXT NOT NULL DEFAULT 'not_ready'
    CHECK (initial_check_status IN ('not_ready','pending','approved','returned')),
  initial_check_reported_at TEXT,
  initial_check_decided_at TEXT,
  -- מה איתי כתב כשהחזיר. מתאפס בשליחה הבאה, אחרת המתאמן ימשיך לראות
  -- הערה על תיקון שהוא כבר ביצע.
  initial_check_note TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);

-- ── אימון שהושלם ─────────────────────────────────────────────────────────
-- pain_level: 0..10, נרשם רק כשהמתאמן במצב שיקום. מאמן FITAY רואה את זה בדשבורד.
CREATE TABLE IF NOT EXISTS completions (
  id           TEXT PRIMARY KEY,
  trainee_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id   TEXT NOT NULL,
  workout_id   TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  duration_sec INTEGER,
  mood         TEXT,
  pain_level   INTEGER CHECK (pain_level BETWEEN 0 AND 10),
  notes        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_completions_trainee ON completions(trainee_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_completions_trainee_program_completed
  ON completions(trainee_id, program_id, completed_at);

-- ── סט שבוצע בפועל — הבסיס להתקדמות בטווח ───────────────────────────────
-- בלי הרישום הזה אי אפשר לדעת מה עשית פעם שעברה, ובלי זה אין מה להשוות.
-- כל השורות של אימון אחד חולקות אותו logged_at — ככה מקבצים "הפעם הקודמת".
-- side: 'weak' | 'strong' בתרגילים חד־צדדיים, אחרת NULL.
-- difficulty_step: באיזו דרגת קושי בוצע הסט. כל הקשיה של התרגיל מעלה את
--   הדרגה, וההשוואה לפעם הקודמת נעשית רק בתוך אותה דרגה — חזרות בטבעות
--   נמוכות אינן אותו הישג כמו חזרות בגבוהות.
-- recovery: הסט בוצע באימון התאוששות (חצי סטים). לא נכנס להשוואות.
CREATE TABLE IF NOT EXISTS set_logs (
  id              TEXT PRIMARY KEY,
  trainee_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id      TEXT NOT NULL,
  workout_item_id TEXT NOT NULL,
  exercise_id     TEXT NOT NULL,
  set_number      INTEGER NOT NULL,
  reps            INTEGER,
  seconds         INTEGER,
  side            TEXT,
  difficulty_step INTEGER NOT NULL DEFAULT 0,
  recovery        INTEGER NOT NULL DEFAULT 0,
  logged_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_setlogs_item
  ON set_logs(trainee_id, workout_item_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_setlogs_workout ON set_logs(workout_id);

-- ── מצב ההתקדמות של תרגיל אצל מתאמן ─────────────────────────────────────
-- שורה לכל תרגיל בריצה של תוכנית. difficulty_step סופר כמה פעמים התרגיל
-- הוקשה, ו-advice היא ההנחיה שתוצג באימון הבא:
--   'harder'    — עבר את התקרה בכל הסטים. להקשות ולהתחיל מתחתית הטווח.
--   'drop-band' — עבר את התקרה בכל הסטים עם גומייה. לנסות בלי.
--   'easier'    — שני אימונים בלי התקדמות. לרדת לתחתית הטווח ולטפס מחדש.
--   ''          — אין הנחיה.
-- stall_count סופר אימונים רצופים בלי שיפור באותה דרגה. ההערכה רצה בשרת
-- בסיום אימון (progression.ts), בלי מגע של המאמן.
-- המפתח הוא הריצה (assignment) ולא המתאמן: שיוך חוזר של אותה תוכנית
-- מתחיל את הסולם מאפס, וההיסטוריה של הריצה הקודמת נשארת שלמה.
CREATE TABLE IF NOT EXISTS item_progress (
  assignment_id   TEXT NOT NULL,
  workout_item_id TEXT NOT NULL,
  difficulty_step INTEGER NOT NULL DEFAULT 0,
  advice          TEXT NOT NULL DEFAULT ''
                    CHECK (advice IN ('', 'harder', 'drop-band', 'easier')),
  stall_count     INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (assignment_id, workout_item_id)
);

-- ── סרטונים ──────────────────────────────────────────────────────────────
-- הקבצים יושבים ב-Vercel Blob (גדולים מדי ל-GitHub). כאן רק הקטלוג:
-- מה הועלה, לאיזו כתובת, ובאיזו תווית מזהים אותו ב-FITAY.
-- hash מונע העלאה כפולה של אותו קובץ בשם אחר.
CREATE TABLE IF NOT EXISTS videos (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  url         TEXT NOT NULL,
  hash        TEXT UNIQUE,
  size        INTEGER,
  label       TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL,
  poster_url  TEXT
);
CREATE INDEX IF NOT EXISTS idx_videos_url ON videos(url);

-- ── סרטוני בדיקת פתיחה ───────────────────────────────────────────────────
-- קליפ שהמתאמן מצלם לכל אחד מארבעת התרגילים הראשונים, כדי שאיתי יראה
-- ביצוע לפני שהוא פותח את שאר התוכנית.
--
-- טבלה נפרדת מ-videos בכוונה. שם יושבת ספריית ההדגמות של איתי, ועליה
-- מכונת מצבים של דחיסה ופוסטרים. קליפ של מתאמן שהיה נכנס לשם היה נכנס
-- גם לתור הדחיסה וגם למסכי הווידאו של המאמן.
--
-- הקישור הוא ל-assignment_id ולא לצמד מתאמן+תוכנית: שיוך חוזר פותח ריצה
-- חדשה, וקישור לפי תוכנית היה גורר לתוכה קליפים של ריצה ישנה.
--
-- אלה קבצים זמניים. הם נמחקים ברגע שאיתי מאשר, וזה מה שהמסך מבטיח למתאמן.
-- אין כאן REFERENCES ל-assignments בכוונה. הטבלה הזאת נוצרת ב-SCHEMA, שרץ
-- לפני migrateAssignmentsToRuns, ובמסד ותיק עמודת assignments.id עדיין לא
-- קיימת באותו רגע. חוץ מזה המיגרציה ההיא בונה את assignments מחדש, ומפתח
-- זר שמצביע לטבלה שנמחקת ונוצרת מחדש הוא בדיוק סוג הדבר שנשבר בשקט.
-- מחיקת ה-blob ממילא לא יכולה להישען על מחיקה מדורגת: היא חייבת לקרוא את
-- הכתובת לפני שהשורה נעלמת. הניקוי היתום נאסף ב-cron.
-- הוצאה משימוש ב-7 באוגוסט 2026. בדיקת הפתיחה ירדה והבדיקה עברה לסוף
-- התוכנית, אל level_check_videos. ההגדרה נשארת כאן כדי לא להפיל מסד קיים,
-- ואף קוד לא קורא ממנה יותר. אין להוסיף עליה שימוש חדש.
CREATE TABLE IF NOT EXISTS initial_check_videos (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  exercise_id   TEXT NOT NULL,
  url           TEXT NOT NULL,
  size          INTEGER,
  uploaded_at   TEXT NOT NULL,
  -- מתי איתי סימן שדווקא את התרגיל הזה צריך לצלם מחדש. ריק כשהכל בסדר,
  -- ומתאפס בהחלפת הקליפ. כל עוד יש כאן ערך, השליחה החוזרת חסומה: החזרה
  -- שאפשר לשלוח ממנה בלי לגעת בכלום היא לא באמת החזרה.
  redo_requested_at TEXT,
  -- צילום מחדש של תרגיל בודד מחליף את השורה במקום להוסיף שנייה.
  UNIQUE (assignment_id, exercise_id)
);
CREATE INDEX IF NOT EXISTS idx_icv_assignment ON initial_check_videos(assignment_id);

-- ── בקשות מעבר רמה ───────────────────────────────────────────────────────
-- לפי FITAY: המתאמן מסיים רמה, שולח בקשה, והמאמן מאשר. המטרה ברורה,
-- שלא ירוצו לרמה הבאה לפני שהם יציבים בנוכחית.
--
-- status: 'pending' | 'approved' | 'declined' | 'returned'
--   'returned' הוא החזרה לביצוע חוזר: איתי צפה בסרטונים ורוצה שהמתאמן
--   יצלם שוב. זה לא מצב סופי, והמתאמן שולח בקשה חדשה אחרי שהחליף. האינדקס
--   הייחודי החלקי חל רק על 'pending', ולכן בקשה מוחזרת לא חוסמת בקשה חדשה.
-- from_program_id: הרמה שהוא מסיים. הרמה הבאה נבחרת על ידי המאמן באישור,
--                  ולכן לא נשמרת כאן מראש.
-- note: מה שהמתאמן כתב. coach_note: מה שאיתי כתב כשהחזיר. שני שדות ולא
--       אחד, אחרת ההחזרה דורסת את מה שהמתאמן סיפר.
CREATE TABLE IF NOT EXISTS level_requests (
  id              TEXT PRIMARY KEY,
  trainee_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','declined','returned')),
  note            TEXT NOT NULL DEFAULT '',
  coach_note      TEXT NOT NULL DEFAULT '',
  requested_at    TEXT NOT NULL,
  decided_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_level_requests_status
  ON level_requests(status, requested_at);
-- בקשה פתוחה אחת בלבד לכל מתאמן ורמה. בלי זה לחיצה כפולה יוצרת שתי בקשות.
CREATE UNIQUE INDEX IF NOT EXISTS idx_level_requests_open
  ON level_requests(trainee_id, from_program_id) WHERE status = 'pending';

-- ── סרטוני בדיקת סיום רמה ────────────────────────────────────────────────
-- קליפ שהמתאמן מצלם לכל אחד מארבעת התרגילים הראשונים בתוכנית, אחרי שהוא
-- השלים את כל האימונים. איתי צופה בהם כשהוא מחליט על המעבר לרמה הבאה.
--
-- טבלה נפרדת מ-videos בכוונה. שם יושבת ספריית ההדגמות של איתי, ועליה
-- מכונת מצבים של דחיסה ופוסטרים. קליפ של מתאמן שהיה נכנס לשם היה נכנס
-- גם לתור הדחיסה וגם למסכי הווידאו של המאמן.
--
-- הקישור הוא ל-assignment_id ולא ל-level_requests.id, כי המתאמן מצלם לפני
-- שהבקשה קיימת. הריצה היא מה שחי לכל אורך התהליך.
--
-- אלה קבצים זמניים. הם נמחקים ברגע שאיתי מאשר את המעבר, וזה מה שהמסך
-- מבטיח למתאמן.
CREATE TABLE IF NOT EXISTS level_check_videos (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  exercise_id   TEXT NOT NULL,
  url           TEXT NOT NULL,
  size          INTEGER,
  uploaded_at   TEXT NOT NULL,
  -- מתי איתי סימן שדווקא את התרגיל הזה צריך לצלם מחדש. ריק כשהכל בסדר,
  -- ומתאפס בהחלפת הקליפ. כל עוד יש כאן ערך, השליחה החוזרת חסומה.
  redo_requested_at TEXT,
  -- צילום מחדש של תרגיל בודד מחליף את השורה במקום להוסיף שנייה.
  UNIQUE (assignment_id, exercise_id)
);
CREATE INDEX IF NOT EXISTS idx_lcv_assignment ON level_check_videos(assignment_id);

-- ── מנויי התראות ─────────────────────────────────────────────────────────
-- שורה לכל מכשיר, לא לכל משתמש. מאמן FITAY פותח את האפליקציה גם בטלפון וגם
-- במחשב, ושתי ההרשמות צריכות לחיות במקביל.
-- endpoint הוא המזהה שהדפדפן מנפיק, והוא ייחודי לכל מכשיר.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- ── תוכן מסך המדריך ──────────────────────────────────────────────────────
-- הטקסט של המדריך היה קבוע בקוד, ולכן תיקון מילה חייב מפתח. כאן הוא
-- הופך לנתון שמאמן FITAY עורך מהמסך.
--
-- kind: 'intro' | 'rule' | 'question'
--   intro    — פסקת הפתיחה. שורה אחת בלבד, והטקסט יושב ב-body.
--   rule     — אחד מארבעת הכללים. title, body, ו-extra לניסוח הקצר בכרטיס.
--   question — שאלה נפוצה. title היא השאלה ו-body היא התשובה.
--
-- הכללים הם ארבעה קבועים, כי לכל אחד יש אייקון לפי מיקומו במסך. השאלות
-- פתוחות להוספה, מחיקה וסידור מחדש.
CREATE TABLE IF NOT EXISTS method_content (
  id       TEXT PRIMARY KEY,
  kind     TEXT NOT NULL CHECK (kind IN ('intro','rule','question')),
  position INTEGER NOT NULL DEFAULT 0,
  title    TEXT NOT NULL DEFAULT '',
  body     TEXT NOT NULL DEFAULT '',
  extra    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_method_kind ON method_content(kind, position);

-- ── מתחים ציבוריים ───────────────────────────────────────────────────────
-- איפה לתלות את הטבעות. מתאמן ברחוב צריך מוט אופקי גבוה מספיק, וזה
-- הדבר היחיד שעוצר אותו מלהתאמן במקום שהוא נמצא בו.
--
-- source מפריד בין שני עולמות שחייבים לחיות באותה טבלה ולא להתערבב:
--   'osm'  — יובא מ-OpenStreetMap ב-spots-sync. שורות שהסקריפט מעדכן.
--   'user' — נוסף מתוך האפליקציה. הסקריפט אסור שיגע בשורות האלה לעולם.
-- ההפרדה הזאת היא בדיוק מה שחסר ב-exercises, ושם sync דורס עריכות.
--
-- rings_claim מול rings_ok: מתאמן מדווח, איתי מאשר. שני שדות ולא אחד,
-- כי דיווח של מי שעבר שם במקרה ואישור של מאמן הם לא אותה הבטחה. התג
-- הירוק במסך תלוי ב-rings_ok בלבד.
--
-- hidden ולא מחיקה. מתח שפורק או שהתברר כלא מתאים מפסיק להופיע, והשורה
-- נשארת כדי שהסנכרון הבא לא יחזיר אותה מ-OSM כאילו כלום.
CREATE TABLE IF NOT EXISTS spots (
  id          TEXT PRIMARY KEY,
  -- 'osm' ו-'gov' הם שני מקורות מיובאים, ולכל אחד סקריפט משלו שנוגע רק
  -- בשורות שלו. 'user' הוא מה שנוסף מתוך האפליקציה, ואף סקריפט לא נוגע בו.
  source      TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('osm','user','gov')),
  -- ריק בשורות שנוספו מהאפליקציה. SQLite מרשה כמה NULL תחת UNIQUE, ולכן
  -- זה עדיין המפתח שה-upsert של הסנכרון נשען עליו.
  osm_id      TEXT UNIQUE,
  -- "מספר זיהוי" מהמאגר הממשלתי. אותו תפקיד בדיוק כמו osm_id, למקור השני.
  gov_id      TEXT,
  name        TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  rings_claim INTEGER NOT NULL DEFAULT 0,
  rings_ok    INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT NOT NULL DEFAULT '',
  -- מי הוסיף. נשמר כדי שאיתי יידע את מי לשאול, ולא מוצג לאף אחד אחר:
  -- רשימת מתחים עם שמות מסגירה איפה מתאמנים גרים.
  added_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
-- החיפוש הוא תמיד תיבה סביב נקודה, ולכן אינדקס על שתי הקואורדינטות.
CREATE INDEX IF NOT EXISTS idx_spots_box ON spots(lat, lng);

-- מצב ההתראות הטכניות למפתח בלבד. אין כאן שמות או נתוני אימון.
-- ── ימי אימון שהמתאמן סימן לעצמו ─────────────────────────────────────────
-- תזכורת אישית בלבד. אין כאן workout_id ולא program_id בכוונה: היום אומר
-- *מתי*, ולא איזה אימון. שיוך אימון ליום היה יוצר תשובה שנייה לשאלה מה
-- עושים היום, והיא הייתה מתחרה בבחירת "הבא בתור" שנקבעת לפי מה שבוצע הכי
-- מעט פעמים.
--
-- day הוא YYYY-MM-DD לפי השעון של המתאמן ולא לפי UTC. מתאמן שמסמן אימון
-- בערב היה מקבל אחרת את היום שאחריו.
--
-- המאמן רואה את הימים המסומנים בשורה בכרטיס המתאמן, קריאה בלבד. זו החלטה
-- של אביב מ-7 באוגוסט 2026: הסימון אינו פרטי, והמתאמן צריך לדעת את זה.
-- איתי לא יכול לסמן או לשנות, כי היום שייך למתאמן.
CREATE TABLE IF NOT EXISTS training_days (
  trainee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  PRIMARY KEY (trainee_id, day)
);

CREATE TABLE IF NOT EXISTS developer_alerts (
  key              TEXT PRIMARY KEY,
  value            TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 0
);
`;

/**
 * הוספת עמודות לטבלה קיימת.
 *
 * SQLite לא מכיר ADD COLUMN IF NOT EXISTS, ולכן ההרצה החוזרת נשענת על
 * בליעת השגיאה "duplicate column name" בלבד. כל שגיאה אחרת נזרקת הלאה,
 * אחרת מיגרציה שבורה הייתה עוברת בשקט.
 */
const COLUMN_MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  {
    table: "videos",
    column: "poster_url",
    ddl: "ALTER TABLE videos ADD COLUMN poster_url TEXT",
  },
  // הדחיסה של סרטון שהועלה מהדפדפן רצה בשרת אחרי ההעלאה, ולכן צריך
  // לזכור באיזה שלב כל קליפ נמצא. 'done' כברירת מחדל, כדי שהקליפים
  // שהומרו כבר במחשב לא ייכנסו לתור מחדש.
  {
    table: "videos",
    column: "compress_state",
    ddl: "ALTER TABLE videos ADD COLUMN compress_state TEXT NOT NULL DEFAULT 'done'",
  },
  // הקובץ המקורי נשמר גם אחרי הדחיסה. הוא לא נמחק, רק מפסיק להיות
  // זה שמוגש למתאמן.
  {
    table: "videos",
    column: "original_url",
    ddl: "ALTER TABLE videos ADD COLUMN original_url TEXT",
  },
  {
    table: "videos",
    column: "original_size",
    ddl: "ALTER TABLE videos ADD COLUMN original_size INTEGER",
  },
  {
    table: "videos",
    column: "compress_attempts",
    ddl: "ALTER TABLE videos ADD COLUMN compress_attempts INTEGER NOT NULL DEFAULT 0",
  },
  {
    table: "videos",
    column: "compress_error",
    ddl: "ALTER TABLE videos ADD COLUMN compress_error TEXT NOT NULL DEFAULT ''",
  },
  // מתי הפעלה כלשהי לקחה את הקליפ לדחיסה. מונע משתי הפעלות שרצות בו זמנית
  // לדחוס את אותו קובץ. ריק כשאף אחד לא עובד עליו, וערך ישן נחשב נטוש
  // ומותר לקחת שוב. ראה LEASE_MS ב-video-compress.ts.
  {
    table: "videos",
    column: "compress_started_at",
    ddl: "ALTER TABLE videos ADD COLUMN compress_started_at TEXT",
  },
  // מתי נשלחה למתאמן התזכורת האחרונה על היעדרות. בלי זה ה-cron היה שולח
  // את אותה תזכורת בכל הרצה, וזו הדרך הבטוחה לגרום למישהו לכבות התראות.
  {
    table: "users",
    column: "absent_notified_at",
    ddl: "ALTER TABLE users ADD COLUMN absent_notified_at TEXT",
  },
  // האם מותר לבצע את התרגיל בעזרת גומיית התנגדות. מאמן FITAY מסמן את זה פעם
  // אחת בספריית התרגילים, ומשם זה חל על כל התוכניות.
  {
    table: "exercises",
    column: "band_allowed",
    ddl: "ALTER TABLE exercises ADD COLUMN band_allowed INTEGER NOT NULL DEFAULT 0",
  },
  // האם הסט הזה בוצע עם גומייה.
  //
  // זה הלב של העניין ולא קישוט: כל השיטה בנויה על השוואה לפעם הקודמת.
  // עשר חזרות עם גומייה ועשר בלעדיה אינן אותו הישג, ובלי הסימון הזה
  // המסך היה מציג למתאמן מספר שמשקר לו.
  {
    table: "set_logs",
    column: "banded",
    ddl: "ALTER TABLE set_logs ADD COLUMN banded INTEGER NOT NULL DEFAULT 0",
  },
  {
    table: "assignments",
    column: "sessions_per_week",
    ddl: "ALTER TABLE assignments ADD COLUMN sessions_per_week INTEGER",
  },
  {
    table: "assignments",
    column: "target_sessions",
    ddl: "ALTER TABLE assignments ADD COLUMN target_sessions INTEGER NOT NULL DEFAULT 24",
  },
  {
    table: "assignments",
    column: "status",
    ddl: "ALTER TABLE assignments ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
  },
  {
    table: "assignments",
    column: "initial_check_status",
    ddl: "ALTER TABLE assignments ADD COLUMN initial_check_status TEXT NOT NULL DEFAULT 'not_ready'",
  },
  {
    table: "assignments",
    column: "initial_check_reported_at",
    ddl: "ALTER TABLE assignments ADD COLUMN initial_check_reported_at TEXT",
  },
  {
    table: "assignments",
    column: "initial_check_decided_at",
    ddl: "ALTER TABLE assignments ADD COLUMN initial_check_decided_at TEXT",
  },
  {
    table: "assignments",
    column: "completed_at",
    ddl: "ALTER TABLE assignments ADD COLUMN completed_at TEXT",
  },
  // חייבת לרוץ לפני migrateInitialCheckReturned, שמעתיק את העמודה הזאת
  // בשם אל הטבלה הבנויה מחדש.
  {
    table: "assignments",
    column: "initial_check_note",
    ddl: "ALTER TABLE assignments ADD COLUMN initial_check_note TEXT NOT NULL DEFAULT ''",
  },
  // נוספה אחרי שהטבלה כבר עלתה לאוויר, ולכן חייבת גם מיגרציה ולא רק
  // הופעה בהגדרת הטבלה.
  {
    table: "initial_check_videos",
    column: "redo_requested_at",
    ddl: "ALTER TABLE initial_check_videos ADD COLUMN redo_requested_at TEXT",
  },
  // חייבת לרוץ לפני migrateLevelRequestReturned, שמעתיקה את העמודה בשם
  // אל הטבלה הבנויה מחדש.
  {
    table: "level_requests",
    column: "coach_note",
    ddl: "ALTER TABLE level_requests ADD COLUMN coach_note TEXT NOT NULL DEFAULT ''",
  },
  {
    table: "level_check_videos",
    column: "redo_requested_at",
    ddl: "ALTER TABLE level_check_videos ADD COLUMN redo_requested_at TEXT",
  },
  {
    table: "developer_alerts",
    column: "occurrence_count",
    ddl: "ALTER TABLE developer_alerts ADD COLUMN occurrence_count INTEGER NOT NULL DEFAULT 0",
  },
  // המקור השני למתחים. חייבת לרוץ לפני migrateSpotsGovSource, שבונה את
  // הטבלה מחדש ומעתיקה את העמודה הזאת בשם.
  {
    table: "spots",
    column: "gov_id",
    ddl: "ALTER TABLE spots ADD COLUMN gov_id TEXT",
  },
  // תחתית טווח העבודה. NULL = ברירת מחדל של 60 אחוז מהתקרה, מחושבת בזמן
  // קריאה — בכוונה אין כאן UPDATE שממלא ערכים, כדי שלא יהיו שני מקורות אמת.
  {
    table: "workout_items",
    column: "target_min",
    ddl: "ALTER TABLE workout_items ADD COLUMN target_min INTEGER",
  },
  // ההיסטוריה הקיימת כולה בדרגה 0 — זה נכון עובדתית: אף תרגיל עוד לא הוקשה.
  {
    table: "set_logs",
    column: "difficulty_step",
    ddl: "ALTER TABLE set_logs ADD COLUMN difficulty_step INTEGER NOT NULL DEFAULT 0",
  },
  {
    table: "set_logs",
    column: "recovery",
    ddl: "ALTER TABLE set_logs ADD COLUMN recovery INTEGER NOT NULL DEFAULT 0",
  },
];

async function runColumnMigrations() {
  for (const m of COLUMN_MIGRATIONS) {
    try {
      await db.execute(m.ddl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/duplicate column name/i.test(message)) throw err;
    }
  }
}

/**
 * מעבר של assignments משורה אחת לכל צמד מתאמן+תוכנית לשורה לכל ריצה.
 *
 * המפתח המשולב הישן הגביל כל מתאמן לשורה אחת בכל תוכנית, ולכן שיוך חוזר
 * דרס את הריצה הקודמת וההיסטוריה נעלמה. SQLite לא יודע להסיר PRIMARY KEY
 * בשינוי טבלה, ולכן צריך לבנות מחדש ולהעתיק.
 *
 * הזיהוי הוא לפי קיום עמודת id, ולכן ההרצה החוזרת לא עושה כלום.
 */
async function migrateAssignmentsToRuns() {
  const info = await db.execute("PRAGMA table_info(assignments)");
  if (info.rows.some((row) => String(row.name) === "id")) return;

  await db.batch(
    [
      // שריד של הרצה קודמת שנקטעה באמצע. בלי זה היצירה למטה תיפול.
      "DROP TABLE IF EXISTS assignments_new",
      `CREATE TABLE assignments_new (
         id          TEXT PRIMARY KEY,
         trainee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         program_id  TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
         assigned_at TEXT NOT NULL,
         sessions_per_week INTEGER CHECK (sessions_per_week IN (3,4)),
         target_sessions INTEGER NOT NULL DEFAULT 24,
         status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
         initial_check_status TEXT NOT NULL DEFAULT 'not_ready'
           CHECK (initial_check_status IN ('not_ready','pending','approved')),
         initial_check_reported_at TEXT,
         initial_check_decided_at TEXT,
         completed_at TEXT
       )`,
      `INSERT INTO assignments_new
         (id, trainee_id, program_id, assigned_at, sessions_per_week, target_sessions,
          status, initial_check_status, initial_check_reported_at,
          initial_check_decided_at, completed_at)
       SELECT lower(hex(randomblob(16))), trainee_id, program_id, assigned_at,
              sessions_per_week, target_sessions, status, initial_check_status,
              initial_check_reported_at, initial_check_decided_at, completed_at
         FROM assignments`,
      "DROP TABLE assignments",
      "ALTER TABLE assignments_new RENAME TO assignments",
    ],
    "write"
  );
}

/**
 * פתיחת האילוץ על initial_check_status כדי שיקבל גם 'returned'.
 *
 * ALTER TABLE ADD COLUMN לא עוזר כאן: העמודה כבר קיימת, ומה שצריך להשתנות
 * הוא ה-CHECK שעליה. SQLite לא יודע לשנות אילוץ על עמודה קיימת, ולכן זו
 * בנייה מחדש והעתקה, באותו דפוס של migrateAssignmentsToRuns.
 *
 * הזיהוי הוא לפי הופעת 'returned' בהגדרת הטבלה, ולכן ההרצה החוזרת לא עושה
 * כלום. חייבת לרוץ אחרי migrateAssignmentsToRuns, שמוסיפה את עמודת id.
 */
async function migrateInitialCheckReturned() {
  const definition = await db.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'assignments'",
    args: [],
  });
  const ddl = String(definition.rows[0]?.sql ?? "");
  // מסד חדש נוצר כבר עם הערך, ומסד שעבר את המיגרציה הזאת גם.
  if (!ddl || ddl.includes("'returned'")) return;

  await db.batch(
    [
      // שריד של הרצה קודמת שנקטעה באמצע.
      "DROP TABLE IF EXISTS assignments_check_new",
      `CREATE TABLE assignments_check_new (
         id          TEXT PRIMARY KEY,
         trainee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         program_id  TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
         assigned_at TEXT NOT NULL,
         sessions_per_week INTEGER CHECK (sessions_per_week IN (3,4)),
         target_sessions INTEGER NOT NULL DEFAULT 24,
         status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
         initial_check_status TEXT NOT NULL DEFAULT 'not_ready'
           CHECK (initial_check_status IN ('not_ready','pending','approved','returned')),
         initial_check_reported_at TEXT,
         initial_check_decided_at TEXT,
         initial_check_note TEXT NOT NULL DEFAULT '',
         completed_at TEXT
       )`,
      `INSERT INTO assignments_check_new
         (id, trainee_id, program_id, assigned_at, sessions_per_week, target_sessions,
          status, initial_check_status, initial_check_reported_at,
          initial_check_decided_at, initial_check_note, completed_at)
       SELECT id, trainee_id, program_id, assigned_at, sessions_per_week,
              target_sessions, status, initial_check_status,
              initial_check_reported_at, initial_check_decided_at,
              initial_check_note, completed_at
         FROM assignments`,
      "DROP TABLE assignments",
      "ALTER TABLE assignments_check_new RENAME TO assignments",
    ],
    "write"
  );
}

/**
 * פתיחת האילוץ על level_requests.status כדי שיקבל גם 'returned'.
 *
 * אותו סיפור כמו migrateInitialCheckReturned: העמודה קיימת, מה שצריך
 * להשתנות הוא ה-CHECK שעליה, ו-SQLite לא יודע לשנות אילוץ על עמודה קיימת.
 * בנייה מחדש והעתקה.
 *
 * הזיהוי לפי הופעת 'returned' בהגדרת הטבלה, ולכן ההרצה החוזרת לא עושה כלום.
 */
async function migrateLevelRequestReturned() {
  const definition = await db.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'level_requests'",
    args: [],
  });
  const ddl = String(definition.rows[0]?.sql ?? "");
  if (!ddl || ddl.includes("'returned'")) return;

  await db.batch(
    [
      "DROP TABLE IF EXISTS level_requests_new",
      `CREATE TABLE level_requests_new (
         id              TEXT PRIMARY KEY,
         trainee_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         from_program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
         status          TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','declined','returned')),
         note            TEXT NOT NULL DEFAULT '',
         coach_note      TEXT NOT NULL DEFAULT '',
         requested_at    TEXT NOT NULL,
         decided_at      TEXT
       )`,
      `INSERT INTO level_requests_new
         (id, trainee_id, from_program_id, status, note, coach_note,
          requested_at, decided_at)
       SELECT id, trainee_id, from_program_id, status, note, coach_note,
              requested_at, decided_at
         FROM level_requests`,
      "DROP TABLE level_requests",
      "ALTER TABLE level_requests_new RENAME TO level_requests",
    ],
    "write"
  );
}

/**
 * פתיחת האילוץ על spots.source כדי שיקבל גם 'gov'.
 *
 * אותו דפוס של migrateLevelRequestReturned: העמודה קיימת, מה שצריך
 * להשתנות הוא ה-CHECK שעליה, ו-SQLite לא יודע לשנות אילוץ קיים.
 *
 * הרקע: OpenStreetMap ממופה בידי מתנדבים והכיסוי שלו חלש מחוץ למרכז.
 * ביהוד, למשל, כמעט אין בו כלום בזמן שבפועל יש שם מתקנים בכמה גנים.
 * המאגר הממשלתי מדווח בידי הרשויות ולכן משלים בדיוק את החסר, וכל מקור
 * מיובא צריך ערך משלו כדי שסקריפט אחד לא ידרוס את השורות של השני.
 *
 * הזיהוי לפי הופעת 'gov' בהגדרת הטבלה, ולכן ההרצה החוזרת לא עושה כלום.
 * חייבת לרוץ אחרי runColumnMigrations, שמוסיפה את gov_id למסד ותיק.
 */
async function migrateSpotsGovSource() {
  const definition = await db.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'spots'",
    args: [],
  });
  const ddl = String(definition.rows[0]?.sql ?? "");
  if (!ddl || ddl.includes("'gov'")) return;

  await db.batch(
    [
      // שריד של הרצה קודמת שנקטעה באמצע.
      "DROP TABLE IF EXISTS spots_new",
      `CREATE TABLE spots_new (
         id          TEXT PRIMARY KEY,
         source      TEXT NOT NULL DEFAULT 'user'
                       CHECK (source IN ('osm','user','gov')),
         osm_id      TEXT UNIQUE,
         gov_id      TEXT,
         name        TEXT NOT NULL DEFAULT '',
         city        TEXT NOT NULL DEFAULT '',
         lat         REAL NOT NULL,
         lng         REAL NOT NULL,
         rings_claim INTEGER NOT NULL DEFAULT 0,
         rings_ok    INTEGER NOT NULL DEFAULT 0,
         verified_at TEXT,
         verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
         note        TEXT NOT NULL DEFAULT '',
         added_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
         hidden      INTEGER NOT NULL DEFAULT 0,
         created_at  TEXT NOT NULL
       )`,
      `INSERT INTO spots_new
         (id, source, osm_id, gov_id, name, city, lat, lng, rings_claim,
          rings_ok, verified_at, verified_by, note, added_by, hidden, created_at)
       SELECT id, source, osm_id, gov_id, name, city, lat, lng, rings_claim,
              rings_ok, verified_at, verified_by, note, added_by, hidden, created_at
         FROM spots`,
      "DROP TABLE spots",
      "ALTER TABLE spots_new RENAME TO spots",
    ],
    "write"
  );
}

// בניית spots מחדש מוחקת את האינדקסים שלה, ו-gov_id קיים במסד ותיק רק
// אחרי מיגרציית העמודות. שניהם רצים אחרי, ולא ב-SCHEMA.
//
// האינדקס על gov_id הוא ייחודי ומלא, ולא ייחודי חלקי על השורות שיש בהן
// ערך. SQLite ממילא סופר כל NULL כערך נפרד תחת UNIQUE, ולכן אין הבדל
// בהתנהגות, אבל ON CONFLICT(gov_id) לא מתאים לאינדקס חלקי בלי לחזור על
// תנאי ה-WHERE שלו, וזה בדיוק סוג הפרט שנשכח בשאילתה הבאה. זאת גם אותה
// צורה שבה osm_id מוגדר.
const SPOTS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_spots_box ON spots(lat, lng);
DROP INDEX IF EXISTS idx_spots_gov_partial;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spots_gov ON spots(gov_id);
`;

// בנייה מחדש של הטבלה מוחקת גם את האינדקסים שלה, ולכן הם נוצרים שוב אחרי
// המיגרציה ולא רק ב-SCHEMA שרץ לפניה.
const LEVEL_REQUEST_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_level_requests_status
  ON level_requests(status, requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_level_requests_open
  ON level_requests(trainee_id, from_program_id) WHERE status = 'pending';
`;

// האינדקסים יושבים כאן ולא ב-SCHEMA כי הם נשענים על עמודת status, שנוספת
// למסד ותיק רק במיגרציית העמודות שרצה אחרי SCHEMA.
const ASSIGNMENT_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_active
  ON assignments(trainee_id, program_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_assignments_trainee
  ON assignments(trainee_id, status);
`;

export async function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const version = await db.execute(
          "SELECT value FROM schema_meta WHERE key = 'version'"
        );
        if (String(version.rows[0]?.value ?? "") === String(SCHEMA_VERSION)) {
          return;
        }
      } catch {
        // A fresh database has no schema_meta table yet; bootstrap it below.
      }

      await db.executeMultiple(SCHEMA);
      await runColumnMigrations();
      await migrateAssignmentsToRuns();
      await migrateInitialCheckReturned();
      await migrateLevelRequestReturned();
      // אחרי המיגרציות, כי בנייה מחדש של טבלה מוחקת גם את האינדקסים שלה.
      await migrateSpotsGovSource();
      await db.executeMultiple(ASSIGNMENT_INDEXES);
      await db.executeMultiple(LEVEL_REQUEST_INDEXES);
      await db.executeMultiple(SPOTS_INDEXES);
      await db.execute({
        sql: "INSERT INTO schema_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        args: [String(SCHEMA_VERSION)],
      });
    })().catch((err) => {
      initPromise = null; // let the next request retry instead of caching the failure
      throw err;
    });
  }
  return initPromise;
}

export default db;
