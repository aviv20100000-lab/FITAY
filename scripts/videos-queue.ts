/**
 * מצב תור הסרטונים: npm run videos:queue
 *
 * קריאה בלבד. שום UPDATE ושום INSERT, כדי שאפשר יהיה להריץ אותו על המסד
 * החי גם באמצע ריצה של ה-cron בלי להפריע לה.
 *
 * נועד לבדיקת השרשור: מריצים את מסלול ה-cron פעם אחת, ואז מסתכלים כאן אם
 * התור המשיך להתרוקן בלי הפעלה ידנית נוספת.
 */
import db from "../src/lib/db";
// מיובאים ולא מועתקים, כדי שהסקריפט לא יראה תור אחר ממה שהקוד רואה.
import { LEASE_MS, MAX_ATTEMPTS } from "../src/lib/video-compress";

function age(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) return "לא ידוע";
  const seconds = Math.round((Date.now() - parsed) / 1000);
  if (seconds < 90) return `לפני ${seconds} שניות`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `לפני ${minutes} דקות`;
  return `לפני ${Math.round(minutes / 60)} שעות`;
}

async function main() {
  // בכוונה בלי initDb. הוא מריץ מיגרציות, וזו כתיבה. הטבלאות כבר קיימות,
  // ובדיקת מצב לא אמורה לשנות שום דבר במסד החי.
  console.log("\n── דחיסה לפי מצב ──");
  const states = await db.execute(
    `SELECT COALESCE(compress_state, 'ללא') AS state, COUNT(*) AS c
       FROM videos GROUP BY state ORDER BY c DESC`
  );
  for (const r of states.rows) {
    console.log(`  ${r.state}: ${r.c}`);
  }

  const staleBefore = new Date(Date.now() - LEASE_MS).toISOString();

  console.log("\n── ממתינים לדחיסה עכשיו ──");
  const pending = await db.execute({
    sql: `SELECT id, filename, compress_state, compress_attempts, uploaded_at
            FROM videos
           WHERE compress_state IN ('pending','failed')
             AND compress_attempts < ?
             AND (compress_started_at IS NULL OR compress_started_at < ?)
           ORDER BY uploaded_at ASC`,
    args: [MAX_ATTEMPTS, staleBefore],
  });
  if (pending.rows.length === 0) {
    console.log("  התור ריק");
  } else {
    for (const r of pending.rows) {
      console.log(
        `  ${r.filename} · ${r.compress_state} · ניסיון ${r.compress_attempts ?? 0} · הועלה ${age(r.uploaded_at)}`
      );
    }
  }

  console.log("\n── תפוסים כרגע על ידי הפעלה ──");
  const claimed = await db.execute({
    sql: `SELECT filename, compress_started_at
            FROM videos
           WHERE compress_started_at IS NOT NULL AND compress_started_at >= ?
           ORDER BY compress_started_at ASC`,
    args: [staleBefore],
  });
  if (claimed.rows.length === 0) {
    console.log("  אף אחד");
  } else {
    for (const r of claimed.rows) {
      console.log(`  ${r.filename} · נתפס ${age(r.compress_started_at)}`);
    }
  }

  console.log("\n── ויתרנו עליהם סופית ──");
  const exhausted = await db.execute({
    sql: `SELECT filename, compress_attempts, compress_error
            FROM videos
           WHERE compress_state IN ('pending','failed') AND compress_attempts >= ?
           ORDER BY uploaded_at ASC`,
    args: [MAX_ATTEMPTS],
  });
  if (exhausted.rows.length === 0) {
    console.log("  אף אחד");
  } else {
    for (const r of exhausted.rows) {
      const why = String(r.compress_error ?? "").slice(0, 120) || "בלי סיבה רשומה";
      console.log(`  ${r.filename} · ${r.compress_attempts} ניסיונות · ${why}`);
    }
  }

  console.log("\n── תמונות פתיחה ──");
  const posters = await db.execute(
    `SELECT COUNT(*) AS c FROM videos
      WHERE poster_url IS NULL AND compress_state IN ('done','skipped')`
  );
  console.log(`  ${Number(posters.rows[0].c)} ממתינים לתמונת פתיחה\n`);
}

main().catch((e) => {
  console.error("נכשל:", e);
  process.exit(1);
});
