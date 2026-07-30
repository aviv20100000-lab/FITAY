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
const SCHEMA_VERSION = 8;

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
-- weeks: התוכנית תוכננה ל-8 שבועות, אבל ניתן לשינוי.
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
-- phase: 1 או 2 — כל רמה מחולקת לשני שלבים, מינימום 4 שבועות כל אחד.
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
CREATE TABLE IF NOT EXISTS workout_items (
  id          TEXT PRIMARY KEY,
  workout_id  TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  position    INTEGER NOT NULL DEFAULT 0,
  sets        INTEGER NOT NULL DEFAULT 3,
  reps        INTEGER,
  seconds     INTEGER,
  rest        INTEGER NOT NULL DEFAULT 60,
  ring_height TEXT,
  body_angle  TEXT,
  video_file  TEXT,
  notes       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_items_workout ON workout_items(workout_id);

-- ── שיוך תוכנית למתאמן ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  trainee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id  TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (trainee_id, program_id)
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

-- ── סט שבוצע בפועל — הלב של נוהל הצבירה ─────────────────────────────────
-- בלי הרישום הזה אי אפשר לדעת מה עשית פעם שעברה, ובלי זה אין צבירה.
-- כל השורות של אימון אחד חולקות אותו logged_at — ככה מקבצים "הפעם הקודמת".
-- side: 'weak' | 'strong' בתרגילים חד־צדדיים, אחרת NULL.
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
  logged_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_setlogs_item
  ON set_logs(trainee_id, workout_item_id, logged_at);

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
  uploaded_at TEXT NOT NULL
);

-- ── בקשות מעבר רמה ───────────────────────────────────────────────────────
-- לפי FITAY: המתאמן מסיים רמה, שולח בקשה, והמאמן מאשר. המטרה ברורה,
-- שלא ירוצו לרמה הבאה לפני שהם יציבים בנוכחית.
--
-- status: 'pending' | 'approved' | 'declined'
-- from_program_id: הרמה שהוא מסיים. הרמה הבאה נבחרת על ידי המאמן באישור,
--                  ולכן לא נשמרת כאן מראש.
CREATE TABLE IF NOT EXISTS level_requests (
  id              TEXT PRIMARY KEY,
  trainee_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','declined')),
  note            TEXT NOT NULL DEFAULT '',
  requested_at    TEXT NOT NULL,
  decided_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_level_requests_status
  ON level_requests(status, requested_at);
-- בקשה פתוחה אחת בלבד לכל מתאמן ורמה. בלי זה לחיצה כפולה יוצרת שתי בקשות.
CREATE UNIQUE INDEX IF NOT EXISTS idx_level_requests_open
  ON level_requests(trainee_id, from_program_id) WHERE status = 'pending';

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

-- מצב ההתראות הטכניות למפתח בלבד. אין כאן שמות או נתוני אימון.
CREATE TABLE IF NOT EXISTS developer_alerts (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

export async function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      await db.executeMultiple(SCHEMA);
      await runColumnMigrations();
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
