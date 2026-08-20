"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadToR2 } from "@/lib/upload-to-r2";
import { CATEGORIES, categoryRank } from "@/lib/categories";
import FitayIcon from "@/components/FitayIcon";

export type Video = {
  url: string;
  filename: string;
  size: number;
  posterUrl: string | null;
  /** 'pending' = בתור לדחיסה, 'skipped' = נשאר כמו שהוא. */
  compressState: "pending" | "done" | "failed" | "skipped";
  /** הגודל לפני הדחיסה, כשהייתה דחיסה. */
  originalSize: number | null;
  compressError: string;
  /** שמות התרגילים שמשתמשים בסרטון הזה כרגע. */
  usedBy: { id: string; name: string; slot: VideoSlot }[];
};

type VideoSlot =
  | "videoFile"
  | "stanceVideoLevel2"
  | "stanceVideoLevel3"
  | "bandVideoFile";

export type ExerciseOption = {
  id: string;
  name: string;
  category: string;
  progression: string;
  bandAllowed: boolean;
};

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + "MB";

/** הפרדת שם הקובץ מהסיומת, כדי שאיתי יערוך שם ולא סיומת. */
function splitName(filename: string) {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return { stem: filename, ext: "" };
  return { stem: filename.slice(0, dot), ext: filename.slice(dot) };
}

/**
 * רוחב מרבי לתמונת הפתיחה.
 *
 * 1080, כמו POSTER_MAX_WIDTH בצינור שבשרת. הערך יושב כאן בנפרד כי זה
 * קומפוננט לקוח, וייבוא מ-video-poster.ts היה גורר את המסד ואת ffmpeg
 * אל תוך החבילה של הדפדפן. מי שמשנה שם צריך לשנות גם כאן.
 *
 * חשוב שהשניים יהיו שווים: הצינור בשרת מדלג על סרטון שכבר יש לו תמונה,
 * ולכן הפריים שנתפס כאן ברגע ההעלאה הוא התמונה הסופית שהמתאמן מוריד
 * בכל כניסה לתרגיל. רוחב נמוך יותר כאן היה מקבע פוסטר רך לכל קליפ חדש
 * גם אחרי שהשרת עבר ל-1080.
 *
 * ההיסטוריה: הרוחב היה 540 כשהסרטון המוגש היה 720 — אז ב-720 הקבצים
 * נמדדו ב-170KB עד 230KB וזה הורגש כהמתנה ברשת סלולרית. אחרי שהסרטונים
 * שודרגו ל-1080 החדות של התמונה הקבועה גברה על המשקל (ראה
 * video-poster.ts).
 */
const THUMB_MAX_WIDTH = 1080;

/**
 * מתחת לזה הפריים כמעט בוודאות אחיד — שחור או לבן. אותו סף כמו בצינור
 * שבשרת. null עדיף: הוא משאיר את poster_url ריק, וה-cron ימלא תמונה
 * אמיתית אחר כך. פריים שחור שנרשם היה נשאר לתמיד וגם חוסם את השרת.
 */
const MIN_USEFUL_BYTES = 4096;

/**
 * דפדפן שלא יודע לפענח את הקודק לא בהכרח יזרוק שגיאה — הוא פשוט לא
 * יירה שום אירוע. בלי תקרת זמן ההעלאה הייתה תלויה שם לנצח.
 */
const CAPTURE_TIMEOUT = 8000;

/**
 * חילוץ פריים מתוך הקליפ בדפדפן, לפני ההעלאה.
 *
 * הכרטיס בספרייה מציג poster, וזה מתמלא היום רק אחרי שהדחיסה בשרת
 * מסתיימת — כלומר איתי מסתכל על מלבן שחור בדיוק ברגע שבו הוא צריך
 * לזהות מה העלה. הפריים כאן נותן תמונה מיד.
 *
 * מחזיר null בכל כישלון. תמונה היא נוחות, לא תנאי להעלאה.
 */
