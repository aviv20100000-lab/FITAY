import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";

export default async function CoachHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "coach") redirect("/client");

  const [trainees, exercises] = await Promise.all([
    db.execute(`
      SELECT u.id, u.name, u.rehab_mode, u.active,
             (SELECT COUNT(*) FROM completions c WHERE c.trainee_id = u.id) AS done,
             (SELECT COUNT(*) FROM assignments a WHERE a.trainee_id = u.id) AS programs
        FROM users u
       WHERE u.role = 'trainee'
       ORDER BY u.name
    `),
    db.execute("SELECT COUNT(*) c FROM exercises"),
  ]);

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
        <header className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fitay.svg" alt="FITAY" className="w-28" />
        </header>

        <p className="text-sm" style={{ color: "var(--dim)" }}>
          שלום
        </p>
        <h1 className="mb-7 text-3xl font-bold tracking-tight">{user.name}</h1>

        <div className="mb-4 grid grid-cols-2 gap-2.5">
          <div className="glass rounded-3xl px-3 py-4 text-center">
            <b className="block text-2xl font-extrabold wood-text">
              {trainees.rows.length}
            </b>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              מתאמנים
            </span>
          </div>
          <div className="glass rounded-3xl px-3 py-4 text-center">
            <b className="block text-2xl font-extrabold">
              {String(exercises.rows[0].c)}
            </b>
            <span className="text-xs" style={{ color: "var(--dim)" }}>
              תרגילים בספרייה
            </span>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2.5">
          <Link
            href="/coach/trainees/new"
            className="wood rounded-2xl py-4 text-center font-extrabold"
            style={{
              color: "#f7ebda",
              boxShadow:
                "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
            }}
          >
            + מתאמן
          </Link>
          <Link
            href="/coach/programs"
            className="rounded-2xl py-4 text-center font-extrabold"
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid var(--line)",
              color: "var(--wood-1)",
            }}
          >
            תוכניות
          </Link>
        </div>

        <h2 className="mb-3 text-lg font-bold">המתאמנים שלי</h2>

        {trainees.rows.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-12 text-center">
            <p className="mb-2 text-lg font-semibold">עוד אין מתאמנים</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              כאן יופיעו המתאמנים אחרי שתוסיף אותם.
            </p>
          </div>
        ) : (
          <div className="glass rounded-3xl p-2">
            {trainees.rows.map((t, i) => (
              <div
                key={String(t.id)}
                className="flex items-center gap-3 px-3 py-3.5"
                style={{
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-bold"
                  style={{
                    background: "rgba(255,255,255,.06)",
                    border: "1px solid rgba(255,255,255,.13)",
                    color: "var(--wood-1)",
                  }}
                >
                  {String(t.name).trim().charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{String(t.name)}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>
                    {String(t.programs)} תוכניות · {String(t.done)} אימונים
                  </p>
                </div>
                {Number(t.rehab_mode) === 1 && (
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{
                      background: "rgba(107,143,181,.16)",
                      border: "1px solid rgba(107,143,181,.4)",
                      color: "var(--rehab)",
                    }}
                  >
                    שיקום
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
