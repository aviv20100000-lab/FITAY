"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MethodContent } from "@/lib/method-content";

const field: React.CSSProperties = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid var(--line)",
  color: "var(--text)",
};

/**
 * עריכת תוכן המדריך, למאמן FITAY בלבד.
 *
 * הכל נשמר בלחיצה אחת ולא שדה־שדה. זה מסך של פסקאות, ומאמן שמתקן ניסוח
 * בדרך כלל מתקן כמה דברים באותה ישיבה.
 *
 * הכללים הם ארבעה קבועים: לכל אחד יש אייקון משלו לפי מיקומו במסך, ולכן
 * אפשר לשנות את הניסוח אבל לא להוסיף חמישי. השאלות פתוחות לגמרי.
 */
export default function MethodEditor({ content }: { content: MethodContent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState(content.intro);
  const [rules, setRules] = useState(content.rules);
  const [questions, setQuestions] = useState(content.questions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function patchRule(index: number, key: "title" | "body" | "short", value: string) {
    setRules(rules.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }

  function patchQuestion(index: number, key: "question" | "answer", value: string) {
    setQuestions(
      questions.map((q, i) => (i === index ? { ...q, [key]: value } : q))
    );
  }

  function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= questions.length) return;
    const copy = questions.slice();
    const [row] = copy.splice(index, 1);
    copy.splice(to, 0, row);
    setQuestions(copy);
  }

  async function save() {
    setError("");
    setSaved(false);
    setBusy(true);
    const res = await fetch("/api/coach/method", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intro, rules, questions }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="relative z-20 mx-auto w-full max-w-md px-5 pt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl py-3 text-sm font-bold"
          style={{
            background: "rgba(255,255,255,.06)",
            border: "1px solid var(--line)",
            color: "var(--wood-1)",
          }}
        >
          עריכת המדריך
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-20 mx-auto w-full max-w-md px-5 pt-4">
      <div className="glass rounded-3xl p-5">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-lg font-bold">עריכת המדריך</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm"
            style={{ color: "var(--dim)" }}
          >
            סגור
          </button>
        </div>

        <label className="mb-1.5 block text-xs" style={{ color: "var(--dim)" }}>
          פסקת הפתיחה
        </label>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={3}
          maxLength={600}
          className="mb-5 w-full resize-none rounded-xl px-3 py-3 leading-relaxed outline-none"
          style={field}
        />

        <p className="mb-1 text-sm font-bold wood-text">ארבעת הכללים</p>
        <p className="mb-3 text-xs" style={{ color: "var(--dim)" }}>
          הכותרת והניסוח הקצר מופיעים בכרטיס. ההסבר הארוך נשמר לצידם.
        </p>

        {rules.map((rule, index) => (
          <div
            key={rule.id}
            className="mb-3 rounded-2xl p-3"
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid var(--line)",
            }}
          >
            <input
              value={rule.title}
              onChange={(e) => patchRule(index, "title", e.target.value)}
              maxLength={120}
              className="mb-2 w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              style={field}
            />
            <input
              value={rule.short}
              onChange={(e) => patchRule(index, "short", e.target.value)}
              maxLength={120}
              placeholder="ניסוח קצר לכרטיס"
              className="mb-2 w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={field}
            />
            <textarea
              value={rule.body}
              onChange={(e) => patchRule(index, "body", e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="ההסבר המלא"
              className="w-full resize-none rounded-xl px-3 py-2.5 text-sm leading-relaxed outline-none"
              style={field}
            />
          </div>
        ))}

        <div className="mb-3 mt-5 flex items-center justify-between gap-3">
          <p className="text-sm font-bold wood-text">שאלות נפוצות</p>
          <button
            type="button"
            onClick={() =>
              setQuestions([
                ...questions,
                { id: `new-${Date.now()}`, question: "", answer: "" },
              ])
            }
            className="text-xs font-bold"
            style={{ color: "var(--wood-1)" }}
          >
            + שאלה
          </button>
        </div>

        {questions.map((item, index) => (
          <div
            key={item.id}
            className="mb-3 rounded-2xl p-3"
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid var(--line)",
            }}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black tabular-nums"
                style={{
                  background: "rgba(180,133,79,.14)",
                  color: "var(--wood-1)",
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="העלה שאלה"
                className="h-7 w-7 rounded-lg text-sm disabled:opacity-30"
                style={{ background: "rgba(255,255,255,.06)", color: "var(--dim)" }}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === questions.length - 1}
                aria-label="הורד שאלה"
                className="h-7 w-7 rounded-lg text-sm disabled:opacity-30"
                style={{ background: "rgba(255,255,255,.06)", color: "var(--dim)" }}
              >
                ↓
              </button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() =>
                  setQuestions(questions.filter((_, i) => i !== index))
                }
                className="rounded-lg px-2.5 py-1 text-xs font-semibold"
                style={{ color: "#ffb4b6" }}
              >
                מחק
              </button>
            </div>

            <input
              value={item.question}
              onChange={(e) => patchQuestion(index, "question", e.target.value)}
              maxLength={200}
              placeholder="השאלה"
              className="mb-2 w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              style={field}
            />
            <textarea
              value={item.answer}
              onChange={(e) => patchQuestion(index, "answer", e.target.value)}
              rows={3}
              maxLength={1200}
              placeholder="התשובה"
              className="w-full resize-none rounded-xl px-3 py-2.5 text-sm leading-relaxed outline-none"
              style={field}
            />
          </div>
        ))}

        {error && (
          <p
            className="mb-3 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "rgba(229,72,77,.12)",
              border: "1px solid rgba(229,72,77,.3)",
              color: "#ffb4b6",
            }}
          >
            {error}
          </p>
        )}

        {saved && (
          <p className="mb-3 text-center text-sm" style={{ color: "var(--wood-1)" }}>
            נשמר. המתאמנים רואים את הטקסט החדש.
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="wood w-full rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
          style={{
            color: "#f7ebda",
            boxShadow:
              "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
          }}
        >
          {busy ? "שומר…" : "שמור את המדריך"}
        </button>
      </div>
    </div>
  );
}
