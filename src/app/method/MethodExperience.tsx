import type { ReactNode } from "react";
import { QUESTION_GROUPS, type MethodContent } from "@/lib/method-content";
import { Bidi } from "@/components/Bidi";

/**
 * סדר ההצגה של ארבעת הכללים במסך. זה סדר תצוגה בלבד — לא נוגע
 * בסדר במסד או ב-index שהעורך משתמש בו.
 */
const RULE_ORDER = ["neck", "core", "grip", "range"] as const;

/**
 * מסך המדריך. כל הטקסט מגיע מבחוץ, מהמסד, כדי שמאמן FITAY יוכל לערוך
 * אותו בלי מפתח. הקוד כאן אחראי רק על איך זה נראה.
 */
export default function MethodExperience({ content }: { content: MethodContent }) {
  const { intro, rules, questions } = content;

  /**
   * השאלות לפי קבוצות, בסדר הקבוע של QUESTION_GROUPS.
   *
   * המספור רץ מאחת עד הסוף לאורך כל הקבוצות ולא מתאפס בכל אחת: "שאלה 07"
   * צריכה להיות שאלה אחת במסך, אחרת שלוש שאלות שונות נושאות את אותו מספר.
   * קבוצה שאיתי רוקן מכל שאלותיה לא מציגה כותרת ריקה.
   */
  let number = 0;
  const grouped = [
    ...QUESTION_GROUPS.map((group) => ({
      key: group.key as string,
      label: group.label as string,
      items: questions.filter((item) => item.group === group.key),
    })),
    // שאלות שאיתי עוד לא שייך. בלי כותרת, ואם אלה כל השאלות המסך זהה
    // למה שהיה לפני הקיבוץ.
    { key: "", label: "", items: questions.filter((item) => !item.group) },
  ]
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({ item, number: ++number })),
    }));

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
          <p className="mt-4 max-w-[19rem] whitespace-pre-line text-sm leading-6 text-white/68">
            {intro}
          </p>
        </section>

        <section className="mt-9">
          {/* אותה שפה של כותרת השאלות הנפוצות: מילת עץ וקו שנמוג. */}
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
              ארבעה כללים <span className="wood-text">בכל חזרה</span>
            </h2>
            <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
          </div>
          <p className="mt-1 text-sm leading-6 text-white/55">
            אם אחד מהם נפגע, מורידים קושי.
          </p>

          {/*
            אותה שפה של כותרות קבוצות השאלות: תג מרובע ממוסגר ולידו הטקסט.
            בלי קו מחבר ובלי זוהר — הרווח בין השורות הוא כל ההפרדה שצריך.
          */}
          <div className="mt-8 flex flex-col gap-5">
            {(() => {
              const visibleRules = RULE_ORDER.map((id) =>
                rules.find((item) => item.id === id)
              ).filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));
              return visibleRules.map((rule) => (
                <div key={rule.id} className="flex items-start gap-3">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#b4854f]/25 bg-[#b4854f]/10"
                    style={{ color: "var(--wood-1)" }}
                  >
                    <RuleIcon id={rule.id} />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <h3 className="text-[15px] font-extrabold leading-5">{rule.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-white/58">{rule.short}</p>
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>

        <section className="mt-9">
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
              שאלות <span className="wood-text">נפוצות</span>
            </h2>
            <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/45 to-transparent" />
          </div>

          <div className="mt-4">
            {grouped.map(({ key, label, items }, groupIndex) => (
              <section key={key} className={groupIndex ? "mt-8" : ""}>
                {/* אותה שפה של הכותרת הראשית: מבטא עץ וקו שנמוג. קטנה
                    ממנה בגודל ובעוצמת הקו, כדי שההיררכיה תישמר. */}
                {label && (
                  <h3 className="mb-4 flex items-center gap-2.5">
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#b4854f]/25 bg-[#b4854f]/10"
                      style={{ color: "var(--wood-1)" }}
                    >
                      <GroupIcon groupKey={key} />
                    </span>
                    <span className="wood-text shrink-0 text-[1.15rem] font-black leading-tight tracking-[-.025em]">
                      {label}
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-l from-[#b4854f]/35 to-transparent" />
                    <span className="shrink-0 text-[11px] font-black tabular-nums text-white/28">
                      {items.length}
                    </span>
                  </h3>
                )}

                <div className="space-y-2.5">
                  {items.map(({ item, number }) => (
                    <details
                      key={item.id}
                      className="method-question group overflow-hidden rounded-[1.45rem] border border-white/10"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#b4854f]/20 bg-[#b4854f]/10 text-[11px] font-black tabular-nums"
                          style={{ color: "var(--wood-1)" }}
                        >
                          {String(number).padStart(2, "0")}
                        </span>
                        <span className="flex-1 text-sm font-extrabold leading-5">
                          <Bidi text={item.question} />
                        </span>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/8 bg-black/10">
                          <ChevronIcon />
                        </span>
                      </summary>
                      <div className="px-4 pb-4">
                        {/* איתי כותב ירידות שורה בעורך, ובלעדיהן תשובה ארוכה
                            נדחסת לפסקה אחת. pre-line שומר אותן ומקפל רווחים. */}
                        <p className="whitespace-pre-line rounded-2xl border border-white/7 bg-black/15 px-4 py-3.5 text-sm leading-6 text-white/68">
                          {item.answer}
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
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

/**
 * אייקון לכל כלל, לפי ה-id שלו. כך שהאייקון נשאר צמוד לכלל הנכון גם
 * כשסדר התצוגה שונה מסדר הכללים במסד.
 */
function RuleIcon({ id }: { id: string }) {
  const icons: Record<string, ReactNode> = {
    range: <path d="M4 12h16m-3-3 3 3-3 3M7 9l-3 3 3 3" />,
    core: (
      <path d="M8 4c1.2 1 2.5 1.5 4 1.5S14.8 5 16 4m-8 16c1.2-1 2.5-1.5 4-1.5S14.8 19 16 20M8 4c-1 4-1 12 0 16m8-16c1 4 1 12 0 16M9 10h6m-6 4h6" />
    ),
    grip: (
      <path d="M8 11V7a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v7c0 4-2.5 6-6 6-2.5 0-4-1-5-3l-2-4a1.5 1.5 0 0 1 2.7-1.3L8 14" />
    ),
    neck: <path d="M12 3v18M8 6h8M7 18h10" />,
  };

  return <IconFrame>{icons[id]}</IconFrame>;
}

/**
 * אייקון לכל קבוצת שאלות.
 *
 * המפתחות מגיעים מ-QUESTION_GROUPS. קבוצה שתתווסף שם בלי אייקון כאן
 * תקבל את ברירת המחדל במקום להשאיר חור בכותרת.
 */
function GroupIcon({ groupKey }: { groupKey: string }) {
  const icons: Record<string, ReactNode> = {
    start: <path d="M6 21V4m0 0h11l-2.2 3.3L17 10.5H6" />,
    form: (
      <>
        <circle cx="12" cy="12" r="6.5" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    progress: <path d="M4 20h16M7.5 20v-6M12 20V8m4.5 12v-9" />,
    trouble: (
      <path d="M12 9.5v4m0 3h.01M10.6 4.7 3 18a1.9 1.9 0 0 0 1.6 2.9h14.8A1.9 1.9 0 0 0 21 18L13.4 4.7a1.6 1.6 0 0 0-2.8 0" />
    ),
  };

  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icons[groupKey] ?? icons.form}
      </g>
    </svg>
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