async function captureThumb(file: File): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const src = URL.createObjectURL(file);
  const video = document.createElement("video");

  try {
    return await new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(blob);
      };
      const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT);

      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.onerror = () => finish(null);

      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        // 40% פנימה, כמו נקודת החיפוש הראשונה בצינור שבשרת: תחילת קליפ
        // היא תנוחת הכנה, ואמצע הסרטון מראה את התרגיל עצמו.
        video.currentTime = duration > 1 ? duration * 0.4 : 0;
      };

      video.onseeked = () => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return finish(null);
        const scale = Math.min(1, THUMB_MAX_WIDTH / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) =>
              finish(blob && blob.size >= MIN_USEFUL_BYTES ? blob : null),
            "image/jpeg",
            0.8
          );
        } catch {
          finish(null);
        }
      };

      video.src = src;
    });
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(src);
  }
}

/** קובץ שנבחר וממתין לאישור, אחרי שהשם ניתן לעריכה והפריים כבר בידנו. */
type Pending = {
  file: File;
  /** השם שאיתי עורך, בלי הסיומת. */
  name: string;
  ext: string;
  thumb: Blob | null;
  /** כתובת מקומית לתצוגה המקדימה. משוחררת בסיום או בביטול. */
  thumbUrl: string | null;
};

type StatusFilter = "all" | "linked" | "unlinked";

