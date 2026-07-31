"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type EditableExercise = {
  id: string;
  name: string;
  category: string;
  kind: string;
  type: string;
  tempo: string;
  muscles: string;
  description: string;
  technique: string[];
  tips: string[];
  unilateral: boolean;
  /** כתובת הסרטון המשויך, או null. */
  videoFile: string | null;
  /** בכמה אימונים התרגיל מופיע. מעל אפס, מחיקה חסומה. */
  inUse: number;
};

export type VideoOption = { url: string; filename: string };

const field: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid var(--line)",
  color: "var(--text)",
};

const TYPE_LABELS: Record<string, string> = {
  reps: "חזרות",
  hold: "החזקה",
  amrap: "כמה שאפשר",
};

/** תרגיל ריק לטופס ההוספה. */
function blank(category: string): EditableExercise {
  return {
    id: "",
    name: "",
    category,
    kind: "strength",
    type: "reps",
    tempo: "30X1",
    muscles: "",
    description: "",
    technique: [],
    tips: [],
    unilateral: false,
    videoFile: null,
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

  // הסדר והרשימה מגיעים מהקטגוריות ולא מהתרגילים, אחרת קטגוריה שהתרוקנה
  // הייתה נעלמת מהמסך ואי אפשר היה להוסיף אליה תרגיל חדש.
  const groups: [string, EditableExercise[]][] = Object.keys(categories).map(
    (category) => [category, exercises.filter((e) => e.category === category)]
  );

  return (
    <>
      {groups.map(([category, rows]) => (
        <section key={category} className="mb-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p
              className="text-[11px] font-bold wood-text"
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
              className="text-xs font-bold"
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
  const [tempo, setTempo] = useState(exercise.tempo);
  const [muscles, setMuscles] = useState(exercise.muscles);
  const [description, setDescription] = useState(exercise.description);
  const [technique, setTechnique] = useState(exercise.technique.join("\n"));
  const [tips, setTips] = useState(exercise.tips.join("\n"));
  const [unilateral, setUnilateral] = useState(exercise.unilateral);
  const [videoFile, setVideoFile] = useState(exercise.videoFile ?? "");
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
      tempo,
      muscles,
      description,
      technique: lines(technique),
      tips: lines(tips),
      unilateral,
    };

    const res = await fetch("/api/coach/exercises", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      // שיוך הסרטון נשלח רק בעריכה. תרגיל חדש נוצר בלי סרטון, ומחברים
      // לו אחד ברגע שהוא כבר קיים בספרייה.
      body: JSON.stringify(
        editing
          ? { exerciseId: exercise.id, ...payload, videoFile: videoFile || null }
          : payload
      ),
    });
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
    const res = await fetch(
      `/api/coach/exercises?id=${encodeURIComponent(exercise.id)}`,
      { method: "DELETE" }
    );
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
        background: "rgba(255,255,255,.04)",
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
        <>
          <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
            סרטון
          </label>
          <select
            value={videoFile}
            onChange={(e) => setVideoFile(e.target.value)}
            className="mb-3 w-full rounded-xl px-3 py-3 outline-none"
            style={field}
          >
            <option value="">בלי סרטון</option>
            {videos.map((video) => (
              <option key={video.url} value={video.url}>
                {video.filename}
              </option>
            ))}
          </select>
        </>
      )}

      <button
        type="button"
        onClick={() => setUnilateral(!unilateral)}
        className="mb-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right"
        style={{
          background: unilateral ? "rgba(180,133,79,.16)" : "rgba(255,255,255,.04)",
          border: `1px solid ${unilateral ? "rgba(224,190,147,.4)" : "var(--line)"}`,
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">תרגיל חד־צדדי</span>
          <span className="block text-xs" style={{ color: "var(--dim)" }}>
            המתאמן יתבקש להתחיל מהצד החלש
          </span>
        </span>
        <span
          className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
          style={{ background: unilateral ? "var(--wood-2)" : "rgba(255,255,255,.12)" }}
        >
          <span
            className="absolute top-1 h-5 w-5 rounded-full transition-all"
            style={{
              background: "#f7ebda",
              insetInlineStart: unilateral ? "calc(100% - 1.5rem)" : "0.25rem",
            }}
          />
        </span>
      </button>

      {error && (
        <p className="mb-3 text-sm" style={{ color: "#ffb4b6" }}>
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
          style={{ background: "rgba(255,255,255,.06)", color: "var(--dim)" }}
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !name.trim()}
          className="wood flex-1 rounded-xl py-3 font-extrabold disabled:opacity-60"
          style={{ color: "#f7ebda" }}
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
          style={{ color: "#ffb4b6" }}
        >
          מחיקת התרגיל מהספרייה
        </button>
      )}
    </div>
  );
}
