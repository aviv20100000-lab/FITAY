import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import db, { initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { DEFAULT_RULES, toQuestionGroup } from "@/lib/method-content";

/**
 * תוכן מסך המדריך: פסקת הפתיחה, ארבעת הכללים והשאלות הנפוצות.
 *
 * נשמר כחבילה שלמה ולא שדה־שדה. השאלות ניתנות להוספה, למחיקה ולסידור
 * מחדש, וכתיבה חלקית הייתה מחייבת מעקב אחרי מה נמחק בצד הלקוח. לכן
 * הטבלה נכתבת מחדש בכל שמירה, בתוך batch אחד, כדי שלא יהיה רגע שבו
 * מתאמן פותח את המדריך ורואה אותו חצי ריק.
 *
 * זה גם רגע הזריעה. עד השמירה הראשונה הטבלה ריקה והמסך מציג את ברירות
 * המחדל מהקוד, וזה בכוונה: אין מיגרציה שמזריקה טקסט למסד של פרודקשן.
 */
// פרנקפורט: קרובה למתאמנים בישראל וגם למסד באירלנד. ראה ההסבר ב-layout.
export const preferredRegion = "fra1";

const RULE_IDS = new Set(DEFAULT_RULES.map((rule) => rule.id));

export async function PUT(request: Request) {
  const coach = await getSessionUser();
  if (!coach || coach.role !== "coach") {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const intro = String(body.intro ?? "").trim().slice(0, 600);
  if (!intro) {
    return NextResponse.json({ error: "צריך טקסט פתיחה" }, { status: 400 });
  }

  const rules = Array.isArray(body.rules) ? body.rules : [];
  if (rules.length !== DEFAULT_RULES.length) {
    return NextResponse.json(
      { error: "הכללים הם ארבעה קבועים" },
      { status: 400 }
    );
  }

  const cleanRules = [];
  for (const raw of rules) {
    const id = String(raw?.id ?? "");
    if (!RULE_IDS.has(id)) {
      return NextResponse.json({ error: "כלל לא מוכר" }, { status: 400 });
    }
    const title = String(raw?.title ?? "").trim();
    const ruleBody = String(raw?.body ?? "").trim();
    const short = String(raw?.short ?? "").trim();
    if (!title || !ruleBody || !short) {
      return NextResponse.json(
        { error: "בכל כלל צריך כותרת, הסבר וניסוח קצר" },
        { status: 400 }
      );
    }
    cleanRules.push({
      id,
      title: title.slice(0, 120),
      body: ruleBody.slice(0, 400),
      short: short.slice(0, 120),
    });
  }

  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (questions.length > 40) {
    return NextResponse.json({ error: "יותר מדי שאלות" }, { status: 400 });
  }

  const cleanQuestions = [];
  for (const raw of questions) {
    const question = String(raw?.question ?? "").trim();
    const answer = String(raw?.answer ?? "").trim();
    // שאלה ריקה לגמרי היא שורה שנפתחה ולא מולאה. פשוט מדלגים עליה.
    if (!question && !answer) continue;
    if (!question || !answer) {
      return NextResponse.json(
        { error: "בכל שאלה צריך גם שאלה וגם תשובה" },
        { status: 400 }
      );
    }
    cleanQuestions.push({
      question: question.slice(0, 200),
      answer: answer.slice(0, 1200),
      group: toQuestionGroup(raw?.group),
    });
  }

  await initDb();

  await db.batch(
    [
      { sql: "DELETE FROM method_content", args: [] },
      {
        sql: "INSERT INTO method_content (id,kind,position,title,body,extra) VALUES (?,'intro',0,'',?,'')",
        args: [randomUUID(), intro],
      },
      ...cleanRules.map((rule, index) => ({
        sql: "INSERT INTO method_content (id,kind,position,title,body,extra) VALUES (?,'rule',?,?,?,?)",
        args: [rule.id, index, rule.title, rule.body, rule.short],
      })),
      // extra נושאת את מפתח הקבוצה בשאלות, ואת הניסוח הקצר בכללים.
      ...cleanQuestions.map((item, index) => ({
        sql: "INSERT INTO method_content (id,kind,position,title,body,extra) VALUES (?,'question',?,?,?,?)",
        args: [randomUUID(), index, item.question, item.answer, item.group],
      })),
    ],
    "write"
  );

  return NextResponse.json({ ok: true });
}
