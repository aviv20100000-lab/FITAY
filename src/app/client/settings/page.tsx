import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import db from "@/lib/db";
import ThemeToggle from "@/components/ThemeToggle";
import PushToggle from "@/components/PushToggle";
import LogoutButton from "@/components/LogoutButton";

export const metadata = { title: "הגדרות · FITAY" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === "coach") redirect("/coach");

  const coachRes = await db.execute({
    sql: "SELECT phone FROM users WHERE role = 'coach' AND active = 1 LIMIT 1",
    args: [],
  });
  const coachPhone = coachRes.rows[0]?.phone ? String(coachRes.rows[0].phone) : null;

  return (
    <main className="relative min-h-dvh overflow-hidden grain">
      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-10 pt-2">
        <h1 className="mb-1 text-3xl font-bold tracking-tight">הגדרות</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--dim)" }}>
          הפרופיל, התצוגה וההתראות שלך.
        </p>

        <section className="glass mb-4 rounded-3xl p-5">
          <h2 className="mb-4 font-bold">הפרטים שלי</h2>
          <ProfileRow label="שם" value={user.name} />
          <ProfileRow label="טלפון" value={user.phone} />
          <form action="/api/client/gender" method="post" className="pt-3">
            <fieldset>
              <legend className="mb-2 text-sm" style={{ color: "var(--dim)" }}>
                מגדר
              </legend>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {[
                  { value: "unspecified", label: "לא צוין" },
                  { value: "male", label: "גבר" },
                  { value: "female", label: "אישה" },
                ].map((option) => (
                  <label key={option.value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value={option.value}
                      defaultChecked={
                        option.value === (user.gender ?? "unspecified")
                      }
                      className="peer sr-only"
                    />
                    <span
                      className="flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-bold peer-checked:ring-2 peer-checked:ring-[var(--wood-1)]"
                      style={{
                        background: "rgba(180,133,79,.12)",
                        border: "1px solid rgba(180,133,79,.4)",
                        color: "var(--wood-1)",
                      }}
                    >
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              className="min-h-11 w-full rounded-lg text-sm font-bold"
              style={{
                background: "rgba(180,133,79,.12)",
                border: "1px solid rgba(180,133,79,.4)",
                color: "var(--wood-1)",
              }}
            >
              שמירה
            </button>
          </form>
        </section>

        <section className="glass mb-4 rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">תצוגה</h2>
              <p className="text-sm" style={{ color: "var(--dim)" }}>בחירת מצב בהיר או כהה</p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        <PushToggle persistent hint="ההתראות פעילות במכשיר הזה." />

        {coachPhone && (
          <a
            href={`tel:${coachPhone}`}
            className="glass mb-4 flex min-h-14 items-center justify-between rounded-3xl px-5 py-4 font-bold"
          >
            <span>
              <span className="block">יצירת קשר עם FITAY</span>
              <span className="text-sm font-normal" style={{ color: "var(--dim)" }}>{coachPhone}</span>
            </span>
            <span style={{ color: "var(--wood-1)" }}>חיוג</span>
          </a>
        )}

        <section className="rounded-3xl p-5" style={{ background: "var(--soft-1)", border: "1px solid var(--line)" }}>
          <h2 className="mb-1 font-bold">יציאה מהחשבון</h2>
          <p className="mb-3 text-sm" style={{ color: "var(--dim)" }}>
            תידרש התחברות מחדש במכשיר הזה.
          </p>
          <LogoutButton />
        </section>
      </div>
    </main>
  );
}

function ProfileRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span className="text-sm" style={{ color: "var(--dim)" }}>{label}</span>
      <span className="font-semibold" dir={label === "טלפון" ? "ltr" : undefined}>{value}</span>
    </div>
  );
}
