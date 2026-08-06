import db, { initDb } from "../src/lib/db";
import { QUESTION_GROUPS, toQuestionGroup } from "../src/lib/method-content";

/**
 * שיוך חד־פעמי של השאלות הקיימות לקבוצות במסך המדריך.
 *
 * הקיבוץ נוסף אחרי שאיתי כבר פרסם את המדריך, ולכן כל השאלות שבמסד נשמרו
 * בלי קבוצה. שאלה בלי קבוצה מוצגת בלי כותרת, כלומר בלי הסקריפט הזה המסך
 * נראה בדיוק כמו לפני השינוי.
 *
 * הסקריפט הזה שונה מ-exercises:sync בדבר אחד קריטי: הוא לא כותב טקסט.
 * הוא נוגע אך ורק בעמודת הקבוצה, ולעולם לא ב-title או ב-body. אי אפשר
 * לאבד כאן ניסוח שאיתי כתב.
 *
 * הוא גם לא דורס שיוך קיים: שאלה שכבר יש לה קבוצה נשארת כפי שהיא, כדי
 * שאיתי יוכל לשנות שיוך מהאפליקציה בלי שהרצה חוזרת תחזיר אותו לאחור.
 *
 * ההתאמה היא לפי הכותרת המדויקת. כותרת שאיתי ניסח מחדש מאז לא תימצא כאן,
 * והסקריפט ידווח עליה במקום לנחש.
 */

const ASSIGNMENTS: Record<string, string> = {
  // לפני שמתחילים — מה שצריך לסדר לפני האימון הראשון.
  "ציוד מומלץ": "start",
  "איך תולים את הטבעות?": "start",
  מפה: "start",
  "חימום הגוף": "start",

  // ביצוע נכון — איך מבצעים את התרגיל עצמו.
  "מה אומר הקצב 30X1?": "form",
  "בחירת הרמה בתרגיל": "form",
  "איך יודעים שהקושי מתאים?": "form",
  "גומיות התנגדות": "form",
  "מה עושים כשצד אחד חלש יותר?": "form",

  // התקדמות — איך מתקדמים מאימון לאימון ומרמה לרמה.
  "נוהל צבירה": "progress",
  "מתי עוברים לרמה הבאה?": "progress",
  "מהו כישלון שריר?": "progress",

  // כשמשהו לא הולך — מה שמחפשים כשמשהו משתבש.
  "מה עושים כשלא מצליחים להשלים את החזרות?": "trouble",
  "מתי עוצרים את הסט?": "trouble",
  התאוששות: "trouble",
  "חשוב לזכור": "trouble",
};

async function main() {
  await initDb();

  const rows = await db.execute(
    "SELECT id, title, extra FROM method_content WHERE kind = 'question' ORDER BY position"
  );

  const updates: { id: string; title: string; group: string }[] = [];
  const skipped: string[] = [];
  const unknown: string[] = [];

  for (const row of rows.rows) {
    const id = String(row.id);
    const title = String(row.title);

    if (toQuestionGroup(row.extra)) {
      skipped.push(title);
      continue;
    }

    const group = ASSIGNMENTS[title];
    if (!group) {
      unknown.push(title);
      continue;
    }

    updates.push({ id, title, group });
  }

  if (updates.length) {
    await db.batch(
      updates.map((row) => ({
        sql: "UPDATE method_content SET extra = ? WHERE id = ? AND kind = 'question'",
        args: [row.group, row.id],
      })),
      "write"
    );
  }

  const labels = new Map<string, string>(
    QUESTION_GROUPS.map((group) => [group.key, group.label])
  );

  console.log(`שויכו ${updates.length} שאלות:`);
  for (const row of updates) {
    console.log(`  ${labels.get(row.group)} — ${row.title}`);
  }

  if (skipped.length) {
    console.log(`\nכבר היו משויכות, לא נגעתי: ${skipped.length}`);
    for (const title of skipped) console.log(`  ${title}`);
  }

  if (unknown.length) {
    console.log(`\nלא זוהו, נשארו בלי כותרת: ${unknown.length}`);
    for (const title of unknown) console.log(`  ${title}`);
    console.log("אפשר לשייך אותן ידנית מתוך מסך עריכת המדריך.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
