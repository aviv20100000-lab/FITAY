import db, { initDb } from "./db";

/**
 * תוכן מסך המדריך.
 *
 * עד עכשיו הטקסט הזה היה קבוע בקוד, ולכן תיקון מילה בשאלות הנפוצות היה
 * משימה למפתח. עכשיו הוא יושב במסד ומאמן FITAY עורך אותו מהמסך.
 *
 * מה שכתוב כאן כברירת מחדל הוא בדיוק מה שהיה בקוד לפני המעבר. הוא נזרע
 * למסד פעם אחת, ומשם והלאה המסד הוא המקור. אם המסד ריק מסיבה כלשהי,
 * המסך נופל חזרה לברירות המחדל במקום להיות ריק.
 */

export type MethodRule = { id: string; title: string; body: string; short: string };
export type MethodQuestion = {
  id: string;
  question: string;
  answer: string;
  /** ריק = שאלה שעוד לא שויכה. מוצגת בלי כותרת קבוצה. */
  group: QuestionGroup | "";
};

/**
 * קיבוץ השאלות.
 *
 * הסדר כאן הוא הסדר במסך: מה שקוראים לפני שמתחילים, מה שקוראים תוך כדי,
 * ומה שמחפשים כשמשהו משתבש.
 */
export const QUESTION_GROUPS = [
  { key: "start", label: "לפני שמתחילים" },
  { key: "form", label: "ביצוע והתקדמות" },
  { key: "trouble", label: "כשמשהו לא הולך" },
] as const;

export type QuestionGroup = (typeof QUESTION_GROUPS)[number]["key"];

const GROUP_KEYS = new Set<string>(QUESTION_GROUPS.map((g) => g.key));

/**
 * שאלה שנשמרה לפני שהקיבוץ היה קיים מגיעה בלי קבוצה, ואסור לנחש עבורה
 * אחת: ניחוש שגוי מציג למתאמן שאלה תחת כותרת שלא מתארת אותה. היא נשארת
 * בלי שיוך עד שאיתי יבחר, ומסך שכל שאלותיו כאלה נראה כמו לפני השינוי.
 */
export function toQuestionGroup(value: unknown): QuestionGroup | "" {
  const key = String(value ?? "");
  return GROUP_KEYS.has(key) ? (key as QuestionGroup) : "";
}

export type MethodContent = {
  intro: string;
  rules: MethodRule[];
  questions: MethodQuestion[];
};

/**
 * ארבעת החוקים המחייבים. בלעדיהם, לפי החוברת, התוכנית לא עובדת.
 *
 * ארבעה בדיוק, ולא יותר: לכל אחד יש אייקון משלו במסך לפי מיקומו ברשימה.
 * לכן אפשר לערוך את הטקסט אבל אי אפשר להוסיף חוק חמישי מהמסך.
 */
export const DEFAULT_RULES: MethodRule[] = [
  {
    id: "range",
    title: "טווח תנועה מלא",
    body: "כל חזרה מההתחלה עד הסוף. חצי חזרה לא נספרת.",
    short: "מהתחלת התנועה ועד הסוף.",
  },
  {
    id: "core",
    title: "בטן מכווצת וסיבוב האגן פנימה",
    body: "הליבה נעולה לאורך כל התרגיל. זה מה ששומר על הגוף בקו אחד.",
    short: "שמור את הגוף יציב ובקו אחד.",
  },
  {
    id: "grip",
    title: "אחיזה חזקה",
    body: "אחיזה רופפת מרעידה את הטבעות ומבטלת את עבודת השרירים המייצבים.",
    short: "אחוז חזק כדי לשלוט בטבעות.",
  },
  {
    id: "neck",
    title: "הצוואר בקו אחד עם עמוד השדרה",
    body: "בלי להרים או להוריד את הסנטר. הראש ממשיך את קו הגב.",
    short: "הראש ממשיך את קו הגב.",
  },
];

export const DEFAULT_INTRO =
  "התוכנית נועדה לבנות מסת שריר בכל הגוף, עם דגש על פלג הגוף העליון. עובדים לפי התוכנית, רושמים מה בוצע ומתקדמים רק כשהביצוע יציב.";

