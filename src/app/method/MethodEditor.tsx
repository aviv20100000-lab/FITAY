"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUESTION_GROUPS,
  toQuestionGroup,
  type MethodContent,
  type MethodQuestion,
  type QuestionGroup,
} from "@/lib/method-content";

/** עריכה שלא פורסמה, על המכשיר של המאמן בלבד. */
const STORAGE_KEY = "fitay-method-edit";

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

  /**
   * שלב האישור לפני פרסום.
   *
   * המדריך הוא המסך שכל המתאמנים קוראים, והשמירה כאן משנה אותו אצל כולם
   * באותו רגע. לחיצה אחת בלי עצירה היא הדרך לפרסם בטעות ניסוח שעוד באמצע
   * עריכה. אין כאן טיוטה: הטקסט לא נשמר בשום מקום עד האישור, ויציאה
   * מהמסך פשוט מבטלת אותו.
   */
  const [confirming, setConfirming] = useState(false);

  /** יש שינויים שהוקלדו ועוד לא פורסמו. */
  const [dirty, setDirty] = useState(false);

  /** האם ניסיון השחזור מהמכשיר כבר רץ. עד אז אסור לכתוב לאחסון. */
  const [restored, setRestored] = useState(false);

  /**
   * שחזור עריכה שלא פורסמה.
   *
   * מעבר ללשונית אחרת בסרגל התחתון הוא ניווט פנימי, ולכן הרכיב הזה יורד
   * מהמסך בלי ש-beforeunload נורה בכלל. בלי האחסון המקומי, לחיצה אחת על
   * "מתאמנים" באמצע עריכה מוחקת אותה בשקט. אותו פתרון בדיוק כמו במסך
   * האימון, שם אימון באמצע שורד יציאה מהאפליקציה.
   *
   * זו לא טיוטה: שום דבר לא נשמר בשרת ואף מתאמן לא רואה כלום עד האישור.
   */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          if (typeof saved.intro === "string") setIntro(saved.intro);

          // הכללים הם ארבעה קבועים עם מזהים ידועים. עותק מקומי ישן שלא
          // תואם נזרק, אחרת המסך היה מציג כלל בלי אייקון.
          const ids = content.rules.map((rule) => rule.id).join();
          if (
            Array.isArray(saved.rules) &&
            saved.rules.length === content.rules.length &&
            saved.rules.map((rule: { id: string }) => rule?.id).join() === ids
          ) {
            setRules(saved.rules);
          }

          // עריכה שנשמרה על המכשיר לפני הקיבוץ מגיעה בלי שדה קבוצה.
          if (Array.isArray(saved.questions)) {
            setQuestions(
              saved.questions.map((q: MethodQuestion) => ({
                ...q,
                group: toQuestionGroup(q?.group),
              }))
            );
          }
          setDirty(true);
          setOpen(true);
        }
      }
    } catch {
      // עותק פגום באחסון. ממשיכים עם הטקסט מהשרת.
    }
    setRestored(true);
    // פעם אחת בטעינה בלבד. content משתנה אחרי כל פרסום, ושחזור חוזר
    // היה דורס את מה שאיתי מקליד באותו רגע.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      if (dirty) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ intro, rules, questions })
        );
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // אין מקום באחסון. העריכה ממשיכה לעבוד, פשוט בלי שחזור.
    }
  }, [restored, dirty, intro, rules, questions]);

  /**
   * אזהרה לפני שהעריכה נמחקת.
   *
   * האחסון המקומי מכסה ניווט פנימי, וזה מכסה רענון וסגירת לשונית. הדפדפן
   * מציג כאן את החלון הסטנדרטי שלו ומתעלם מכל טקסט שנעביר לו, אבל עצם
   * העצירה היא מה שחשוב.
   */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /**
   * כל שינוי מבטל אישור שכבר נפתח.
   *
   * בלי זה אפשר ללחוץ שמור, להמשיך לתקן מילה בזמן שהאישור פתוח, ואז
   * ללחוץ אשר. מה שמתפרסם יהיה הטקסט החדש, שאף פעם לא הוצג באישור.
   */
  function touched() {
    setConfirming(false);
    setSaved(false);
    setDirty(true);
  }

  function patchRule(index: number, key: "title" | "body" | "short", value: string) {
    touched();
    setRules(rules.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }

  function patchQuestion(index: number, key: "question" | "answer", value: string) {
    touched();
    setQuestions(
      questions.map((q, i) => (i === index ? { ...q, [key]: value } : q))
    );
  }

  function setGroup(index: number, group: QuestionGroup | "") {
    touched();
    setQuestions(questions.map((q, i) => (i === index ? { ...q, group } : q)));
  }

  function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= questions.length) return;
    touched();
    const copy = questions.slice();
    const [row] = copy.splice(index, 1);
    copy.splice(to, 0, row);
    setQuestions(copy);
  }

  async function save() {
    setError("");
    setSaved(false);
    setConfirming(false);
    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/coach/method", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intro, rules, questions }),
      });
    } catch {
      // בלי זה העריכה נשארת על "שומר…", ואיתי לא יודע שהנוסח לא נשמר.
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
    setDirty(false);
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
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold">עריכת המדריך</p>
            {dirty && (
              <p className="text-xs font-semibold" style={{ color: "var(--wood-1)" }}>
                יש שינויים שעוד לא פורסמו
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (
                dirty &&
                !confirm("יש שינויים שעוד לא פורסמו. לסגור ולוותר עליהם?")
              ) {
                return;
              }
              // סגירה מוותרת על העריכה במפורש, ולכן גם מחזירה את הטופס
              // לטקסט שמוצג עכשיו למתאמנים.
              setIntro(content.intro);
              setRules(content.rules);
              setQuestions(content.questions);
              setConfirming(false);
              setDirty(false);
              setOpen(false);
            }}
            className="shrink-0 text-sm"
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
          onChange={(e) => {
            touched();
            setIntro(e.target.value);
          }}
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
            onClick={() => {
              touched();
              setQuestions([
                ...questions,
                {
                  id: `new-${Date.now()}`,
                  question: "",
                  answer: "",
                  group: "start",
                },
              ]);
            }}
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
                onClick={() => {
                  touched();
                  setQuestions(questions.filter((_, i) => i !== index));
                }}
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
            {/* תחת איזו כותרת השאלה תופיע במסך. הסדר בין הקבוצות קבוע,
                והחצים למעלה מסדרים את השאלות בתוך הקבוצה. */}
            <select
              value={item.group}
              onChange={(e) => setGroup(index, e.target.value as QuestionGroup | "")}
              aria-label="קבוצת השאלה"
              className="mb-2 w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={field}
            >
              <option value="" style={{ color: "#111" }}>
                בלי כותרת קבוצה
              </option>
              {QUESTION_GROUPS.map((group) => (
                <option key={group.key} value={group.key} style={{ color: "#111" }}>
                  {group.label}
                </option>
              ))}
            </select>
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

        {confirming ? (
          <div
            className="rounded-2xl p-4"
            style={{
              background: "rgba(180,133,79,.14)",
              border: "1px solid rgba(224,190,147,.35)",
            }}
          >
            <p className="mb-1 font-extrabold wood-text">לפרסם למתאמנים?</p>
            <p className="mb-4 text-xs leading-5" style={{ color: "var(--dim)" }}>
              הטקסט הזה יחליף את המדריך אצל כל המתאמנים ברגע האישור, כולל
              פסקת הפתיחה, ארבעת הכללים ו-{questions.length} השאלות.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ background: "rgba(255,255,255,.06)", color: "var(--dim)" }}
              >
                חזרה לעריכה
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="wood flex-1 rounded-xl py-3 font-extrabold disabled:opacity-60"
                style={{ color: "#f7ebda" }}
              >
                {busy ? "מפרסם…" : "אשר ופרסם"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError("");
              setSaved(false);
              setConfirming(true);
            }}
            disabled={busy}
            className="wood w-full rounded-2xl py-4 text-lg font-extrabold disabled:opacity-60"
            style={{
              color: "#f7ebda",
              boxShadow:
                "0 16px 34px -14px rgba(110,74,40,.75), inset 0 1px 0 rgba(255,255,255,.28)",
            }}
          >
            שמור את המדריך
          </button>
        )}
      </div>
    </div>
  );
}
