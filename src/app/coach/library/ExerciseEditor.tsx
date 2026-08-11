"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FitayIcon from "@/components/FitayIcon";
import { useOverlay } from "@/lib/useOverlay";

export type EditableExercise = {
  id: string;
  name: string;
  category: string;
  kind: string;
  /** איך סופרים את הסט: חזרות, החזקה או כמה שאפשר. */
  type: string;
  /** איך התרגיל מתקדם: חזרות, מנח או זמן. ציר נפרד מהמדידה. */
  progression: string;
  tempo: string;
  muscles: string;
  description: string;
  technique: string[];
  tips: string[];
  unilateral: boolean;
  /** האם מותר למתאמן להיעזר בגומייה בתרגיל הזה. */
  bandAllowed: boolean;
  /** כתובת הסרטון המשויך, או null. */
  videoFile: string | null;
  stanceVideoLevel2: string | null;
  stanceVideoLevel3: string | null;
  /** כתובת ההדגמה עם הגומייה, או null. מוצגת רק כשמתג הגומייה דלוק. */
  bandVideoFile: string | null;
  /** בכמה אימונים התרגיל מופיע. מעל אפס, מחיקה חסומה. */
  inUse: number;
};

export type VideoOption = { url: string; filename: string; posterUrl: string | null };

const field: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  color: "var(--text)",
};

const TYPE_LABELS: Record<string, string> = {
  reps: "חזרות",
  hold: "החזקה",
  amrap: "כמה שאפשר",
};

/**
 * ציר ההתקדמות. "מנח" מטפס אל היעד שבתוכנית ואז מקשה את התרגיל, ובשני
 * האחרים המספר ממשיך לעלות בלי תקרה. זה לא נגזר מהמדידה: יש תרגילים
 * שנמדדים בשניות ומתקדמים במנח.
 */
const PROGRESSION_LABELS: Record<string, string> = {
  reps: "חזרות",
  stance: "מנח",
  time: "זמן",
};

/** תרגיל ריק לטופס ההוספה. */
function blank(category: string): EditableExercise {
  return {
    id: "",
    name: "",
    category,
    kind: "strength",
    type: "reps",
    progression: "stance",
    tempo: "30X1",
    muscles: "",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
    bandAllowed: false,
    videoFile: null,
    stanceVideoLevel2: null,
    stanceVideoLevel3: null,
    bandVideoFile: null,
    inUse: 0,
  };
}

/**
 * עריכת ספריית התרגילים.
 *
 * הטקסט שכתוב כאן הוא מה שהמתאמן קורא באמצע האימון, ולכן זה המסך
 * היחיד שבו מאמן FITAY משנה את התוכן המקצועי של התרגיל. שיוך הסרטון
 * נשאר בלשונית הסרטונים, כי שם רואים את הקליפ עצמו.
 */
