"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * מנות החימום, כמסך עריכה למאמן.
 *
 * החימום זהה בכל האימונים ולכן הוא רשימה אחת ולא פריטים בתוך אימון.
 * הרשימה הזאת הייתה קבועה בקוד, כלומר איתי ערך את כל שאר התוכן לבד אבל
 * דווקא בחימום היה צריך מפתח. עכשיו לא.
 *
 * התרגילים עצמם — השם, ההדגשים והסרטון — נשארים בלשונית התרגילים. כאן
 * נקבע רק מי נכנס לחימום, באיזה סדר וכמה. שני מקורות לאותו שם הוא בדיוק
 * מה שגרם למסך אחד להראות "מעגלי כתפיים" ולשני "סיבובי כתפיים".
 */

export type WarmupChoice = {
  id: string;
  name: string;
  /** האם התרגיל נמדד בזמן. קובע אם ברירת המחדל היא חזרות או שניות. */
  isHold: boolean;
  hasVideo: boolean;
};

export type WarmupPlanRow = {
  exerciseId: string;
  sets: number;
  reps: number | null;
  seconds: number | null;
};

type Row = {
  exerciseId: string;
  sets: string;
  amount: string;
  /** במה נמדד התרגיל בחימום: חזרות או שניות. */
  mode: "reps" | "seconds";
};

