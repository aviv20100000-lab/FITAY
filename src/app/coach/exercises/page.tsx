import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import { CATEGORIES } from "@/lib/exercises-data";
import VideoPicker, { type VideoOption } from "./VideoPicker";

export const metadata = { title: "תרגילים · FITAY" };

/** ספריית התרגילים — כאן מאמן FITAY מחבר סרטון לכל תרגיל. */
export default async function ExercisesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [exercisesRes, videosRes] = await Promise.all([
    db.execute(
      "SELECT id, name, category, video_file, band_allowed FROM exercises ORDER BY position"
    ),
    db.execute("SELECT url, filename, size FROM videos ORDER BY filename"),
  ]);

  const videos: VideoOption[] = videosRes.rows.map((v) => ({
    url: String(v.url),
    filename: String(v.filename),
    size: Number(v.size ?? 0),
  }));

  const withVideo = exercisesRes.rows.filter((e) => e.video_file != null).length;

  const groups = new Map<string, typeof exercisesRes.rows>();
  for (const e of exercisesRes.rows) {
    const key = String(e.category);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

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
        <BackLink href="/coach">חזרה לדף הראשי</BackLink>

        <h1 className="mt-6 mb-1 text-3xl font-bold tracking-tight">תרגילים</h1>
        <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          {withVideo} מתוך {exercisesRes.rows.length} תרגילים עם סרטון.
        </p>

        {videos.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-10 text-center">
            <p className="mb-2 text-lg font-semibold">עוד לא הועלו סרטונים</p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
              אחרי העלאת הסרטונים, אפשר לחבר כל סרטון לתרגיל המתאים.
            </p>
          </div>
        ) : (
          [...groups.entries()].map(([category, rows]) => (
            <section key={category} className="mb-6">
              <p
                className="mb-2 text-[11px] font-bold wood-text"
                style={{ letterSpacing: ".14em" }}
              >
                {CATEGORIES[category] ?? category}
              </p>
              <div className="glass rounded-3xl p-1">
                {rows.map((e, i) => (
                  <div
                    key={String(e.id)}
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
                  >
                    <VideoPicker
                      exerciseId={String(e.id)}
                      exerciseName={String(e.name)}
                      current={e.video_file == null ? null : String(e.video_file)}
                      videos={videos}
                      bandAllowed={Number(e.band_allowed ?? 0) === 1}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
