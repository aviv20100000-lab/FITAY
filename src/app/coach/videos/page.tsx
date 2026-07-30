import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import VideoLibrary, {
  type ExerciseOption,
  type Video,
} from "./VideoLibrary";

export const metadata = { title: "סרטונים · FITAY" };

/**
 * ספריית הסרטונים. הכיוון כאן הפוך ממסך התרגילים בכוונה:
 * איתי צופה בקליפ, מזהה מה זה, ורק אז בוחר תרגיל — במקום לנחש
 * לפי שם קובץ כמו IMG_1341.
 */
export default async function VideosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [videosRes, exercisesRes] = await Promise.all([
    db.execute(
      `SELECT url, filename, size, compress_state, original_size, compress_error
       FROM videos ORDER BY uploaded_at DESC`
    ),
    db.execute(
      "SELECT id, name, category, video_file FROM exercises ORDER BY position"
    ),
  ]);

  const exercises: ExerciseOption[] = exercisesRes.rows.map((e) => ({
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
    compressState: String(v.compress_state ?? "done") as Video["compressState"],
    originalSize: v.original_size == null ? null : Number(v.original_size),
    compressError: String(v.compress_error ?? ""),
    usedBy: usedBy.get(String(v.url)) ?? [],
  }));

  // כל עוד יש קליפ בתור, המסך מרענן את עצמו כדי שהמצב יתעדכן לבד.
  const working = videos.some((v) => v.compressState === "pending");

  const linked = exercisesRes.rows.filter((e) => e.video_file != null).length;

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-7 pb-10">
        <Link href="/coach" className="text-sm" style={{ color: "var(--dim)" }}>
          ← חזרה
        </Link>

        <h1 className="mt-6 mb-1 text-3xl font-bold tracking-tight">סרטונים</h1>
        <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          {videos.length} סרטונים · {linked} מתוך {exercises.length} תרגילים מחוברים.
          נגן כל קליפ, זהה מה זה, ושייך אותו לתרגיל.
        </p>

        <VideoLibrary videos={videos} exercises={exercises} autoRefresh={working} />

        <Link
          href="/coach/exercises"
          className="glass mt-6 flex items-center gap-3 rounded-3xl px-5 py-4"
        >
          <div className="min-w-0 flex-1">
            <p className="font-bold">לפי תרגיל</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              לראות אילו תרגילים עדיין בלי סרטון
            </p>
          </div>
          <span className="shrink-0 text-2xl" style={{ color: "var(--wood-2)" }}>
            ←
          </span>
        </Link>
      </div>
    </main>
  );
}
