/**
 * בדיקה שכל תרגיל שיש לו סרטון באמת מצביע לקובץ שמתנגן.
 *   npx tsx --env-file=.env.local scripts/videos-verify.ts
 *
 * מבקש את אלף הבתים הראשונים מכל כתובת. תשובה 206 עם סוג וידאו אומרת
 * שהנגן בדפדפן יוכל גם לדלג באמצע, וזה מה שבאמת נדרש. קריאה בלבד.
 */
import db, { initDb } from "../src/lib/db";

async function probe(url: string) {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-1023" } });
    const type = res.headers.get("content-type") ?? "";
    const ok = (res.status === 206 || res.status === 200) && type.startsWith("video/");
    return { ok, detail: `${res.status} ${type || "בלי סוג"}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function main() {
  await initDb();

  const rows = await db.execute(
    `SELECT id, name, video_file, band_video_file FROM exercises
      WHERE video_file IS NOT NULL OR band_video_file IS NOT NULL
      ORDER BY category, position`
  );

  let checked = 0;
  const broken: string[] = [];

  for (const r of rows.rows) {
    for (const [kind, url] of [
      ["רגיל", r.video_file],
      ["גומייה", r.band_video_file],
    ] as const) {
      if (!url) continue;
      const { ok, detail } = await probe(String(url));
      checked++;
      const line = `${ok ? "✓" : "✗"} ${String(r.name)} (${kind}) — ${detail}`;
      console.log(line);
      if (!ok) broken.push(`${String(r.id)} ${kind}: ${detail}`);
    }
  }

  console.log(`\n${checked} כתובות נבדקו, ${broken.length} שבורות.`);
  for (const b of broken) console.log("  " + b);
  if (broken.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