/** תג סינון בסגנון תגי השיוך של הספרייה. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-h-11 rounded-lg px-3 py-1.5 text-xs font-bold"
      style={
        active
          ? {
              background: "rgba(180,133,79,.12)",
              border: "1px solid rgba(180,133,79,.4)",
              color: "var(--wood-1)",
            }
          : {
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              color: "var(--dim)",
            }
      }
    >
      {children}
    </button>
  );
}

export default function VideoLibrary({
  videos,
  exercises,
  autoRefresh = false,
}: {
  videos: Video[];
  exercises: ExerciseOption[];
  autoRefresh?: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  /** נעילה סינכרונית להעלאה, כי state מתעדכן רק ברינדור הבא. */
  const busyRef = useRef(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [preparing, setPreparing] = useState(false);

  const categoryOf = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.category])),
    [exercises]
  );

  /**
   * תגי הקטגוריות נבנים מכל הספרייה ולא מהתוצאות המסוננות. תג שנעלם
   * תוך כדי הקלדה בחיפוש הוא בדיוק מה שגורם ללחוץ על מקום ריק.
   */
  const categoriesInUse = useMemo(() => {
    const keys = new Set<string>();
    for (const v of videos) {
      for (const u of v.usedBy) {
        const c = categoryOf.get(u.id);
        if (c) keys.add(c);
      }
    }
    return [...keys].sort((a, b) => categoryRank(a) - categoryRank(b));
  }, [videos, categoryOf]);

  /**
   * שישים סרטונים ברשימה שטוחה, וכדי למצוא אחד צריך לגלול את כולם.
   *
   * החיפוש מסנן לפי שם התרגיל המשויך ולפי שם הקובץ, כי איתי זוכר לפעמים
   * את זה ולפעמים את זה. המיון מעלה את המשויכים לראש לפי סדר הקטגוריות,
   * ומשאיר את מה שעוד לא שויך בסוף — שם בדיוק נמצאת העבודה שנשארה.
   */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = (v: Video) =>
      needle === "" ||
      v.filename.toLowerCase().includes(needle) ||
      v.usedBy.some((u) => u.name.toLowerCase().includes(needle));

    // הסינונים מצטרפים לחיפוש ואחד לשני: מצב שיוך וקטגוריה יחד.
    const matchesStatus = (v: Video) =>
      status === "all" ||
      (status === "linked" ? v.usedBy.length > 0 : v.usedBy.length === 0);

    const matchesCategory = (v: Video) =>
      category === "" || v.usedBy.some((u) => categoryOf.get(u.id) === category);

    const rankOf = (v: Video) => {
      if (v.usedBy.length === 0) return Number.MAX_SAFE_INTEGER;
      return Math.min(
        ...v.usedBy.map((u) => categoryRank(categoryOf.get(u.id) ?? ""))
      );
    };

    return videos
      .filter((v) => matches(v) && matchesStatus(v) && matchesCategory(v))
      .sort((a, b) => {
        const byCategory = rankOf(a) - rankOf(b);
        if (byCategory !== 0) return byCategory;
        // בתוך אותה קטגוריה לפי שם התרגיל, ומה שלא שויך לפי שם הקובץ.
        const nameA = a.usedBy[0]?.name ?? a.filename;
        const nameB = b.usedBy[0]?.name ?? b.filename;
        return nameA.localeCompare(nameB, "he");
      });
  }, [videos, categoryOf, query, status, category]);

  // הדחיסה רצה בשרת אחרי שההעלאה הסתיימה, ולכן המצב משתנה בלי שהמסך
  // יודע. כל עוד יש קליפ בתור, שואלים שוב כל חמש שניות.
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, router]);

  /*
   * הבחירה כבר לא מתחילה העלאה. קליפ מהטלפון נקרא IMG_6380, וברגע שהוא
   * למעלה השם הזה הוא גם מה שהחיפוש מחפש בו. עוצרים כאן, מחלצים פריים,
   * ונותנים לאיתי לתת שם לפני שמשהו עולה.
   */
  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    setPreparing(true);

    const picked: Pending[] = [];
    try {
      for (const file of Array.from(files)) {
        const thumb = await captureThumb(file);
        const { stem, ext } = splitName(file.name);
        picked.push({
          file,
          name: stem,
          ext,
          thumb,
          thumbUrl: thumb ? URL.createObjectURL(thumb) : null,
        });
      }
    } finally {
      // בלי finally, כישלון כאן היה משאיר את הכפתור תקוע על "מכין…"
      // עד רענון הדף.
      setPreparing(false);
    }

    setPending(picked);
    if (fileInput.current) fileInput.current.value = "";
  }

  function clearPending(list: Pending[]) {
    for (const p of list) {
      if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
    }
    setPending([]);
  }

  async function uploadAll() {
    // הכפתור מנוטרל רק ברינדור הבא, ולחיצה כפולה מהירה מספיקה כדי
    // להריץ את כל הרשימה פעמיים. הדגל נבדק בתוך אותו טיק, לפני React.
    if (busyRef.current) return;
    const list = pending;
    if (list.length === 0) return;
    busyRef.current = true;
    setError("");

    for (const item of list) {
      const filename = item.name.trim()
        ? `${item.name.trim()}${item.ext}`
        : item.file.name;

      setUploading(filename);
      setProgress(0);
      try {
        /*
         * הפריים עולה ראשון, ובנפרד מהקליפ. כישלון שלו לא עוצר כלום:
         * הצינור בשרת ממלא תמונת פתיחה בהמשך ממילא.
         */
        let posterUrl: string | null = null;
        if (item.thumb) {
          try {
            posterUrl = await uploadToR2({
              // שם הקובץ המקורי ולא השם שאיתי בחר: uniqueKey מנקה כל תו
              // שאינו לועזי, ושם בעברית היה הופך את המפתח ל-"_" בודד.
              file: new File(
                [item.thumb],
                `${splitName(item.file.name).stem}.jpg`,
                { type: "image/jpeg" }
              ),
              signUrl: "/api/coach/videos/upload",
              body: { kind: "poster" },
            });
          } catch {
            posterUrl = null;
          }
        }

        // החתימה של הקליפ נשארת על שם הקובץ המקורי, כדי שהסיומת תקבע
        // את סוג התוכן כמו תמיד. השם שאיתי בחר נרשם במסד.
        const url = await uploadToR2({
          file: item.file,
          signUrl: "/api/coach/videos/upload",
          onProgress: setProgress,
        });

        const res = await fetch("/api/coach/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, filename, posterUrl }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "הרישום נכשל");
        }
      } catch (e) {
        setError(
          `${filename}: ${e instanceof Error ? e.message : "ההעלאה נכשלה"}`
        );
      }
    }

    setUploading(null);
    setProgress(0);
    clearPending(list);
    busyRef.current = false;
    router.refresh();
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={uploading !== null || preparing || pending.length > 0}
        className="wood mb-2 w-full rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
        style={{
          color: "var(--on-wood)",
          boxShadow: "var(--button-shadow)",
        }}
      >
        {uploading
          ? `מעלה… ${progress}%`
          : preparing
            ? "מכין…"
            : "+ העלאת סרטון"}
      </button>

      {pending.length > 0 && uploading === null && (
        <div className="glass mb-4 rounded-3xl p-4">
          <div className="space-y-3">
            {pending.map((p, i) => (
              <div key={`${p.file.name}-${i}`} className="flex items-center gap-3">
                {p.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbUrl}
                    alt=""
                    className="h-12 w-auto shrink-0 rounded-lg object-cover"
                    style={{ border: "1px solid var(--line)" }}
                  />
                ) : (
                  <div
                    className="h-12 w-16 shrink-0 rounded-lg"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--line)",
                    }}
                  />
                )}

                <input
                  value={p.name}
                  onChange={(e) =>
                    setPending((prev) =>
                      prev.map((q, j) =>
                        j === i ? { ...q, name: e.target.value } : q
                      )
                    )
                  }
                  /*
                   * השם ההתחלתי הוא שם הקובץ מהטלפון (IMG_6380), ואיתי
                   * כמעט תמיד מחליף אותו כולו. סימון מראש חוסך את
                   * הסמן-ומחק, וההקלדה הראשונה דורסת את הישן.
                   */
                  autoFocus={i === 0}
                  onFocus={(e) => {
                    const el = e.currentTarget;
                    // iOS מבטל select שנקרא בתוך אירוע הפוקוס עצמו.
                    requestAnimationFrame(() => el.select());
                  }}
                  dir="auto"
                  className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-sm font-semibold outline-none"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid rgba(180,133,79,.4)",
                    color: "var(--text)",
                  }}
                />

                <span className="shrink-0 text-xs" style={{ color: "var(--faint)" }}>
                  {mb(p.file.size)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {/* לחיצה כפולה מהירה הייתה מספיקה כדי לרשום את אותו קליפ
                פעמיים, כי הפאנל נעלם רק ברינדור הבא. */}
            <button
              type="button"
              onClick={() => void uploadAll()}
              disabled={uploading !== null}
              className="wood flex-1 rounded-2xl py-3 font-extrabold disabled:opacity-60"
              style={{ color: "var(--on-wood)" }}
            >
              העלה הכל
            </button>
            <button
              type="button"
              onClick={() => clearPending(pending)}
              disabled={uploading !== null}
              className="shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
              style={{ color: "var(--dim)" }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {uploading && (
        <>
          <div
            className="mb-2 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="wood h-full rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mb-4 truncate text-xs" style={{ color: "var(--dim)" }}>
            {uploading}
          </p>
        </>
      )}

      <p className="mb-6 text-xs leading-relaxed" style={{ color: "var(--faint)" }}>
        אפשר לבחור כמה סרטונים יחד. סרטונים מהאייפון עוברים התאמה אוטומטית,
        כדי שיתנגנו בצורה חלקה בכל טלפון.
      </p>

      {error && (
        <p
          className="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(229,72,77,.12)",
            border: "1px solid rgba(229,72,77,.3)",
            color: "var(--danger-text)",
          }}
        >
          {error}
        </p>
      )}

      {videos.length === 0 ? (
        <div className="glass rounded-3xl px-6 py-12 text-center">
          <p className="mb-2 text-lg font-semibold">אין סרטונים עדיין</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
            העלה את הקליפים שצילמת, צפה בכל אחד, ושייך אותו לתרגיל.
          </p>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי תרגיל או שם קובץ"
            className="mb-3 w-full rounded-2xl px-4 py-3 text-sm outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              color: "var(--text)",
            }}
          />

          {/* מצב שיוך וקטגוריה, ושניהם יכולים להיות פעילים יחד. */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            <FilterChip active={status === "all"} onClick={() => setStatus("all")}>
              הכל
            </FilterChip>
            <FilterChip
              active={status === "linked"}
              onClick={() => setStatus("linked")}
            >
              משויכים
            </FilterChip>
            <FilterChip
              active={status === "unlinked"}
              onClick={() => setStatus("unlinked")}
            >
              ללא שיוך
            </FilterChip>

            {categoriesInUse.map((key) => (
              <FilterChip
                key={key}
                active={category === key}
                onClick={() => setCategory(category === key ? "" : key)}
              >
                {CATEGORIES[key] ?? key}
              </FilterChip>
            ))}
          </div>

          {shown.length === 0 ? (
            <p
              className="glass rounded-3xl px-6 py-10 text-center text-sm leading-relaxed"
              style={{ color: "var(--dim)" }}
            >
              אין סרטון שמתאים לחיפוש הזה.
            </p>
          ) : (
            <div className="space-y-4">
              {shown.map((v) => (
                <VideoCard key={v.url} video={v} exercises={exercises} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * מצב הדחיסה. מוצג רק כשיש מה לומר — קליפ שנדחס בשקט לא צריך תגית,
 * הגודל החדש מספר את הסיפור.
 */
function CompressBadge({ video }: { video: Video }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (video.compressState === "done") return null;

  const pending = video.compressState === "pending";
  const look = pending
    ? { bg: "rgba(180,133,79,.16)", line: "rgba(224,190,147,.38)", fg: "var(--wood-1)" }
    : { bg: "rgba(229,72,77,.12)", line: "rgba(229,72,77,.3)", fg: "var(--danger-text)" };

  const text = pending
    ? "דוחס עכשיו…"
    : video.compressState === "failed"
      ? "הדחיסה נכשלה"
      : "מוכן ללא דחיסה";

  async function retry() {
    setError("");
    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/coach/videos/compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: video.url }),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "הדחיסה נכשלה שוב");
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="mb-3 rounded-xl px-3 py-2 text-xs leading-relaxed"
      style={{ background: look.bg, border: `1px solid ${look.line}`, color: look.fg }}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          {text}
          {video.compressError && (
            <span style={{ opacity: 0.8 }}> · {video.compressError}</span>
          )}
        </span>

        {/* בלי הכפתור הזה הניסיון החוזר תלוי במשימה היומית, כלומר עד יום
            שלם של המתנה מול מסך שכבר פתוח. */}
        {!pending && (
          <button
            type="button"
            onClick={retry}
            disabled={busy}
            className="shrink-0 rounded-lg px-2.5 py-1.5 font-semibold disabled:opacity-60"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              color: "var(--text)",
            }}
          >
            {busy ? "דוחס…" : "נסה שוב"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1.5" style={{ opacity: 0.9 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function VideoCard({
  video,
  exercises,
}: {
  video: Video;
  exercises: ExerciseOption[];
}) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [slot, setSlot] = useState<VideoSlot>("videoFile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  /*
   * שינוי שם לתרגיל מתוך תג השיוך. איתי משייך סרטונים ורואה כאן את שם
   * התרגיל, וכשצריך לתקן אותו המעבר למסך הספרייה שובר את הרצף. השם
   * משתנה בכל האפליקציה, כולל תוכניות והיסטוריה, כי כולן מצביעות לשם.
   */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(
    null
  );
  /*
   * שינוי שם תצוגה לסרטון עצמו. איתי מעלה מהטלפון קבצים בשם IMG_6380
   * וכדומה, והשם הוא גם מה שהחיפוש למעלה מחפש בו, אז שם אמיתי עושה סדר.
   */
  const [renamingFile, setRenamingFile] = useState<string | null>(null);

  async function renameFile() {
    if (renamingFile == null) return;
    const value = renamingFile.trim();
    if (!value) return;
    setError("");
    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/coach/videos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: video.url, filename: value }),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחנו לשמור");
      return;
    }
    setRenamingFile(null);
    router.refresh();
  }

  async function link(
    exerciseId: string,
    videoFile: string | null,
    destination: VideoSlot = slot
  ) {
    setError("");
    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/coach/exercises", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId, [destination]: videoFile }),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחנו לשמור");
      return;
    }
    setChoice("");
    setSlot("videoFile");
    router.refresh();
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/coach/videos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: video.url }),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      setConfirmDelete(false);
      return;
    }
    setBusy(false);
    setConfirmDelete(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "המחיקה נכשלה");
      return;
    }
    router.refresh();
  }

  async function rename() {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (!value) return;
    setError("");
    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/coach/exercises", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: renaming.id, rename: value }),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "לא הצלחנו לשמור");
      return;
    }
    setRenaming(null);
    router.refresh();
  }

  const selectedExercise = exercises.find((e) => e.id === choice);
  const slots: { value: VideoSlot; label: string }[] = selectedExercise
    ? [
        {
          value: "videoFile",
          label: selectedExercise.progression === "stance" ? "רמה 1" : "סרטון רגיל",
        },
        ...(selectedExercise.progression === "stance"
          ? [
              { value: "stanceVideoLevel2" as const, label: "רמה 2" },
              { value: "stanceVideoLevel3" as const, label: "רמה 3" },
            ]
          : []),
        ...(selectedExercise.bandAllowed
          ? [{ value: "bandVideoFile" as const, label: "סרטון גומייה" }]
          : []),
      ]
    : [];

  return (
    <div className="glass rounded-3xl p-4">
      {/* preload="metadata" בכוונה — 19 סרטונים שנטענים במלואם יחסלו חבילת גלישה */}
      {/* המסגרת לא כופה 16:9. קליפ אנכי בתוך מסגרת רחבה יוצא זעיר ואי
          אפשר לזהות ממנו מה התרגיל, וזו כל המטרה של המסך הזה. */}
      <div
        className="mb-3 flex min-h-40 w-full items-center justify-center overflow-hidden rounded-2xl bg-black"
        style={{ border: "1px solid var(--line)" }}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={video.url}
          poster={video.posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="max-h-[58vh] w-auto max-w-full"
        />
      </div>

      <div className="mb-3 flex items-baseline justify-between gap-3">
        {renamingFile != null ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              value={renamingFile}
              onChange={(e) => setRenamingFile(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void renameFile();
                if (e.key === "Escape") setRenamingFile(null);
              }}
              autoFocus
              className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid rgba(180,133,79,.4)",
                color: "var(--text)",
              }}
            />
            <button
              type="button"
              onClick={() => void renameFile()}
              disabled={busy || !renamingFile.trim()}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-60"
              style={{ background: "var(--wood-2)", color: "var(--accent-contrast)" }}
            >
              שמור
            </button>
            <button
              type="button"
              onClick={() => setRenamingFile(null)}
              disabled={busy}
              className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold"
              style={{ color: "var(--dim)" }}
            >
              ביטול
            </button>
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {/* dir=auto: שם קובץ לועזי נשאר משמאל לימין, ושם עברי מימין לשמאל. */}
            <p className="min-w-0 truncate text-sm font-semibold" dir="auto">
              {video.filename}
            </p>
            <button
              type="button"
              onClick={() => setRenamingFile(video.filename)}
              disabled={busy}
              className="grid min-h-11 min-w-11 shrink-0 place-items-center disabled:opacity-60"
              style={{ color: "var(--dim)" }}
              title="שינוי שם לסרטון"
              aria-label={`שינוי שם לסרטון ${video.filename}`}
            >
              <FitayIcon name="edit" size={16} />
            </button>
          </span>
        )}
        <span className="shrink-0 text-xs" style={{ color: "var(--faint)" }}>
          {video.originalSize && video.originalSize > video.size ? (
            <>
              <span style={{ textDecoration: "line-through", opacity: 0.55 }}>
                {mb(video.originalSize)}
              </span>{" "}
              {mb(video.size)}
            </>
          ) : (
            mb(video.size)
          )}
        </span>
      </div>

      <CompressBadge video={video} />

      {video.usedBy.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {video.usedBy.map((u) =>
            renaming?.id === u.id ? (
              <span key={`${u.id}:${u.slot}`} className="flex w-full items-center gap-1.5">
                <input
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: u.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void rename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid rgba(180,133,79,.4)",
                    color: "var(--text)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void rename()}
                  disabled={busy || !renaming.value.trim()}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-60"
                  style={{ background: "var(--wood-2)", color: "var(--accent-contrast)" }}
                >
                  שמור
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(null)}
                  disabled={busy}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold"
                  style={{ color: "var(--dim)" }}
                >
                  ביטול
                </button>
              </span>
            ) : (
              <span
                key={`${u.id}:${u.slot}`}
                className="flex items-center overflow-hidden rounded-lg text-xs font-semibold"
                style={{
                  background: "rgba(180,133,79,.12)",
                  border: "1px solid rgba(180,133,79,.4)",
                  color: "var(--wood-1)",
                }}
              >
                <span className="px-2.5 py-1.5">{u.name}</span>
                <button
                  type="button"
                  onClick={() => setRenaming({ id: u.id, value: u.name })}
                  disabled={busy}
                  className="grid min-h-11 min-w-11 place-items-center disabled:opacity-60"
                  style={{ borderRight: "1px solid rgba(180,133,79,.25)" }}
                  title="שינוי שם לתרגיל"
                  aria-label={`שינוי שם לתרגיל ${u.name}`}
                >
                  <FitayIcon name="edit" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => link(u.id, null, u.slot)}
                  disabled={busy}
                  className="px-2 py-1.5 disabled:opacity-60"
                  style={{ borderRight: "1px solid rgba(180,133,79,.25)" }}
                  title="הסר שיוך"
                  aria-label={`הסר שיוך של ${u.name}`}
                >
                  ✕
                </button>
              </span>
            )
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <select
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setSlot("videoFile");
          }}
          className="min-w-0 flex-1 rounded-2xl px-3 py-3 text-sm outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            color: "var(--text)",
          }}
        >
          <option value="">שייך לתרגיל…</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        {choice && (
          <div className="flex flex-wrap gap-2" aria-label="בחירת יעד לסרטון">
            {slots.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSlot(option.value)}
                className="min-h-11 rounded-lg px-3 text-sm font-bold"
                style={{
                  background: slot === option.value ? "rgba(180,133,79,.16)" : "transparent",
                  border: `1px solid ${slot === option.value ? "rgba(224,190,147,.55)" : "var(--line)"}`,
                  color: slot === option.value ? "var(--wood-1)" : "var(--dim)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {choice && (
          <button
            type="button"
            onClick={() => link(choice, video.url, slot)}
            disabled={busy}
            className="wood shrink-0 rounded-2xl px-5 font-extrabold disabled:opacity-60"
            style={{ color: "var(--on-wood)" }}
          >
            {busy ? "…" : "שייך"}
          </button>
        )}

        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="shrink-0 rounded-2xl px-4 text-sm font-semibold disabled:opacity-60"
          style={{
            background: confirmDelete ? "rgba(229,72,77,.16)" : "var(--surface-2)",
            border: `1px solid ${confirmDelete ? "rgba(229,72,77,.45)" : "var(--line)"}`,
            color: confirmDelete ? "var(--danger-text)" : "var(--faint)",
          }}
        >
          {confirmDelete ? "בטוח?" : "מחק"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