export const DEFAULT_QUESTIONS: Omit<MethodQuestion, "id">[] = [
  {
    group: "start",
    question: "מה עושים לפני האימון הראשון?",
    answer:
      "צפה בסרטונים של התרגילים ועשה את החימום שמופיע בתוכנית. בתרגיל חדש מתחילים קל ורק אחר כך מעלים קושי.",
  },
  {
    group: "start",
    question: "למה מתאמנים על טבעות?",
    answer:
      "הטבעות מפעילות כמה שרירים בכל תרגיל. הן עובדות על כל הגוף, עם דגש על פלג הגוף העליון, ומחזקות גם את האחיזה והשליטה בגוף.",
  },
  {
    group: "start",
    question: "איך משלבים טבעות עם כדורגל או אימונים אחרים?",
    answer:
      "לא מוסיפים אימון לבד. עדכן את המאמן באימוני הקבוצה ובמשחקים שלך, והוא יקבע איפה אימוני הטבעות נכנסים.",
  },
  {
    group: "form",
    question: "מה אומר הקצב 30X1?",
    answer:
      "יורדים 3 שניות, לא עוצרים למטה, עולים חזק ועוצרים שנייה למעלה. זה הסדר של חזרה אחת.",
  },
  {
    group: "form",
    question: "איך יודעים שהקושי מתאים?",
    answer:
      "אתה אמור להגיע ליעד שרשום בתוכנית כשכל חזרה מלאה ונשלטת. אם הביצוע משתבש מוקדם, צריך להקל. אם נשאר לך קל, עדכן את המאמן.",
  },
  {
    group: "form",
    question: "מה עושים כשצד אחד חלש יותר?",
    answer:
      "מתחילים בצד החלש. בצד החזק עושים את אותו מספר חזרות, גם אם אפשר יותר. כך הפער לא ממשיך לגדול.",
  },
  {
    group: "form",
    question: "מתי עוברים לרמה הבאה?",
    answer:
      "לא עוברים רק כי השלמת את 24 האימונים. קודם צריך לבצע את הרמה הנוכחית בצורה יציבה. המעבר נעשה אחרי שהמאמן בדק ואישר.",
  },
  {
    group: "trouble",
    question: "מה עושים כשלא מצליחים להשלים את החזרות?",
    answer:
      "לא מקצרים את התנועה ולא ממשיכים בכוח. רשום כמה חזרות טובות הצלחת. המאמן יחליט אם לשנות קושי, להוסיף גומייה או לחלק את הכמות אחרת.",
  },
  {
    group: "trouble",
    question: "מתי עוצרים את הסט?",
    answer:
      "כשאתה כבר לא משלים את כל התנועה או לא שולט בטבעות. מאמץ בשריר יכול להיות רגיל. כאב חד או כאב במפרק הוא סיבה לעצור ולעדכן את המאמן.",
  },
  {
    group: "trouble",
    question: "מתי צריך להוריד עומס?",
    answer:
      "אם אתה נחלש כמה אימונים ברצף, עייף בצורה חריגה או מרגיש כאב במפרק, עדכן את המאמן. לא משנים לבד את התוכנית.",
  },
];

/**
 * התוכן כפי שהוא במסד.
 *
 * נקרא בשרת בלבד. חוק שנמחק מהמסד באיזשהו אופן חוזר מברירת המחדל, כדי
 * שהמסך תמיד יציג ארבעה חוקים עם ארבעת האייקונים.
 */
export async function getMethodContent(): Promise<MethodContent> {
  await initDb();

  const rows = await db.execute(
    "SELECT id, kind, title, body, extra FROM method_content ORDER BY kind, position"
  );

  const intro =
    rows.rows.find((row) => String(row.kind) === "intro")?.body ?? null;

  const stored = new Map(
    rows.rows
      .filter((row) => String(row.kind) === "rule")
      .map((row) => [String(row.id), row])
  );

  const rules: MethodRule[] = DEFAULT_RULES.map((fallback) => {
    const row = stored.get(fallback.id);
    if (!row) return fallback;
    return {
      id: fallback.id,
      title: String(row.title || fallback.title),
      body: String(row.body || fallback.body),
      short: String(row.extra || fallback.short),
    };
  });

  // extra היא עמודה כללית בטבלה. בכללים היא הניסוח הקצר, ובשאלות היא
  // מפתח הקבוצה. שאלה שנשמרה לפני הקיבוץ תגיע עם מחרוזת ריקה, ולכן
  // toQuestionGroup מחזיר קבוצה תקפה במקום להשאיר שאלה בלי כותרת.
  const questions: MethodQuestion[] = rows.rows
    .filter((row) => String(row.kind) === "question")
    .map((row) => ({
      id: String(row.id),
      question: String(row.title),
      answer: String(row.body),
      group: toQuestionGroup(row.extra),
    }));

  return {
    intro: intro == null ? DEFAULT_INTRO : String(intro),
    rules,
    // מסד שעוד לא נזרע לא משאיר את המסך בלי שאלות.
    questions: questions.length
      ? questions
      : DEFAULT_QUESTIONS.map((q, index) => ({ id: `seed-${index}`, ...q })),
  };
}