export default function WarmupEditor({
  choices,
  plan,
}: {
  choices: WarmupChoice[];
  plan: WarmupPlanRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    plan.map((row) => ({
      exerciseId: row.exerciseId,
      sets: String(row.sets),
      amount: String(row.reps ?? row.seconds ?? ""),
      mode: row.reps != null ? "reps" : "seconds",
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const nameOf = new Map(choices.map((c) => [c.id, c.name]));

  /*
   * תרגיל שנמחק בלשונית התרגילים בזמן שהלשונית הזאת פתוחה נשאר ב-rows,
   * כי המצב המקומי לא נבנה מחדש ברענון. בלי הסינון הזה הוא היה מוצג עם
   * המזהה באנגלית, ושמירה הייתה נכשלת בלי שהמאמן מבין למה.
   */
  const visible = rows.filter((row) => nameOf.has(row.exerciseId));
  const dropped = rows.length - visible.length;

  const chosen = new Set(visible.map((row) => row.exerciseId));
  const available = choices.filter((c) => !chosen.has(c.id));

  function touch(next: Row[]) {
    setRows(next);
    setSaved(false);
    setError("");
  }

  function add(id: string) {
    const choice = choices.find((c) => c.id === id);
    if (!choice) return;
    touch([
      ...visible,
      {
        exerciseId: id,
        sets: "2",
        amount: choice.isHold ? "20" : "10",
        mode: choice.isHold ? "seconds" : "reps",
      },
    ]);
  }

  /*
   * שלוש הפעולות עובדות על visible ולא על rows.
   *
   * המיקום שמגיע מהמסך הוא מיקום ברשימה המוצגת, ושורה מתה שיושבת בין
   * השורות הייתה מסיטה אותו ומזיזה או מוחקת את התרגיל הלא נכון. כתוצאה
   * מכך שורה מתה גם יורדת מהמצב בנגיעה הראשונה, וזה בדיוק מה שצריך
   * לקרות לה: אי אפשר לשמור אותה ממילא.
   */
  function remove(index: number) {
    touch(visible.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= visible.length) return;
    const next = [...visible];
    [next[index], next[target]] = [next[target], next[index]];
    touch(next);
  }

  function edit(index: number, patch: Partial<Row>) {
    touch(visible.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    setError("");
    setSaved(false);

    // Number("עשר") הוא NaN, וכל השוואה איתו היא false. בלי isFinite
    // טקסט שאינו מספר היה עובר את הבדיקה כאן ונופל בשרת בהודעה כללית.
    const bad = visible.find((row) => {
      const n = Number(row.amount.trim());
      return !row.amount.trim() || !Number.isFinite(n) || n < 1;
    });
    if (bad) {
      setError(`חסר מספר ב${nameOf.get(bad.exerciseId) ?? "אחד התרגילים"}`);
      return;
    }

    setBusy(true);
    const payload = {
      items: visible.map((row) => ({
        exerciseId: row.exerciseId,
        sets: row.sets,
        reps: row.mode === "reps" ? row.amount : null,
        seconds: row.mode === "seconds" ? row.amount : null,
      })),
    };

    let res: Response;
    try {
      res = await fetch("/api/coach/warmup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      setError("אין חיבור לרשת. נסה שוב.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const field: React.CSSProperties = {
    background: "var(--surface-2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
  };

  return (
    <div>
      <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
        אותו חימום בכל האימונים. מה שנקבע כאן הוא מה שהמתאמן רואה לפני
        שהוא מתחיל. את השם, ההדגשים והסרטון עורכים בלשונית התרגילים.
      </p>

      {dropped > 0 && (
        <p className="mb-3 text-sm font-bold" style={{ color: "var(--danger-text)" }}>
          {dropped === 1
            ? "תרגיל אחד שהיה בחימום נמחק מהספרייה והוא כבר לא ברשימה."
            : `${dropped} תרגילים שהיו בחימום נמחקו מהספרייה והם כבר לא ברשימה.`}
        </p>
      )}

      {visible.length === 0 ? (
        <p
          className="glass mb-4 rounded-3xl px-6 py-10 text-center text-sm leading-relaxed"
          style={{ color: "var(--dim)" }}
        >
          אין תרגילים בחימום. המתאמן יתחיל את האימון בלי חימום.
        </p>
      ) : (
        <div className="glass mb-4 overflow-hidden rounded-3xl">
          {visible.map((row, index) => {
            const choice = choices.find((c) => c.id === row.exerciseId);
            return (
              <div
                key={row.exerciseId}
                className="px-4 py-3.5"
                style={{ borderTop: index === 0 ? "none" : "1px solid var(--line)" }}
              >
                <div className="mb-2.5 flex items-center gap-2.5">
                  {/* מספר ממוסגר ולא אייקון גרירה: הסדר הוא המידע, והוא
                      גם מה שהמתאמן יראה. */}
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black tabular-nums"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--line)",
                      color: "var(--dim)",
                    }}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {choice?.name ?? "תרגיל שנמחק"}
                    </span>
                    {choice && !choice.hasVideo && (
                      <span className="text-xs" style={{ color: "var(--faint)" }}>
                        עדיין בלי סרטון
                      </span>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="להעלות למעלה"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold disabled:opacity-30"
                    style={{ border: "1px solid var(--line)", color: "var(--wood-1)" }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === visible.length - 1}
                    aria-label="להוריד למטה"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold disabled:opacity-30"
                    style={{ border: "1px solid var(--line)", color: "var(--wood-1)" }}
                  >
                    ↓
                  </button>
                </div>

                <div className="flex items-end gap-2">
                  <label className="flex-1">
                    <span className="mb-1 block text-xs" style={{ color: "var(--dim)" }}>
                      סטים
                    </span>
                    <input
                      inputMode="numeric"
                      value={row.sets}
                      onChange={(e) => edit(index, { sets: e.target.value })}
                      className="w-full rounded-xl px-3 py-2.5 outline-none"
                      style={field}
                    />
                  </label>
                  <label className="flex-1">
                    <span className="mb-1 block text-xs" style={{ color: "var(--dim)" }}>
                      {row.mode === "reps" ? "חזרות" : "שניות"}
                    </span>
                    <input
                      inputMode="numeric"
                      value={row.amount}
                      onChange={(e) => edit(index, { amount: e.target.value })}
                      className="w-full rounded-xl px-3 py-2.5 outline-none"
                      style={field}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      edit(index, { mode: row.mode === "reps" ? "seconds" : "reps" })
                    }
                    className="min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold"
                    style={{ border: "1px solid var(--line)", color: "var(--wood-1)" }}
                  >
                    {row.mode === "reps" ? "לשניות" : "לחזרות"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="mt-2.5 min-h-9 text-xs font-semibold"
                  style={{ color: "var(--dim)" }}
                >
                  הוצאה מהחימום
                </button>
              </div>
            );
          })}
        </div>
      )}

      {available.length > 0 && (
        <div className="glass mb-4 rounded-3xl p-4">
          <p className="mb-2.5 text-sm font-bold wood-text">להוסיף לחימום</p>
          <div className="flex flex-wrap gap-2">
            {available.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => add(choice.id)}
                className="min-h-11 rounded-xl px-3 text-sm font-semibold"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  color: "var(--text)",
                }}
              >
                + {choice.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {choices.length === 0 && (
        <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
          אין עדיין תרגילי חימום בספרייה. מוסיפים אותם בלשונית התרגילים,
          בקטגוריית החימום, ואז הם מופיעים כאן.
        </p>
      )}

      {error && (
        <p className="mb-3 text-sm font-bold" style={{ color: "var(--danger-text)" }}>
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-3 text-sm font-bold wood-text">
          נשמר. המתאמן יראה את החימום החדש באימון הבא.
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="wood w-full rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
        style={{ color: "var(--on-wood)" }}
      >
        {busy ? "שומר" : "שמירת החימום"}
      </button>
    </div>
  );
}
