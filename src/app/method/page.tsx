import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";
import {
  RULES,
  SECTIONS,
  TEMPO_DIGITS,
  TEMPO_NOTE,
  WEEK_DAYS,
  type MethodSection,
} from "@/lib/method";

export const metadata = { title: "השיטה · FITAY" };

/** החוברת של איתי כמסך. המתאמן צריך לדעת למה הוא עושה מה שהוא עושה. */
export default async function MethodPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const back = user.role === "coach" ? "/coach" : "/client";

  return (
    <>
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-7 pb-14">
        <Link href={back} className="text-sm" style={{ color: "var(--dim)" }}>
          ← חזרה
        </Link>

        <p className="mt-6 text-[11px] font-bold wood-text" style={{ letterSpacing: ".14em" }}>
          חוברת ההדרכה
        </p>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">השיטה</h1>
        <p className="mb-8 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          חמש שנים של ניסוי, מחקר ושיקום עצמי בטבעות. קרא את זה פעם אחת ברצינות.
          אחר כך כל מה שאתה עושה באימון יהיה הגיוני יותר.
        </p>

        {/* ארבעת החוקים — הכי חשוב, ולכן ראשון */}
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-bold">ארבעת החוקים</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--dim)" }}>
            בכל תרגיל, בכל חזרה. בלי זה התוכנית לא עובדת, ותצטרך ללמוד את
            התרגילים מהתחלה.
          </p>
          <div className="glass rounded-3xl p-2">
            {RULES.map((r, i) => (
              <div
                key={r.title}
                className="flex gap-3.5 px-3.5 py-4"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-extrabold"
                  style={{
                    background: "rgba(180,133,79,.18)",
                    border: "1px solid rgba(224,190,147,.3)",
                    color: "var(--wood-1)",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold">{r.title}</p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
                    {r.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* קצב */}
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-bold">הקצב (Tempo)</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--dim)" }}>
            כל ספרה היא מספר שניות. X = מהר ככל האפשר, 0 = בלי הפסקה.
          </p>

          <div className="glass mb-3 rounded-3xl p-6 text-center">
            <p className="text-4xl font-extrabold tabular-nums wood-text" dir="ltr">
              30X1
            </p>
          </div>

          <div className="glass rounded-3xl p-2">
            {TEMPO_DIGITS.map((d, i) => (
              <div
                key={d.pos}
                className="px-3.5 py-3.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
              >
                <p className="mb-0.5 text-sm font-bold">
                  <span style={{ color: "var(--wood-2)" }}>{d.pos}</span> · {d.label}
                </p>
                <p className="text-sm" style={{ color: "var(--dim)" }}>
                  {d.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
            {TEMPO_NOTE}
          </p>
        </section>

        {/* שבוע האימונים */}
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-bold">שבוע האימונים</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--dim)" }}>
            שלושה אימונים, לפחות 48 שעות מנוחה ביניהם.
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK_DAYS.map((d) => (
              <div
                key={d.day}
                className="rounded-xl py-2.5 text-center"
                style={{
                  background: d.training ? "rgba(180,133,79,.2)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${d.training ? "rgba(224,190,147,.35)" : "var(--line)"}`,
                }}
              >
                <p
                  className="text-[10px]"
                  style={{ color: d.training ? "var(--wood-1)" : "var(--faint)" }}
                >
                  {d.day.slice(0, 1)}
                </p>
                <p
                  className="text-[10px] font-bold"
                  style={{ color: d.training ? "var(--wood-1)" : "var(--faint)" }}
                >
                  {d.training ? "אימון" : "מנוחה"}
                </p>
              </div>
            ))}
          </div>
        </section>

        {SECTIONS.map((s) => (
          <Section key={s.id} section={s} />
        ))}

        <p
          className="mt-10 text-center text-sm leading-relaxed"
          style={{ color: "var(--faint)" }}
        >
          אחרי תאונת האופנוע ב-2018 הטבעות היו הדבר היחיד שיכולתי לעשות איתו משהו.
          <br />
          תוך פחות מחודשיים חזרתי לרמה שהייתי בה קודם.
          <br />
          <span style={{ color: "var(--wood-2)" }}>איתי סרד</span>
        </p>
      </div>
    </main>
    <BottomNav role={user.role === "coach" ? "coach" : "trainee"} />
    </>
  );
}

function Section({ section }: { section: MethodSection }) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-xl font-bold">{section.title}</h2>
      {section.lead && (
        <p className="mb-3 text-sm font-semibold" style={{ color: "var(--wood-1)" }}>
          {section.lead}
        </p>
      )}

      {section.paragraphs?.map((p, i) => (
        <p key={i} className="mb-3 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          {p}
        </p>
      ))}

      {section.bullets && (
        <ul className="glass space-y-2.5 rounded-3xl p-5">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
              <span style={{ color: "var(--wood-2)" }}>•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {section.example && (
        <div
          className="mt-3 rounded-3xl p-5"
          style={{
            background: "rgba(180,133,79,.10)",
            border: "1px solid rgba(224,190,147,.24)",
          }}
        >
          <p className="mb-2.5 text-sm font-bold" style={{ color: "var(--wood-1)" }}>
            {section.example.title}
          </p>
          <div className="space-y-1.5">
            {section.example.rows.map((r, i) => (
              <p key={i} className="text-sm tabular-nums" style={{ color: "var(--dim)" }}>
                {r}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
