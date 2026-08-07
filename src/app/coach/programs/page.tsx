import { redirect } from "next/navigation";
import Link from "next/link";
import { programLevelName } from "@/lib/program-levels";
import BackLink from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import NewProgramForm from "./NewProgramForm";

type ProgramRow = {
  id: string;
  title: string;
  description: string;
  level: number;
  weeks: number;
  workouts: number;
  assigned: number;
};

export default async function ProgramsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const programs = await db.execute(`
    SELECT p.id, p.title, p.description, p.level, p.weeks, p.is_template,
           (SELECT COUNT(*) FROM workouts w WHERE w.program_id = p.id) AS workouts,
           (SELECT COUNT(*) FROM assignments a
             WHERE a.program_id = p.id AND a.status = 'active') AS assigned
      FROM programs p
     ORDER BY p.is_template DESC, p.level, p.created_at DESC
  `);

  const templates = programs.rows.filter((p) => Number(p.is_template) === 1);
  const personal = programs.rows.filter((p) => Number(p.is_template) === 0);

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 45% at 50% -6%, rgba(180,133,79,.13), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-2 pb-10">
        <BackLink href="/coach" className="mb-6">
          חזרה לדף הראשי
        </BackLink>

        <header className="mb-7">
          <p
            className="mb-1 text-xs font-bold wood-text"
            style={{ letterSpacing: ".14em" }}
          >
            ניהול אימונים
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight">תוכניות</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
            כל התבניות והתוכניות האישיות במקום אחד.
          </p>
        </header>

        <div className="mb-5 grid grid-cols-2 gap-2.5">
          <Summary value={templates.length} label="תבניות" />
          <Summary value={personal.length} label="תוכניות אישיות" />
        </div>

        <NewProgramForm templates={templates.map((t) => ({
          id: String(t.id),
          title: String(t.title),
          description: String(t.description ?? ""),
        }))} />

        <Section
          title="תבניות"
          description="בסיס שממנו אפשר ליצור תוכניות"
          empty="עוד אין תבניות"
          rows={templates.map(toProgramRow)}
        />
        <Section
          title="תוכניות אישיות"
          description="תוכניות שנוצרו בנפרד מהתבניות"
          empty="עוד אין תוכניות אישיות"
          rows={personal.map(toProgramRow)}
        />
      </div>
    </main>
  );
}

function toProgramRow(row: Record<string, unknown>): ProgramRow {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ""),
    level: Number(row.level),
    weeks: Number(row.weeks),
    workouts: Number(row.workouts),
    assigned: Number(row.assigned),
  };
}

function Summary({ value, label }: { value: number; label: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3.5">
      <b className="block text-2xl font-extrabold wood-text">{value}</b>
      <span className="text-xs" style={{ color: "var(--dim)" }}>
        {label}
      </span>
    </div>
  );
}

function Section({
  title,
  description,
  empty,
  rows,
}: {
  title: string;
  description: string;
  empty: string;
  rows: ProgramRow[];
}) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold">{title}</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--dim)" }}>
            {description}
          </p>
        </div>
        <span
          className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold"
          style={{
            background: "rgba(255,255,255,.055)",
            border: "1px solid var(--line)",
            color: "var(--dim)",
          }}
        >
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="glass rounded-3xl px-6 py-8 text-center text-sm" style={{ color: "var(--dim)" }}>
          {empty}
        </p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((p) => (
            <Link
              key={String(p.id)}
              href={`/coach/programs/${p.id}`}
              className="glass block overflow-hidden rounded-3xl transition active:scale-[.99]"
            >
              <div className="p-5 pb-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span
                    className="rounded-lg px-2.5 py-1 text-xs font-extrabold"
                    style={{
                      background: "rgba(180,133,79,.12)",
                      border: "1px solid rgba(180,133,79,.4)",
                      color: "var(--wood-1)",
                    }}
                  >
                    {programLevelName(p.level)}
                  </span>
                  {p.assigned > 0 && (
                    <span className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
                      {p.assigned} מתאמנים
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-extrabold leading-snug">{p.title}</h3>
                {p.description && (
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
                    {p.description}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Metric value={p.workouts} label="אימונים" />
                  <Metric value={24} label="אימונים במסלול" />
                  <Metric value={p.assigned} label="מתאמנים" />
                </div>
              </div>

              <div
                className="flex items-center justify-between px-5 py-3.5 text-sm font-bold"
                style={{
                  borderTop: "1px solid var(--line)",
                  background: "rgba(255,255,255,.025)",
                  color: "var(--wood-1)",
                }}
              >
                <span>פתיחה ועריכה</span>
                <span aria-hidden="true" className="text-lg">
                  ←
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="rounded-2xl px-2 py-2.5 text-center"
      style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--line)" }}
    >
      <b className="block text-base font-extrabold">{value}</b>
      <span className="text-xs" style={{ color: "var(--faint)" }}>
        {label}
      </span>
    </div>
  );
}
