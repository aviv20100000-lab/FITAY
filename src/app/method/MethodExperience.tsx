import type { ReactNode } from "react";
import { RULES, SECTIONS, TEMPO_DIGITS, TEMPO_NOTE, type MethodSection } from "@/lib/method";

type Moment = "before" | "during" | "after" | "stuck";

const MOMENTS: {
  id: Moment;
  label: string;
  eyebrow: string;
  title: string;
  items: string[];
}[] = [
  {
    id: "before",
    label: "לפני אימון",
    eyebrow: "דקה לפני שמתחילים",
    title: "מכינים את הגוף ואת הראש",
    items: [
      "פתח את האימון שהמאמן בנה לך. לא מאלתרים תרגילים.",
      "כוון את הטבעות לאותו גובה ורשום אותו כדי שתוכל לחזור עליו.",
      "עשה את החימום שמופיע בתוכנית.",
      "כאב חד או כאב במפרק? לא מתחילים לפני שמעדכנים את המאמן.",
    ],
  },
  {
    id: "during",
    label: "בזמן אימון",
    eyebrow: "הדברים שבאמת קובעים",
    title: "איכות לפני מספרים",
    items: [
      "כל חזרה בטווח תנועה מלא ובקצב שרשום.",
      "שמור בטן חזקה, אחיזה חזקה וצוואר ישר.",
      "הטכניקה נשברת? עצור. חזרה לא טובה לא מקדמת אותך.",
      "רשום את מה שביצעת באמת, גם אם היה פחות מהיעד.",
    ],
  },
  {
    id: "after",
    label: "אחרי אימון",
    eyebrow: "לפני שסוגרים את המסך",
    title: "נותנים למאמן תמונה אמיתית",
    items: [
      "רשום איך הרגיש האימון ואם היה כאב.",
      "הוסף הערה קצרה על תרגיל שהיה קשה או קל במיוחד.",
      "שתה, אכול והתאושש. השיפור קורה גם בין האימונים.",
      "האימון הבא הוא לפי התוכנית שלך, לא לפי החשק להוסיף עוד.",
    ],
  },
  {
    id: "stuck",
    label: "משהו תקוע",
    eyebrow: "לא נלחמים בתרגיל",
    title: "משנים חכם, לא בכוח",
    items: [
      "קשה מדי? העלה טבעות, שנה זווית או הוסף גומייה.",
      "קל מדי? שמור קודם על ביצוע מושלם ואז העלה קושי.",
      "לא משלים חזרות? פצל ליותר סטים עם פחות חזרות.",
      "כאב חד, כאב במפרק או ירידה חריגה בכוח? עצור ועדכן את המאמן.",
    ],
  },
];

const LIBRARY_GROUPS = [
  {
    id: "start",
    title: "מתחילים נכון",
    subtitle: "רמה, ציוד ומטרת התוכנית",
    icon: <FlagIcon />,
    sectionIds: ["goal", "levels", "gear"],
  },
  {
    id: "technique",
    title: "מתאמנים נכון",
    subtitle: "קצב, סוגי תרגילים ועבודה על צד אחד",
    icon: <RingsIcon />,
    sectionIds: ["compound-isolation", "unilateral", "failure"],
  },
  {
    id: "progress",
    title: "מתקדמים נכון",
    subtitle: "איך להעלות קושי בלי להרוס טכניקה",
    icon: <TrendIcon />,
    sectionIds: ["intensity", "accumulation", "too-hard", "too-easy", "many-reps", "rest-pause"],
  },
  {
    id: "recovery",
    title: "מתאוששים נכון",
    subtitle: "עומס, מנוחה, מים ותזונה",
    icon: <RecoveryIcon />,
    sectionIds: ["phases", "week", "nutrition", "realistic"],
  },
];

const SECTION_MAP = new Map(SECTIONS.map((section) => [section.id, section]));

