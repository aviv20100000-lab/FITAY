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
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[30rem]"
        style={{ background: "radial-gradient(circle at 50% 4%, var(--wood-glow), transparent 58%)" }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-8">
        {/*
          צילום אמיתי מאחורי כרטיס הפתיח.

          עד עכשיו היה כאן לוח כהה עם טבעת מצוירת בפינה, וזה נכון אבל
          שטוח: המדריך הוא המסך שאמור להסביר מה השיטה הזאת, והוא היה
          המסך היחיד בלי שום חומר. אותה טכניקה בדיוק של מסך הכניסה ושל
          כפתורי העץ — תמונה עם צעיף מעליה — רק שהצעיף כאן כבד יותר, כי
          מעליו יושבת פסקה שלמה ולא מילה אחת.
        */}
        <section
          className="relative overflow-hidden rounded-[2rem] border border-[var(--border-1)] px-5 pb-6 pt-7"
          style={{
            backgroundImage:
              "var(--guide-photo-veil), url('/login-rings.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: "var(--panel-shadow)",
          }}
        >
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
          <p className="mt-4 max-w-[19rem] whitespace-pre-line text-sm leading-6 text-[var(--dim)]">
            {intro}
          </p>
        </section>

        <section className="mt-9">
          {/* אותה שפה של כותרת השאלות הנפוצות: מילת עץ וקו שנמוג. */}
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-[1.7rem] font-black leading-tight tracking-[-.025em]">
              ארבעה כללים <span className="wood-text">בכל חזרה</span>
            </h2>
            <span className="h-px flex-1" style={{ background: "linear-gradient(to left, var(--wood-border), transparent)" }} />
          </div>
          <p className="mt-1 text-sm leading-6 text-[var(--dim)]">
            אם אחד מהם נפגע, מורידים קושי.
          </p>

          {/*
            שורות בכרטיס אחד, בלי אייקון ובלי מספר.
            אייקוני הקו שהיו כאן היו סט שני באפליקציה. מספור ממוסגר, שהיה
            כאן אחריהם, אמר סדר — וארבעת הכללים אינם שלבים: הם קורים בו
            זמנית בכל חזרה. שורות שוות משקל עם קו מפריד דק אומרות בדיוק את
            היחס הזה, וזו ממילא שפת הרשימות של FITAY.

            מה שכן היה שבור: הכרטיס היה glass, כלומר טשטוש מעל שחור, ובמצב
            כהה זה כמעט לא נראה. הוא ישב צמוד מתחת לכרטיס הפתיח שיש לו לוח
            אטום, צל וטבעת רפאים, והפער בין השניים הוא מה שנקרא כשטוח.
            במצב בהיר הכרטיס דווקא בלט — לבן על קרם — ובכל זאת נקרא שטוח,
            כי הבעיה השנייה קיימת בשני המצבים: זה התוכן בדרגה הגבוהה ביותר
            במסך והוא לבש את בגד הרשימה הרגילה.
            לכן משטח עץ עם מסגרת עץ, וקווי הפרדה בגוון עץ. בלי panel-shadow:
            שני בלוקים מרוממים בראש המסך הופכים אותו לעליון-כבד. הפתיח נשאר
            הלוח הכהה שמורם מהדף, והכללים הם משטח חמים וממוסגר לצידו.
          */}
          <div
            className="mt-8 overflow-hidden rounded-3xl"
            style={{
              /*
                שכבה אחת מעל בסיס אטום, בהצהרה אחת. בלי לחשב צבע ובלי אלפא
                של Tailwind על משתנה CSS — היא נשברת בשקט.

                השכבה שטוחה ולא גרדיאנט. גרסה קודמת דהתה מלמעלה למטה, ואז
                הכלל הראשון ישב על עץ חמים והרביעי על כמעט-שחור — כלומר סדר
                יורד של חשיבות, בדיוק מה שהורדנו כשהורדנו את המספור. משקל
                שווה דורש משטח שווה.

                wood-wash-strong ולא wood-wash, בגלל המצב הבהיר. בחישוב
                ההרכבה בפועל, wood-wash מעל panel נותן rgb(241,231,219) מול
                רקע דף rgb(243,238,230) — הפרש של 2/7/11, כלומר הכרטיס קיים
                רק בזכות המסגרת. עם strong זה rgb(234,221,207), הפרש 9/17/23,
                וזה חול חמים ממשי מול קרם. במצב הכהה שתי הדרגות עובדות,
                ולכן ערך אחד משרת את שניהם ואין צורך בטלאי למצב הבהיר.
              */
              background:
                "linear-gradient(0deg, var(--wood-wash-strong), var(--wood-wash-strong)), var(--panel)",
              border: "1px solid var(--wood-border)",
            }}
          >
            {(() => {
              const visibleRules = RULE_ORDER.map((id) =>
                rules.find((item) => item.id === id)
              ).filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));
              return visibleRules.map((rule, index) => (
                <div
                  key={rule.id}
                  className="px-5 py-4"
                  style={{
                    /* חלש מהמסגרת בכוונה. כשהקו הפנימי והמסגרת באותה עוצמה
                       הכרטיס נקרא כטבלה במקום כמשטח אחד. וחלש גם מהמשטח
                       עצמו, שהוא strong, אחרת הקו נבלע בו. */
                    borderTop: index === 0 ? "none" : "1px solid var(--wood-wash)",
                  }}
                >
                  {/* בלי פס מבטא בקצה השורה. היה כאן אחד, והוא נראה כמו
                      border-left של תבנית מוכנה — התבנית הכי שחוקה שיש
                      ברשימות. הוא נכנס כפיצוי על כרטיס שטוח, ומרגע שיש
                      משטח עץ ומסגרת עץ אין על מה לפצות. עדיף בלי מאשר גנרי. */}
                  <h3 className="text-[15px] font-extrabold leading-5">{rule.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--dim)]">{rule.short}</p>
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
            <span className="h-px flex-1" style={{ background: "linear-gradient(to left, var(--wood-border), transparent)" }} />
          </div>

          <div className="mt-4">
            {grouped.map(({ key, label, items }, groupIndex) => (
              <section key={key} className={groupIndex ? "mt-8" : ""}>
                {/* אותה שפה של הכותרת הראשית: מבטא עץ וקו שנמוג. קטנה
                    ממנה בגודל ובעוצמת הקו, כדי שההיררכיה תישמר. */}
                {/*
                  בלי אייקון לקבוצה. דגל, מטרה, עמודות ומשולש אזהרה הם
                  אייקוני ספרייה גנריים, והכותרת הדו-גונית עם הקו הדוהה
                  כבר נושאת את כל ההיררכיה שצריך.
                */}
                {label && (
                  <h3 className="mb-4 flex items-center gap-3">
                    <span className="wood-text shrink-0 text-[1.15rem] font-black leading-tight tracking-[-.025em]">
                      {label}
                    </span>
                    <span className="h-px flex-1" style={{ background: "linear-gradient(to left, var(--wood-border), transparent)" }} />
                    <span className="shrink-0 text-[11px] font-black tabular-nums text-[var(--faint)]">
                      {items.length}
                    </span>
                  </h3>
                )}

                <div className="space-y-2.5">
                  {items.map(({ item, number }) => (
                    <details
                      key={item.id}
                      className="method-question group overflow-hidden rounded-[1.45rem] border border-[var(--border-1)]"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--wood-border)] bg-[var(--wood-wash)] text-[11px] font-black tabular-nums"
                          style={{ color: "var(--wood-1)" }}
                        >
                          {String(number).padStart(2, "0")}
                        </span>
                        <span className="flex-1 text-sm font-extrabold leading-5">
                          <Bidi text={item.question} />
                        </span>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-1)] bg-[var(--surface-1)]">
                          <ChevronIcon />
                        </span>
                      </summary>
                      <div className="px-4 pb-4">
                        {/* איתי כותב ירידות שורה בעורך, ובלעדיהן תשובה ארוכה
                            נדחסת לפסקה אחת. pre-line שומר אותן ומקפל רווחים. */}
                        <p className="whitespace-pre-line rounded-2xl border border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-3.5 text-sm leading-6 text-[var(--dim)]">
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




function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-[var(--faint)] transition-transform group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
