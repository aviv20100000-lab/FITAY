import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import NewProgramForm from "./NewProgramForm";

export default async function ProgramsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const programs = await db.execute(`
    SELECT p.id, p.title, p.level, p.weeks, p.is_template,
           (SELECT COUNT(*) FROM workouts w WHERE w.program_id = p.id) AS workouts,
           (SELECT COUNT(*) FROM assignments a WHERE a.program_id = p.id) AS assigned
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

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pt-7 pb-10">
        <Link href="/coach" className="mb-6 inline-block text-sm" style={{ color: "var(--dim)" }}>
          ← חזרה
        </Link>

        <h1 className="mb-7 text-3xl font-bold tracking-tight">תוכניות</h1>

        <NewProgramForm templates={templates.map((t) => ({
          id: String(t.id),
          title: String(t.title),
        }))} />

        <Section title="תבניות" empty="עוד אין תבניות" rows={templates} />
        <Section title="תוכניות אישיות" empty="עוד אין תוכניות אישיות" rows={personal} />
      </div>
    </main>
  );
}

function Section({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
}) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
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
              className="glass block rounded-3xl p-5"
            >
              <p className="mb-1 text-[11px] font-bold wood-text" style={{ letterSpacing: ".14em" }}>
                רמה {String(p.level)}
              </p>
              <p className="text-lg font-bold">{String(p.title)}</p>
              <p className="text-sm" style={{ color: "var(--dim)" }}>
                {String(p.workouts)} אימונים · {String(p.weeks)} שבועות
                {Number(p.assigned) > 0 && ` · ${p.assigned} מתאמנים`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