export default function MethodExperience() {

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_50%_8%,rgba(180,133,79,.2),transparent_56%)]" />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#12100e] px-5 pb-6 pt-7 shadow-[0_30px_70px_-40px_rgba(180,133,79,.7)]">
          <div className="pointer-events-none absolute -left-12 top-12 h-44 w-44 rounded-full border-[18px] border-[#b4854f]/10" />
          <div className="pointer-events-none absolute -left-2 top-28 h-28 w-28 rounded-full border-[12px] border-[#e0be93]/10" />

          <p className="mb-3 text-[11px] font-extrabold tracking-[.18em] text-[#d5a974]">
            שיטת FITAY
          </p>
          <h1 className="max-w-[17rem] text-[2.35rem] font-black leading-[1.02] tracking-[-.045em]">
            פחות לקרוא.
            <br />
            <span className="wood-text">יותר לדעת מה לעשות.</span>
          </h1>
          <p className="mt-4 max-w-[18rem] text-sm leading-6 text-white/55">
            כל מה שצריך כדי להתאמן חזק, מדויק ובטוח — בשפה פשוטה.
          </p>

          <div className="mt-7 grid grid-cols-3 gap-2">
            <Stat value="4" label="חוקי בסיס" />
            <Stat value="30X1" label="קצב נפוץ" dir="ltr" />
            <Stat value="1" label="מאמן שמחליט" />
          </div>
        </section>

        <section className="mt-8">
          <SectionHeading
            kicker="בדיוק לרגע הזה"
            title="מה אתה צריך עכשיו?"
            subtitle="בחר מצב וקבל רק את הדברים החשובים."
          />

          <div className="mt-4 space-y-2.5">
            {MOMENTS.map((moment, momentIndex) => (
              <details
                key={moment.id}
                open={momentIndex === 0}
                className="group overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[.04] open:border-[#b4854f]/30 open:bg-white/[.065]"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#b4854f]/12 text-sm font-black text-[#e0be93]">
                    {momentIndex + 1}
                  </span>
                  <span className="flex-1 text-sm font-extrabold">{moment.label}</span>
                  <ChevronIcon />
                </summary>
                <div className="border-t border-white/7 px-5 pb-2 pt-4">
                  <p className="text-[11px] font-bold text-[#c99b65]">{moment.eyebrow}</p>
                  <h3 className="mt-1 text-xl font-extrabold">{moment.title}</h3>
                  <div className="mt-3 divide-y divide-white/7">
                    {moment.items.map((item, index) => (
                      <div key={item} className="flex gap-3 py-3.5">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#b4854f]/15 text-xs font-black text-[#e0be93]">
                          {index + 1}
                        </span>
                        <p className="text-sm leading-6 text-white/72">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading
            kicker="שמור עליהם בכל חזרה"
            title="ארבעת חוקי הברזל"
            subtitle="אם אחד מהם נשבר, מורידים קושי."
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {RULES.map((rule, index) => (
              <article
                key={rule.title}
                className="relative min-h-44 overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[.045] p-4"
              >
                <span className="absolute -left-1 -top-5 text-8xl font-black text-white/[.025]">
                  {index + 1}
                </span>
                <div className="relative">
                  <RuleIcon index={index} />
                  <h3 className="mt-5 text-[15px] font-extrabold leading-5">{rule.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-white/48">{rule.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading
            kicker="נראה מסובך. זה לא."
            title="איך קוראים קצב?"
            subtitle="כל סימן אומר מה לעשות בחלק אחר של החזרה."
          />

          <div className="mt-4 overflow-hidden rounded-[1.8rem] border border-[#b4854f]/25 bg-[linear-gradient(145deg,rgba(180,133,79,.16),rgba(255,255,255,.025))]">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-5">
              <div>
                <p className="text-xs font-bold text-[#c99b65]">הקצב הנפוץ בתוכנית</p>
                <p className="mt-1 text-xs text-white/45">קוראים משמאל לימין</p>
              </div>
              <p className="text-4xl font-black tracking-[.12em] wood-text" dir="ltr">
                30X1
              </p>
            </div>
            <div className="grid grid-cols-4 divide-x divide-x-reverse divide-white/8" dir="ltr">
              {TEMPO_DIGITS.map((digit, index) => (
                <div key={digit.pos} className="px-2 py-4 text-center" dir="rtl">
                  <p className="text-2xl font-black text-[#e0be93]">{"30X1"[index]}</p>
                  <p className="mt-1 text-[10px] font-bold leading-4 text-white/70">{digit.label}</p>
                </div>
              ))}
            </div>
            <p className="px-5 py-4 text-sm leading-6 text-white/58">{TEMPO_NOTE}</p>
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading
            kicker="לא חייבים לקרוא הכול"
            title="ספריית השיטה"
            subtitle="פתח רק את הנושא שאתה צריך כרגע."
          />

          <div className="mt-4 space-y-3">
            {LIBRARY_GROUPS.map((group) => (
              <details
                key={group.id}
                className="group overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[.035] open:bg-white/[.055]"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#b4854f]/12 text-[#dfb77f]">
                    {group.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold">{group.title}</span>
                    <span className="mt-0.5 block text-xs text-white/42">{group.subtitle}</span>
                  </span>
                  <ChevronIcon />
                </summary>

                <div className="border-t border-white/7 px-4 pb-4">
                  {group.sectionIds.map((sectionId) => {
                    const section = SECTION_MAP.get(sectionId);
                    return section ? <KnowledgeCard key={section.id} section={section} /> : null;
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10 overflow-hidden rounded-[1.8rem] border border-[#b4854f]/20 bg-[#b4854f]/8 p-5">
          <p className="text-xs font-extrabold text-[#d5a974]">זכור</p>
          <h2 className="mt-1 text-xl font-black">לא בטוח? לא מנחשים.</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            עוצרים, רושמים הערה ושואלים את המאמן. שינוי עומס או מעבר רמה עושים רק יחד איתו.
          </p>
        </section>

        <p className="mt-8 text-center text-xs leading-5 text-white/28">
          השיטה נבנתה מניסיון אמיתי על הטבעות.
          <br />
          עבודה מדויקת. התקדמות סבלנית.
        </p>
      </div>
    </main>
  );
}

function Stat({ value, label, dir }: { value: string; label: string; dir?: "ltr" }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[.035] px-2 py-3 text-center">
      <p className="text-lg font-black text-[#e0be93]" dir={dir}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold text-white/38">{label}</p>
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-extrabold tracking-[.08em] text-[#c99b65]">{kicker}</p>
      <h2 className="mt-1 text-2xl font-black tracking-[-.025em]">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-white/45">{subtitle}</p>
    </div>
  );
}

function KnowledgeCard({ section }: { section: MethodSection }) {
  return (
    <details className="group/item border-b border-white/7 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
        <span className="h-1.5 w-1.5 rounded-full bg-[#b4854f]" />
        <span className="flex-1">{section.title}</span>
        <span className="text-lg font-light text-white/35 transition-transform group-open/item:rotate-45">
          +
        </span>
      </summary>
      <div className="pb-5 pr-3">
        {section.lead && <p className="mb-3 text-sm font-bold leading-6 text-[#dfb77f]">{section.lead}</p>}
        {section.paragraphs?.map((paragraph) => (
          <p key={paragraph} className="mb-3 text-sm leading-6 text-white/55">
            {paragraph}
          </p>
        ))}
        {section.bullets && (
          <ul className="space-y-2.5">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2 text-sm leading-6 text-white/58">
                <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#c99b65]" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}
        {section.note && (
          <p className="mt-3 rounded-xl border border-white/8 bg-black/15 p-3 text-xs leading-5 text-white/48">
            {section.note}
          </p>
        )}
        {section.example && (
          <div className="mt-4 rounded-2xl border border-[#b4854f]/20 bg-[#b4854f]/8 p-4">
            <p className="mb-2 text-xs font-extrabold text-[#d5a974]">{section.example.title}</p>
            {section.example.rows.map((row) => (
              <p key={row} className="py-1 text-xs text-white/52">
                {row}
              </p>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

function FlagIcon() {
  return (
    <IconFrame>
      <path d="M5 21V4m0 1h10l-2 3 2 3H5" />
    </IconFrame>
  );
}

function RingsIcon() {
  return (
    <IconFrame>
      <path d="M8 3v6m8-6v6" />
      <circle cx="8" cy="15" r="4.5" />
      <circle cx="16" cy="15" r="4.5" />
    </IconFrame>
  );
}

function TrendIcon() {
  return (
    <IconFrame>
      <path d="m4 17 5-5 4 3 7-8" />
      <path d="M15 7h5v5" />
    </IconFrame>
  );
}

function RecoveryIcon() {
  return (
    <IconFrame>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v6h-6" />
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
