import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import { CATEGORIES } from "@/lib/exercises-data";
import SegmentedTabs from "@/components/SegmentedTabs";
import VideoLibrary, {
  type ExerciseOption,
  type Video,
} from "../videos/VideoLibrary";
import ExerciseEditor, { type EditableExercise } from "./ExerciseEditor";

export const metadata = { title: "ספרייה · FITAY" };

/**
 * הספרייה: התרגילים והסרטונים במסך אחד.
 *
 * קודם אלה היו שני מסכים, ומסך התרגילים היה מקושר רק מתוך מסך הסרטונים.
 * זה אותו חומר משתי זוויות — מה התרגיל אומר, ואיך הוא נראה — ולכן הם
 * יושבים עכשיו תחת לשונית אחת.
 */
export default async function LibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [exercisesRes, videosRes, usageRes] = await Promise.all([
    db.execute(
      `SELECT id, name, category, kind, type, tempo, muscles, description,
              technique, tips, unilateral, video_file
         FROM exercises ORDER BY position`
    ),
    db.execute(
      `SELECT url, filename, size, poster_url, compress_state, original_size,
              compress_error
         FROM videos ORDER BY uploaded_at DESC`
    ),
    // כמה פעמים כל תרגיל מופיע באימונים. מעל אפס, המסך לא מציע למחוק.
    db.execute(
      "SELECT exercise_id, COUNT(*) AS n FROM workout_items GROUP BY exercise_id"
    ),
  ]);

  const usage = new Map(
    usageRes.rows.map((row) => [String(row.exercise_id), Number(row.n)])
  );

  /** technique ו-tips נשמרים כ-JSON. שורה פגומה לא תפיל את המסך. */
  const list = (value: unknown): string[] => {
    try {
      const parsed = JSON.parse(String(value || "[]"));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };

  const exercises: EditableExercise[] = exercisesRes.rows.map((e) => ({
    id: String(e.id),
    name: String(e.name),
    category: String(e.category),
    kind: String(e.kind),
    type: String(e.type),
    tempo: String(e.tempo ?? ""),
    muscles: String(e.muscles ?? ""),
    description: String(e.description ?? ""),
    technique: list(e.technique),
    tips: list(e.tips),
    unilateral: Number(e.unilateral) === 1,
    videoFile: e.video_file == null ? null : String(e.video_file),
    inUse: usage.get(String(e.id)) ?? 0,
  }));

  const videoOptions: ExerciseOption[] = exercisesRes.rows.map((e) => ({
    id: String(e.id),
    name: String(e.name),
    category: String(e.category),
  }));

  const usedBy = new Map<string, { id: string; name: string }[]>();
  for (const e of exercisesRes.rows) {
    if (e.video_file == null) continue;
    const key = String(e.video_file);
    usedBy.set(key, [
      ...(usedBy.get(key) ?? []),
      { id: String(e.id), name: String(e.name) },
    ]);
  }

  const videos: Video[] = videosRes.rows.map((v) => ({
    url: String(v.url),
    filename: String(v.filename),
    size: Number(v.size ?? 0),
    posterUrl: v.poster_url == null ? null : String(v.poster_url),
    compressState: String(v.compress_state ?? "done") as Video["compressState"],
    originalSize: v.original_size == null ? null : Number(v.original_size),
    compressError: String(v.compress_error ?? ""),
    usedBy: usedBy.get(String(v.url)) ?? [],
  }));

  // כל עוד יש קליפ בתור, המסך מרענן את עצמו כדי שהמצב יתעדכן לבד.
  const working = videos.some((v) => v.compressState === "pending");
  const linked = exercises.filter((e) => e.videoFile != null).length;

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
        <header className="mb-6 mt-4">
          <p
            className="mb-1 text-xs font-bold wood-text"
            style={{ letterSpacing: ".14em" }}
          >
            התוכן המקצועי
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight">ספרייה</h1>
          <p
            className="mt-2 max-w-sm text-sm leading-relaxed"
            style={{ color: "var(--dim)" }}
          >
            {exercises.length} תרגילים · {videos.length} סרטונים · {linked}{" "}
            תרגילים עם סרטון מחובר.
          </p>
        </header>

        <SegmentedTabs
          labels={["תרגילים", "סרטונים"]}
          panels={[
            <ExerciseEditor
              key="exercises"
              exercises={exercises}
              categories={CATEGORIES}
              videos={videos.map((v) => ({ url: v.url, filename: v.filename, posterUrl: v.posterUrl }))}
            />,
            <VideoLibrary
              key="videos"
              videos={videos}
              exercises={videoOptions}
              autoRefresh={working}
            />,
          ]}
        />
      </div>
    </main>
  );
}
