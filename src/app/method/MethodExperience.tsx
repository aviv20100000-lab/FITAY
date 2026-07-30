import type { ReactNode } from "react";
import { RULES } from "@/lib/method";

const START_STEPS = [
  {
    number: "01",
    title: "צפה בסרטון",
    body: "לפני תרגיל חדש, ראה פעם אחת איך איתי מבצע אותו.",
  },
  {
    number: "02",
    title: "עשה חימום",
    body: "החימום שבתוכנית מכין את הכתפיים, המרפקים ושורש כף היד.",
  },
  {
    number: "03",
    title: "בחר קושי מתאים",
    body: "הרמה נכונה כשאתה משלים את היעד בטכניקה טובה, ועדיין צריך להתאמץ.",
  },
];

const TEMPO = [
  { sign: "3", title: "יורד", body: "3 שניות בשליטה" },
  { sign: "0", title: "למטה", body: "בלי עצירה" },
  { sign: "X", title: "עולה", body: "חזק ומהר" },
  { sign: "1", title: "למעלה", body: "עוצר שנייה" },
];

export default function MethodExperience() {
  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(circle_at_50%_4%,rgba(180,133,79,.2),transparent_58%)]" />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#12100e] px-5 pb-6 pt-7 shadow-[0_30px_70px_-40px_rgba(180,133,79,.7)]">
          <RingMark />
          <p className="mb-3 text-[11px] font-extrabold tracking-[.18em] text-[#d5a974]">
            השיטה של FITAY
          </p>
          <h1 className="max-w-[18rem] text-[2.35rem] font-black leading-[1.04] tracking-[-.045em]">
            איך עובדים
            <br />
            <span className="wood-text">עם התוכנית</span>
          </h1>
          <p className="mt-4 max-w-[19rem] text-sm leading-6 text-white/58">
            המטרה היא לבנות מסת שריר בכל הגוף, עם דגש על פלג הגוף העליון. הטבעות
            מחזקות גם את האחיזה, הכתפיים והשליטה בגוף.
          </p>

          <div className="mt-6 rounded-2xl border border-[#b4854f]/20 bg-[#b4854f]/8 px-4 py-3.5">
            <p className="text-xs font-bold leading-5 text-[#dfb77f]">
              משחק כדורגל או מתאמן במסגרת נוספת?
            </p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              עדכן את המאמן. הוא יתאים את אימוני הטבעות לעומס ולמשחקים שלך.
            </p>
          </div>
        </section>

        <section className="mt-9">
          <SectionHeading title="לפני האימון הראשון" subtitle="שלושה דברים וזהו." />
          <div className="mt-4 divide-y divide-white/7 overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[.04] px-4">
            {START_STEPS.map((step) => (
              <article key={step.number} className="flex gap-4 py-4">
                <span className="pt-0.5 text-xs font-black tabular-nums text-[#b4854f]">
                  {step.number}
                </span>
                <div>
                  <h2 className="text-[15px] font-extrabold">{step.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-white/50">{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-9">
          <SectionHeading
            title="ארבעה כללים בכל חזרה"
            subtitle="אם הטכניקה נשברת, מורידים קושי."
          />
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
                  <h2 className="mt-4 text-[15px] font-extrabold leading-5">{rule.title}</h2>
                  <p className="mt-2 text-xs leading-5 text-white/45">{shortRule(index)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-9">
          <SectionHeading title="מה אומר 30X1?" subtitle="זה סדר הביצוע של חזרה אחת." />
          <div className="mt-4 overflow-hidden rounded-[1.7rem] border border-[#b4854f]/25 bg-[linear-gradient(145deg,rgba(180,133,79,.15),rgba(255,255,255,.025))]">
            <div className="grid grid-cols-4 divide-x divide-x-reverse divide-white/8" dir="ltr">
              {TEMPO.map((step) => (
                <div key={step.sign} className="px-2 py-4 text-center" dir="rtl">
                  <p className="text-2xl font-black text-[#e0be93]">{step.sign}</p>
                  <p className="mt-1 text-[11px] font-extrabold text-white/72">{step.title}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-white/38">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-9">
          <SectionHeading
            title="איך מתקדמים"
            subtitle="המאמן צריך לראות מה באמת קרה באימון."
          />
          <div className="glass-solid mt-4 rounded-[1.7rem] p-5">
            <ul className="space-y-4">
              <ProgressItem number="1">
                רשום את מספר החזרות או השניות שביצעת באמת.
              </ProgressItem>
              <ProgressItem number="2">
                ברוב הסטים עצור לפני שהחזרה הבאה תהרוס את הטכניקה.
              </ProgressItem>
              <ProgressItem number="3">
                המאמן מחליט מתי להוסיף חזרות, לשנות זווית או לעבור רמה.
              </ProgressItem>
            </ul>
          </div>
        </section>

        <section className="mt-9">
          <SectionHeading title="נתקעת בתרגיל?" subtitle="פתח את המצב שמתאים לך." />
          <div className="mt-4 space-y-2.5">
            <HelpCard title="התרגיל קשה מדי" icon={<ArrowDownIcon />}>
              העלה את הטבעות, שנה את זווית הגוף או השתמש בגומייה. שמור על טווח תנועה
              מלא.
            </HelpCard>
            <HelpCard title="התרגיל קל מדי" icon={<ArrowUpIcon />}>
              אל תשנה לבד את התוכנית. רשום שהיה קל והמאמן יעלה את הקושי באימון הבא.
            </HelpCard>
            <HelpCard title="יש כאב או עייפות חריגה" icon={<AlertIcon />}>
              עצור את התרגיל ועדכן את המאמן. כאב במפרק הוא לא חלק מהאימון.
            </HelpCard>
          </div>
        </section>

        <section className="mt-9 rounded-[1.7rem] border border-[#b4854f]/22 bg-[#b4854f]/8 p-5 text-center">
          <p className="text-lg font-black">מתי עוצרים את הסט?</p>
          <p className="mt-2 text-sm leading-6 text-white/48">
            ברגע שאתה מאבד טווח תנועה או שליטה. רשום מה הצלחת והמשך לתרגיל הבא.
          </p>
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

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-black tracking-[-.025em]">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-white/43">{subtitle}</p>
    </div>
  );
}

function ProgressItem({ number, children }: { number: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-6 text-white/65">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#b4854f]/15 text-xs font-black text-[#e0be93]">
        {number}
      </span>
      <span>{children}</span>
    </li>
  );
}

function HelpCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-[1.45rem] border border-white/10 bg-white/[.04] open:border-[#b4854f]/25 open:bg-white/[.06]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#b4854f]/12 text-[#dfb77f]">
          {icon}
        </span>
        <span className="flex-1 text-sm font-extrabold">{title}</span>
        <ChevronIcon />
      </summary>
      <p className="border-t border-white/7 px-4 py-4 text-sm leading-6 text-white/55">
        {children}
      </p>
    </details>
  );
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
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#b4854f]/12 text-[#dfb77f]">
      <IconFrame>{icons[index]}</IconFrame>
    </span>
  );
}

function ArrowDownIcon() {
  return (
    <IconFrame>
      <path d="M12 4v16m-6-6 6 6 6-6" />
    </IconFrame>
  );
}

function ArrowUpIcon() {
  return (
    <IconFrame>
      <path d="M12 20V4m-6 6 6-6 6 6" />
    </IconFrame>
  );
}

function AlertIcon() {
  return (
    <IconFrame>
      <path d="M12 8v5m0 3h.01" />
      <path d="M10.3 4.5 3 18a1.3 1.3 0 0 0 1.2 2h15.6a1.3 1.3 0 0 0 1.2-2L13.7 4.5a1.9 1.9 0 0 0-3.4 0Z" />
    </IconFrame>
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
      className="text-white/30 transition-transform group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
