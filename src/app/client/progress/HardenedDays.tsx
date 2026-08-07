/**
 * ההקשיות, מקובצות לפי יום.
 *
 * מתאמן שהוקשו לו חמישה תרגילים באותו ערב קיבל חמש שורות עם אותו טקסט
 * ואותו תאריך, וההישג הכי גדול בלשונית נראה כמו יומן טבלאי. יום עם כמה
 * תרגילים הוא עכשיו כרטיס אחד: התאריך בכותרת והתרגילים כתגיות, כלומר
 * חגיגה אחת במקום חמש שורות.
 *
 * יום עם תרגיל אחד נשאר שורה רגילה, כי כרטיס שלם לתרגיל בודד היה מנפח
 * את הדף בלי להוסיף מידע.
 *
 * ויתור על הגומייה שומר ניסוח משלו גם בתוך כרטיס. זה הישג אחר מעליית
 * דרגה, ומיזוג של השניים תחת מילה אחת היה מוחק את ההבדל.
 */

export type HardeningRow = {
  name: string;
  /** "drop-band" הוא ויתור על הגומייה. כל השאר הם עליית דרגה. */
  kind: string;
  /** מפתח היום, מעוצב בשרת כדי שהקיבוץ והתצוגה ידברו על אותו יום. */
  dayKey: string;
  /** התאריך כפי שהוא מוצג, למשל 7 באוגוסט 2026. */
  heading: string;
};

type Day = {
  dayKey: string;
  heading: string;
  levelUp: string[];
  dropBand: string[];
};

function groupByDay(rows: HardeningRow[]): Day[] {
  const days: Day[] = [];
  const byKey = new Map<string, Day>();
  // השורות מגיעות ממוינות מהחדש לישן, ולכן סדר ההופעה נשמר מעצמו.
  for (const row of rows) {
    let day = byKey.get(row.dayKey);
    if (!day) {
      day = { dayKey: row.dayKey, heading: row.heading, levelUp: [], dropBand: [] };
      byKey.set(row.dayKey, day);
      days.push(day);
    }
    if (row.kind === "drop-band") day.dropBand.push(row.name);
    else day.levelUp.push(row.name);
  }
  return days;
}

export default function HardenedDays({ rows }: { rows: HardeningRow[] }) {
  const days = groupByDay(rows);

  return (
    <div className="flex flex-col gap-2.5">
      {days.map((day) => {
        const total = day.levelUp.length + day.dropBand.length;
        if (total === 1) {
          const dropped = day.dropBand.length === 1;
          return (
            <div key={day.dayKey} className="glass flex items-center gap-3 rounded-3xl px-4 py-3.5">
              <Badge />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {dropped ? day.dropBand[0] : day.levelUp[0]}
                </p>
                <p className="text-xs" style={{ color: "var(--dim)" }}>
                  {dropped ? "ויתרת על הגומייה" : "עלית דרגה"} · {day.heading}
                </p>
              </div>
            </div>
          );
        }

        return (
          <div key={day.dayKey} className="glass rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <Badge />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-extrabold">{day.heading}</p>
                <p className="text-xs" style={{ color: "var(--dim)" }}>
                  {total} תרגילים באותו יום
                </p>
              </div>
            </div>

            {day.levelUp.length > 0 && (
              <TagRow label="עלית דרגה" names={day.levelUp} />
            )}
            {day.dropBand.length > 0 && (
              <div className={day.levelUp.length > 0 ? "mt-4" : ""}>
                <TagRow label="ויתרת על הגומייה" names={day.dropBand} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TagRow({ label, names }: { label: string; names: string[] }) {
  return (
    <>
      <p className="mb-2 text-xs font-semibold" style={{ color: "var(--faint)" }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name, i) => (
          <span
            key={`${name}-${i}`}
            /* אותה תגית שכבר קיימת במסך הבית, בלי סגנון חדש. */
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{
              background: "rgba(180,133,79,.24)",
              border: "1px solid rgba(224,190,147,.45)",
              color: "var(--wood-1)",
            }}
          >
            {name}
          </span>
        ))}
      </div>
    </>
  );
}

function Badge() {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black"
      style={{
        background: "rgba(180,133,79,.18)",
        border: "1px solid rgba(224,190,147,.35)",
        color: "var(--wood-1)",
      }}
    >
      ↑
    </span>
  );
}
