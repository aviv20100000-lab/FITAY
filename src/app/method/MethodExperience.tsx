import type { ReactNode } from "react";
import { RULES } from "@/lib/method";

const QUESTIONS = [
  {
    question: "מה עושים לפני האימון הראשון?",
    answer:
      "צפה בסרטונים של התרגילים ועשה את החימום שמופיע בתוכנית. בתרגיל חדש מתחילים קל ורק אחר כך מעלים קושי.",
  },
  {
    question: "למה מתאמנים על טבעות?",
    answer:
      "הטבעות מפעילות כמה שרירים בכל תרגיל. הן עובדות על כל הגוף, עם דגש על פלג הגוף העליון, ומחזקות גם את האחיזה והשליטה בגוף.",
  },
  {
    question: "איך משלבים טבעות עם כדורגל או אימונים אחרים?",
    answer:
      "לא מוסיפים אימון לבד. עדכן את המאמן באימוני הקבוצה ובמשחקים שלך, והוא יקבע איפה אימוני הטבעות נכנסים.",
  },
  {
    question: "איך יודעים שהקושי מתאים?",
    answer:
      "אתה אמור להגיע ליעד שרשום בתוכנית כשכל חזרה מלאה ונשלטת. אם הביצוע משתבש מוקדם, צריך להקל. אם נשאר לך קל, עדכן את המאמן.",
  },
  {
    question: "מה אומר הקצב 30X1?",
    answer:
      "יורדים 3 שניות, לא עוצרים למטה, עולים חזק ועוצרים שנייה למעלה. זה הסדר של חזרה אחת.",
  },
  {
    question: "מה עושים כשלא מצליחים להשלים את החזרות?",
    answer:
      "לא מקצרים את התנועה ולא ממשיכים בכוח. רשום כמה חזרות טובות הצלחת. המאמן יחליט אם לשנות קושי, להוסיף גומייה או לחלק את הכמות אחרת.",
  },
  {
    question: "מתי עוצרים את הסט?",
    answer:
      "כשאתה כבר לא משלים את כל התנועה או לא שולט בטבעות. מאמץ בשריר יכול להיות רגיל. כאב חד או כאב במפרק הוא סיבה לעצור ולעדכן את המאמן.",
  },
  {
    question: "מתי עוברים לרמה הבאה?",
    answer:
      "לא עוברים רק כי עברו כמה שבועות. קודם צריך לבצע את הרמה הנוכחית בצורה יציבה. המעבר נעשה אחרי שהמאמן בדק ואישר.",
  },
  {
    question: "מתי צריך להוריד עומס?",
    answer:
      "אם אתה נחלש כמה אימונים ברצף, עייף בצורה חריגה או מרגיש כאב במפרק, עדכן את המאמן. לא משנים לבד את התוכנית.",
  },
  {
    question: "מה עושים כשצד אחד חלש יותר?",
    answer:
      "מתחילים בצד החלש. בצד החזק עושים את אותו מספר חזרות, גם אם אפשר יותר. כך הפער לא ממשיך לגדול.",
  },
];

export default function MethodExperience() {
  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_50%_4%,rgba(180,133,79,.2),transparent_58%)]" />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-8">
        <section
          className="relative overflow-hidden rounded-[2rem] border border-white/10 px-5 pb-6 pt-7"
          style={{ background: "var(--panel)", boxShadow: "var(--panel-shadow)" }}
        >
          <RingMark />
          <p
            className="mb-3 text-[11px] font-extrabold tracking-[.18em]"
            style={{ color: "var(--wood-1)" }}
          >
            השיטה של FITAY
          </p>
          <h1 className="max-w-[18rem] text-[2.35rem] font-black leading-[1.04] tracking-[-.045em]">
            איך עובדים
            <br />
            <span className="wood-text">עם התוכנית</span>
          </h1>
          <p className="mt-4 max-w-[19rem] text-sm leading-6 text-white/68">
            התוכנית נועדה לבנות מסת שריר בכל הגוף, עם דגש על פלג הגוף העליון.
            עובדים לפי התוכנית, רושמים מה בוצע ומתקדמים רק כשהביצוע יציב.
          </p>
        </section>

        <section className="mt-9">
          <div>
            <h2 className="text-2xl font-black tracking-[-.025em]">
              ארבעה כללים בכל חזרה
            </h2>
            <p className="mt-1 text-sm leading-6 text-white/55">
              אם אחד מהם נפגע, מורידים קושי.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {RULES.map((rule, index) => (
              <article
                key={rule.title}
                className="relative min-h-40 overflow-hidden rounded-[1.55rem] border border-white/10 bg-white/[.045] p-4"
              >
                <span className="absolute -left-1 -top-5 text-8xl font-black text-white/[.025]">
                  {index + 1}
                </span>
                <div className="relative">
                  <RuleIcon index={index} />
                  <h3 className="mt-4 text-[15px] font-extrabold leading-5">{rule.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-white/58">{shortRule(index)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-9">
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
              שאלות <span className="wood-text">נפוצות</span>
            </h2>
            <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
          </div>

          <div className="mt-4 space-y-2.5">
            {QUESTIONS.map((item, index) => (
              <details
                key={item.question}
                className="method-question group overflow-hidden rounded-[1.45rem] border border-white/10"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#b4854f]/20 bg-[#b4854f]/10 text-[11px] font-black tabular-nums"
                    style={{ color: "var(--wood-1)" }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-sm font-extrabold leading-5">
                    {index === 4 ? (
                      <>
                        מה אומר הקצב{" "}
                        <span dir="ltr" className="inline-block">
                          30X1?
                        </span>
                      </>
                    ) : (
                      item.question
                    )}
                  </span>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/8 bg-black/10">
                    <ChevronIcon />
                  </span>
                </summary>
                <div className="px-4 pb-4">
                  <p className="rounded-2xl border border-white/7 bg-black/15 px-4 py-3.5 text-sm leading-6 text-white/68">
                    {item.answer}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function shortRule(index: number) {
  return [
    "מהתחלת התנועה ועד הסוף.",
    "שמור את הגוף יציב ובקו אחד.",
    "אחוז חזק כדי לשלוט בטבעות.",
    "הראש ממשיך את קו הגב.",
  ][index];
}

function RingMark() {
  return (
    <div className="pointer-events-none absolute -left-10 top-8 opacity-25">
      <div className="h-36 w-36 rounded-full border-[16px] border-[#b4854f]/35" />
      <div className="-mt-24 ml-12 h-24 w-24 rounded-full border-[11px] border-[#e0be93]/35" />
    </div>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

function RuleIcon({ index }: { index: number }) {
  const icons = [
    <path key="range" d="M4 12h16m-3-3 3 3-3 3M7 9l-3 3 3 3" />,
    <path key="core" d="M8 4c1.2 1 2.5 1.5 4 1.5S14.8 5 16 4m-8 16c1.2-1 2.5-1.5 4-1.5S14.8 19 16 20M8 4c-1 4-1 12 0 16m8-16c1 4 1 12 0 16M9 10h6m-6 4h6" />,
    <path key="grip" d="M8 11V7a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v7c0 4-2.5 6-6 6-2.5 0-4-1-5-3l-2-4a1.5 1.5 0 0 1 2.7-1.3L8 14" />,
    <path key="neck" d="M12 3v18M8 6h8M7 18h10" />,
  ];

  return (
    <span
      className="grid h-9 w-9 place-items-center rounded-xl bg-[#b4854f]/12"
      style={{ color: "var(--wood-1)" }}
    >
      <IconFrame>{icons[index]}</IconFrame>
    </span>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-white/30 transition-transform group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