export default function ExerciseEditor({
  exercises,
  categories,
  videos,
}: {
  exercises: EditableExercise[];
  categories: Record<string, string>;
  videos: VideoOption[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<string | null>(null);

  /**
   * חיפוש וסינון, ברמת תצוגה בלבד.
   *
   * שלושים וחמישה תרגילים ברשימה אחת, וכדי להגיע לאחד צריך לגלול את
   * כולם. ההקלדה מסננת לפי שם, והקטגוריה מצמצמת לקבוצה אחת.
   */
  const needle = query.trim().toLowerCase();
  const filtering = needle !== "" || only !== null;

  // הסדר והרשימה מגיעים מהקטגוריות ולא מהתרגילים, אחרת קטגוריה שהתרוקנה
  // הייתה נעלמת מהמסך ואי אפשר היה להוסיף אליה תרגיל חדש.
  const groups: [string, EditableExercise[]][] = Object.keys(categories)
    .filter((category) => only === null || category === only)
    .map((category) => [
      category,
      exercises.filter(
        (e) =>
          e.category === category &&
          (needle === "" || e.name.toLowerCase().includes(needle))
      ),
    ]);

  // בזמן סינון קטגוריה ריקה פשוט לא מוצגת. בלי סינון היא נשארת, כי שם
  // יושב הכפתור שמוסיף אליה תרגיל ראשון.
  const visible = filtering
    ? groups.filter(([, rows]) => rows.length > 0)
    : groups;

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש תרגיל"
        className="mb-3 w-full rounded-2xl px-4 py-3 text-sm outline-none"
        style={field}
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        <CategoryChip
          label="הכל"
          active={only === null}
          onClick={() => setOnly(null)}
        />
        {Object.entries(categories).map(([key, label]) => (
          <CategoryChip
            key={key}
            label={label}
            active={only === key}
            onClick={() => setOnly(only === key ? null : key)}
          />
        ))}
      </div>

      {filtering && visible.length === 0 && (
        <p
          className="glass rounded-3xl px-5 py-8 text-center text-sm"
          style={{ color: "var(--dim)" }}
        >
          אין תרגיל שמתאים לחיפוש הזה.
        </p>
      )}

      {visible.map(([category, rows]) => (
        <section key={category} className="mb-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p
              className="text-xs font-bold wood-text"
              style={{ letterSpacing: ".14em" }}
            >
              {categories[category] ?? category}
            </p>
            <button
              type="button"
              onClick={() => {
                setAdding(adding === category ? null : category);
                setOpenId(null);
              }}
              className="min-h-11 rounded-lg px-2 text-xs font-bold"
              style={{ color: "var(--wood-1)" }}
            >
              {adding === category ? "ביטול" : "+ תרגיל"}
            </button>
          </div>

          {adding === category && (
            <div className="mb-3">
              <ExerciseForm
                exercise={blank(category)}
                categories={categories}
                videos={videos}
                onDone={() => setAdding(null)}
                onCancel={() => setAdding(null)}
              />
            </div>
          )}

          {rows.length === 0 && adding !== category && (
            <p
              className="glass rounded-3xl px-5 py-6 text-center text-sm"
              style={{ color: "var(--dim)" }}
            >
              אין כאן תרגילים
            </p>
          )}

          <div className="glass rounded-3xl p-1" hidden={rows.length === 0}>
            {rows.map((exercise, index) => (
              <div
                key={exercise.id}
                style={{
                  borderTop: index === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenId(openId === exercise.id ? null : exercise.id)
                  }
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-right"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {exercise.name}
                    </span>
                    <span className="text-xs" style={{ color: "var(--dim)" }}>
                      {exercise.technique.length > 0
                        ? `${exercise.technique.length} הדגשים`
                        : "בלי הדגשים"}
                      {exercise.videoFile ? " · סרטון" : ""}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-lg"
                    style={{ color: "var(--wood-2)" }}
                  >
                    {openId === exercise.id ? "−" : "+"}
                  </span>
                </button>

                {openId === exercise.id && (
                  <div className="px-2 pb-3">
                    <ExerciseForm
                      exercise={exercise}
                      categories={categories}
                      videos={videos}
                      onDone={() => setOpenId(null)}
                      onCancel={() => setOpenId(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** תגית סינון. אותה תגית שכבר קיימת במסכים האחרים, בשני מצבים. */
function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-h-11 rounded-lg px-3 text-xs font-bold"
      style={
        active
          ? {
              background: "var(--wood-wash)",
              border: "1px solid var(--wood-border)",
              color: "var(--wood-1)",
            }
          : {
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              color: "var(--dim)",
            }
      }
    >
      {label}
    </button>
  );
}

function ExerciseForm({
  exercise,
  categories,
  videos,
  onDone,
  onCancel,
}: {
  exercise: EditableExercise;
  categories: Record<string, string>;
  videos: VideoOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const editing = exercise.id !== "";

  const [name, setName] = useState(exercise.name);
  const [category, setCategory] = useState(exercise.category);
  const [type, setType] = useState(exercise.type);
  const [progression, setProgression] = useState(exercise.progression);
  const [tempo, setTempo] = useState(exercise.tempo);
  const [muscles, setMuscles] = useState(exercise.muscles);
  const [description, setDescription] = useState(exercise.description);
  const [technique, setTechnique] = useState(exercise.technique.join("\n"));
  const [tips, setTips] = useState(exercise.tips.join("\n"));
  const [unilateral, setUnilateral] = useState(exercise.unilateral);
  const [bandAllowed, setBandAllowed] = useState(exercise.bandAllowed);
  const [videoFile, setVideoFile] = useState(exercise.videoFile ?? "");
  const [stanceVideoLevel2, setStanceVideoLevel2] = useState(
    exercise.stanceVideoLevel2 ?? ""
  );
  const [stanceVideoLevel3, setStanceVideoLevel3] = useState(
    exercise.stanceVideoLevel3 ?? ""
  );
  const [bandVideoFile, setBandVideoFile] = useState(
    exercise.bandVideoFile ?? ""
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /** שורה בטקסט = פריט ברשימה. זה הרבה יותר מהיר משדות נפרדים בטלפון. */
  const lines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  async function save() {
    setError("");
    setBusy(true);

    const payload = {
      name,
      category,
      kind: exercise.kind,
      type,
      progression,
      tempo,
      muscles,
      description,
      technique: lines(technique),
      tips: lines(tips),
      unilateral,
      bandAllowed,
    };

    let res: Response;
    try {
      res = await fetch("/api/coach/exercises", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // שיוך הסרטון נשלח רק בעריכה. תרגיל חדש נוצר בלי סרטון, ומחברים
        // לו אחד ברגע שהוא כבר קיים בספרייה.
        body: JSON.stringify(
          editing
            ? {
                exerciseId: exercise.id,
                ...payload,
                videoFile: videoFile || null,
                stanceVideoLevel2: stanceVideoLevel2 || null,
                stanceVideoLevel3: stanceVideoLevel3 || null,
                bandVideoFile: bandVideoFile || null,
              }
            : payload
        ),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    onDone();
    router.refresh();
  }

  async function remove() {
    if (!confirm(`למחוק את "${exercise.name}" מהספרייה?`)) return;
    setError("");
    setBusy(true);
    let res: Response;
    try {
      res = await fetch(
        `/api/coach/exercises?id=${encodeURIComponent(exercise.id)}`,
        { method: "DELETE" }
      );
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "לא הצלחנו למחוק");
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
      }}
    >
      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        שם התרגיל
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        className="mb-3 w-full rounded-xl px-3 py-3 outline-none"
        style={field}
      />

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
            קטגוריה
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl px-3 py-3 outline-none"
            style={field}
          >
            {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
            מדידה
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-xl px-3 py-3 outline-none"
            style={field}
          >
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
            התקדמות
          </label>
          <select
            value={progression}
            onChange={(e) => setProgression(e.target.value)}
            className="w-full rounded-xl px-3 py-3 outline-none"
            style={field}
          >
            {Object.entries(PROGRESSION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
            קצב
          </label>
          <input
            value={tempo}
            onChange={(e) => setTempo(e.target.value)}
            dir="ltr"
            placeholder="30X1"
            maxLength={16}
            className="w-full rounded-xl px-3 py-3 text-center outline-none"
            style={field}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
            שרירים
          </label>
          <input
            value={muscles}
            onChange={(e) => setMuscles(e.target.value)}
            placeholder="חזה, יד אחורית"
            maxLength={120}
            className="w-full rounded-xl px-3 py-3 outline-none"
            style={field}
          />
        </div>
      </div>

      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        תיאור. מה התרגיל נותן ולמה עושים אותו
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={1200}
        className="mb-3 w-full resize-none rounded-xl px-3 py-3 outline-none"
        style={field}
      />

      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        הדגשים. שורה לכל הדגש. זה מה שהמתאמן רואה בזמן התרגיל
      </label>
      <textarea
        value={technique}
        onChange={(e) => setTechnique(e.target.value)}
        rows={4}
        placeholder={"מנח אגן לפנים\nלקרב שכמות בירידה"}
        className="mb-3 w-full resize-none rounded-xl px-3 py-3 leading-relaxed outline-none"
        style={field}
      />

      <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
        טיפים. שורה לכל טיפ
      </label>
      <textarea
        value={tips}
        onChange={(e) => setTips(e.target.value)}
        rows={3}
        placeholder={"שמור על גוף ישר\nשליטה מלאה בתנועה"}
        className="mb-3 w-full resize-none rounded-xl px-3 py-3 leading-relaxed outline-none"
        style={field}
      />

      {/*
        שיוך סרטון גם מכאן ולא רק מלשונית הסרטונים. שם הכיוון הפוך, רואים
        קליפ ובוחרים לו תרגיל, וזה עוזר כשלא יודעים מה יש בקובץ. כאן יודעים
        בדיוק איזה תרגיל חסר.
      */}
      {editing && videos.length > 0 && (
        <VideoSlots
          videos={videos}
          progression={progression}
          bandAllowed={bandAllowed}
          values={{
            main: videoFile,
            level2: stanceVideoLevel2,
            level3: stanceVideoLevel3,
            band: bandVideoFile,
          }}
          onChange={{
            main: setVideoFile,
            level2: setStanceVideoLevel2,
            level3: setStanceVideoLevel3,
            band: setBandVideoFile,
          }}
        />
      )}

      <button
        type="button"
        onClick={() => setUnilateral(!unilateral)}
        className="mb-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right"
        style={{
          background: unilateral ? "var(--wood-wash-strong)" : "var(--surface-1)",
          border: `1px solid ${unilateral ? "var(--wood-border-light)" : "var(--line)"}`,
        }}
      >
        {/*
          הניסוח מסביר מה המתג עושה בפועל ולא רק איך קוראים לו. "תרגיל
          חד־צדדי" לבד לא אומר למאמן שנפתחים למתאמן שני שדות דיווח, וזה
          ההבדל המעשי היחיד בין דלוק לכבוי.
        */}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            עובדים צד אחד בכל פעם
          </span>
          <span className="block text-xs leading-5" style={{ color: "var(--dim)" }}>
            יד אחת או רגל אחת, כמו חתירה ביד אחת. המתאמן מתחיל מהצד החלש
            ומדווח כל צד בנפרד, וההתקדמות נמדדת לפי הצד החלש.
          </span>
        </span>
        <span
          className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
          style={{ background: unilateral ? "var(--wood-2)" : "var(--surface-3)" }}
        >
          <span
            className="absolute top-1 h-5 w-5 rounded-full transition-all"
            style={{
              background: "var(--on-wood)",
              insetInlineStart: unilateral ? "calc(100% - 1.5rem)" : "0.25rem",
            }}
          />
        </span>
      </button>

      {/*
        בלי המתג הזה band_allowed נשאר קבוע כמו שהוא במסד, בלי דרך למאמן
        לשלוט בו מהאפליקציה — בדיוק המצב שגרם לאפשרות הגומייה להיעלם
        מתרגילים שהיא הייתה צריכה להופיע בהם.
      */}
      <button
        type="button"
        onClick={() => setBandAllowed(!bandAllowed)}
        className="mb-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right"
        style={{
          background: bandAllowed ? "var(--wood-wash-strong)" : "var(--surface-1)",
          border: `1px solid ${bandAllowed ? "var(--wood-border-light)" : "var(--line)"}`,
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            מתאמן יכול להיעזר בגומייה
          </span>
          <span className="block text-xs leading-5" style={{ color: "var(--dim)" }}>
            פותח בתרגיל בזמן אימון בחירה בין קלה, בינונית וקשה, והרמה
            שנבחרה נשמרת עם כל סט ומופיעה גם בדוח אצלך.
          </span>
        </span>
        <span
          className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
          style={{ background: bandAllowed ? "var(--wood-2)" : "var(--surface-3)" }}
        >
          <span
            className="absolute top-1 h-5 w-5 rounded-full transition-all"
            style={{
              background: "var(--on-wood)",
              insetInlineStart: bandAllowed ? "calc(100% - 1.5rem)" : "0.25rem",
            }}
          />
        </span>
      </button>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}

      {editing && exercise.inUse > 0 && (
        <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--dim)" }}>
          התרגיל מופיע ב-{exercise.inUse} אימונים. השינוי יגיע לכל מי שמתאמן
          לפיהם.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ background: "var(--surface-2)", color: "var(--dim)" }}
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !name.trim()}
          className="wood flex-1 rounded-xl py-3 font-extrabold disabled:opacity-60"
          style={{ color: "var(--on-wood)" }}
        >
          {busy ? "שומר…" : editing ? "שמור" : "הוסף לספרייה"}
        </button>
      </div>

      {editing && exercise.inUse === 0 && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="mt-2 w-full rounded-xl py-2.5 text-xs font-semibold disabled:opacity-60"
          style={{ color: "var(--danger-text)" }}
        >
          מחיקת התרגיל מהספרייה
        </button>
      )}
    </div>
  );
}

type VideoSlotKey = "main" | "level2" | "level3" | "band";

type VideoSlotValues = Record<VideoSlotKey, string>;
type VideoSlotChanges = Record<VideoSlotKey, (next: string) => void>;

/** שורות השיוך וחלונית בחירה משותפת אחת לכל הסרטונים בתרגיל. */
function VideoSlots({
  videos,
  progression,
  bandAllowed,
  values,
  onChange,
}: {
  videos: VideoOption[];
  progression: string;
  bandAllowed: boolean;
  values: VideoSlotValues;
  onChange: VideoSlotChanges;
}) {
  const [activeSlot, setActiveSlot] = useState<VideoSlotKey | null>(null);
  const [videoQuery, setVideoQuery] = useState("");

  const slots: { key: VideoSlotKey; label: string }[] = [
    { key: "main", label: progression === "stance" ? "רמה 1" : "סרטון" },
    ...(progression === "stance"
      ? ([
          { key: "level2", label: "רמה 2" },
          { key: "level3", label: "רמה 3" },
        ] satisfies { key: VideoSlotKey; label: string }[])
      : []),
    ...(bandAllowed
      ? ([{ key: "band", label: "סרטון גומייה" }] satisfies {
          key: VideoSlotKey;
          label: string;
        }[])
      : []),
  ];

  const active = slots.find((slot) => slot.key === activeSlot) ?? null;
  // בלי זה סרגל הניווט המטושטש נצבע מעל החלונית בספארי באייפון ומכסה
  // את רשימת הסרטונים. אותו באג בדיוק שנפתר ביומן החודשי.
  useOverlay(active != null);
  const needle = videoQuery.trim().toLocaleLowerCase("he");
  const filteredVideos = needle
    ? videos.filter((video) =>
        video.filename.toLocaleLowerCase("he").includes(needle)
      )
    : videos;

  function closePicker() {
    setActiveSlot(null);
    setVideoQuery("");
  }

  function choose(next: string) {
    if (!activeSlot) return;
    onChange[activeSlot](next);
    closePicker();
  }

  return (
    <>
      <div
        className="mb-4 overflow-hidden rounded-2xl"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-1)" }}
      >
        {slots.map((slot, index) => {
          const value = values[slot.key];
          const selectedVideo = videos.find((video) => video.url === value);
          const fallbackName = value
            ? decodeURIComponent(value.split("/").pop() || value)
            : "אין סרטון משויך";

          return (
            <div
              key={slot.key}
              className="flex min-h-16 items-center gap-3 px-3 py-2"
              style={{ borderTop: index === 0 ? "none" : "1px solid var(--line)" }}
            >
              <span
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
                style={{
                  background: "var(--wood-wash)",
                  border: "1px solid var(--wood-border)",
                  color: "var(--wood-1)",
                }}
              >
                {slot.label}
              </span>

              {selectedVideo?.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedVideo.posterUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : value ? (
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--video-bg)" }}
                >
                  <FitayIcon name="ring" size={22} />
                </span>
              ) : null}

              <span
                className="min-w-0 flex-1 truncate text-sm"
                style={{ color: value ? "var(--text)" : "var(--dim)" }}
                dir={value ? "ltr" : undefined}
                title={selectedVideo?.filename ?? fallbackName}
              >
                {selectedVideo?.filename ?? fallbackName}
              </span>

              <button
                type="button"
                onClick={() => {
                  setActiveSlot(slot.key);
                  setVideoQuery("");
                }}
                className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold"
                style={{ color: "var(--wood-1)" }}
                aria-label={`${value ? "החלפת" : "בחירת"} סרטון עבור ${slot.label}`}
              >
                <FitayIcon name="edit" size={17} />
                {value ? "החלפה" : "בחירה"}
              </button>
            </div>
          );
        })}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            onClick={closePicker}
            className="absolute inset-0"
            style={{ background: "var(--overlay-bg)" }}
            aria-label="סגירת בחירת הסרטון"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-picker-title"
            className="relative z-10 flex max-h-[82dvh] w-full max-w-xl flex-col rounded-t-3xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-1)" }}
          >
            <div className="mb-3 flex min-h-11 items-center gap-3">
              <h3 id="video-picker-title" className="min-w-0 flex-1 font-bold">
                בחירת סרטון עבור {active.label}
              </h3>
              <button
                type="button"
                onClick={closePicker}
                className="min-h-11 rounded-lg px-3 text-sm font-bold"
                style={{ color: "var(--dim)" }}
              >
                סגירה
              </button>
            </div>

            <input
              type="search"
              value={videoQuery}
              onChange={(event) => setVideoQuery(event.target.value)}
              placeholder="חיפוש לפי שם הסרטון"
              autoFocus
              className="mb-3 min-h-11 w-full rounded-xl px-3 outline-none"
              style={field}
            />

            {values[active.key] && (
              <button
                type="button"
                onClick={() => choose("")}
                className="mb-2 min-h-11 w-full rounded-lg px-3 text-right text-sm font-bold"
                style={{
                  background: "var(--wood-wash)",
                  border: "1px solid var(--wood-border)",
                  color: "var(--wood-1)",
                }}
              >
                הסרת הסרטון מהשדה
              </button>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {filteredVideos.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm" style={{ color: "var(--dim)" }}>
                  לא נמצאו סרטונים
                </p>
              ) : (
                <div>
                  {filteredVideos.map((video, index) => {
                    const selected = values[active.key] === video.url;
                    return (
                      <button
                        key={video.url}
                        type="button"
                        onClick={() => choose(video.url)}
                        className="flex min-h-16 w-full items-center gap-3 px-2 py-2 text-right"
                        style={{
                          background: selected ? "var(--wood-wash)" : "transparent",
                          borderTop: index === 0 ? "none" : "1px solid var(--line)",
                        }}
                        aria-pressed={selected}
                      >
                        <span
                          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                          style={{ background: "var(--video-bg)" }}
                        >
                          {video.posterUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={video.posterUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <FitayIcon name="ring" size={25} />
                          )}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-sm font-semibold"
                          dir="ltr"
                          title={video.filename}
                        >
                          {video.filename}
                        </span>
                        {selected && (
                          <span
                            className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
                            style={{
                              background: "var(--wood-wash)",
                              border: "1px solid var(--wood-border)",
                              color: "var(--wood-1)",
                            }}
                          >
                            נבחר
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
