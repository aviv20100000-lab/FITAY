"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InitialCheckVideos, {
  type InitialCheckExerciseView,
} from "./InitialCheckVideos";

export default function ProgramSetup({
  programId,
  sessionsPerWeek,
  initialStatus,
  assignmentId,
  initialExercises,
  initialNote,
  videosReady,
}: {
  programId: string;
  sessionsPerWeek: number | null;
  initialStatus: string;
  assignmentId: string;
  /** ארבעת התרגילים הראשונים. קצר מארבעה עד שהאימון הראשון מסתיים. */
  initialExercises: InitialCheckExerciseView[];
  /** מה איתי כתב כשהחזיר לביצוע חוזר. ריק בכל מצב אחר. */
  initialNote: string;
  /** ארבעה תרגילים ולכל אחד סרטון. רק אז אפשר לשלוח. */
  videosReady: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmingCheck, setConfirmingCheck] = useState(false);

  const returned = initialStatus === "returned";
  // לפני השליחה או אחרי החזרה. אלה שני המצבים שבהם המתאמן פועל.
  const canSendCheck = initialStatus === "not_ready" || returned;
  const pendingRedo = initialExercises.filter((e) => e.needsRedo).length;

  async function post(url: string, body: object) {
    setBusy(true);
    setError("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "לא הצלחנו לשמור");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-4 space-y-3">
      {!sessionsPerWeek && (
        <div className="rounded-[1.5rem] border border-[#b4854f]/35 bg-[#b4854f]/10 p-4">
          <p className="font-black">כמה פעמים נוח לך להתאמן?</p>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--dim)" }}>
            בשני המסלולים משלימים 24 אימונים. רק הקצב משתנה.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[3, 4].map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={busy}
                onClick={() =>
                  post("/api/client/program-settings", {
                    programId,
                    sessionsPerWeek: amount,
                  })
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 font-extrabold disabled:opacity-50"
              >
                {amount} בשבוע
                {/*
                  כאן ישבה הערכת משך בשבועות. היא ירדה: התוכנית נמדדת
                  ב-24 אימונים, והקצב קובע רק כמה מהר מגיעים אליהם.
                */}
                <span className="mt-0.5 block text-xs font-semibold" style={{ color: "var(--dim)" }}>
                  24 אימונים בקצב הזה
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
        אותו בלוק משרת גם את הפעם הראשונה וגם ביצוע חוזר. ההבדל היחיד הוא
        ההערה של איתי בראש, ולכן אין טעם בשני מסכים כמעט זהים.
      */}
      {canSendCheck && initialExercises.length === 4 && (
        <div
          className="rounded-[1.4rem] px-4 py-3.5"
          style={{ background: "var(--soft-1)", border: "1px solid var(--line)" }}
        >
          {returned && (
            <div
              className="mb-3 rounded-2xl px-3.5 py-3"
              style={{
                background: "rgba(229,72,77,.10)",
                border: "1px solid rgba(229,72,77,.28)",
              }}
            >
              <p
                className="text-sm font-black"
                style={{ color: "var(--danger-text)" }}
              >
                FITAY ביקש שתצלם שוב
              </p>
              {initialNote && (
                <p className="mt-1.5 text-sm leading-relaxed">{initialNote}</p>
              )}
            </div>
          )}

          <InitialCheckVideos
            programId={programId}
            assignmentId={assignmentId}
            exercises={initialExercises}
            editable={!busy}
          />

          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            {confirmingCheck ? (
              <>
                <p className="font-bold">לשלוח את בדיקת הפתיחה?</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
                  אחרי השליחה האימונים יינעלו עד ש-FITAY יאשר את הבדיקה.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => post("/api/client/initial-check", { programId })}
                    className="rounded-2xl px-3 py-3 font-bold disabled:opacity-50"
                    style={{ background: "var(--wood-2)", color: "var(--accent-contrast)" }}
                  >
                    {busy ? "שולח…" : "כן, שלח"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingCheck(false)}
                    className="rounded-2xl px-3 py-3 font-semibold disabled:opacity-50"
                    style={{ background: "var(--soft-2)", border: "1px solid var(--line)" }}
                  >
                    ביטול
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || !videosReady}
                onClick={() => setConfirmingCheck(true)}
                className="w-full rounded-2xl px-3 py-3 text-right font-bold disabled:opacity-40"
                style={{ color: "var(--wood-1)", border: "1px solid var(--line)" }}
              >
                {returned ? "שלח את הביצוע החוזר" : "האימון הראשון עבר בסדר"}
                <span className="mt-1 block text-xs font-semibold" style={{ color: "var(--dim)" }}>
                  {videosReady
                    ? "שליחת בדיקת פתיחה לאישור FITAY"
                    : pendingRedo > 0
                      ? `אפשר לשלוח אחרי שתחליף ${pendingRedo} סרטונים`
                      : "אפשר לשלוח אחרי שכל ארבעת הסרטונים יעלו"}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {initialStatus === "pending" && (
        <div className="rounded-[1.4rem] border border-[#b4854f]/30 bg-[#b4854f]/10 px-4 py-3.5">
          <p className="font-extrabold text-[var(--wood-1)]">ממתינים לאישור FITAY</p>
          <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
            הדיווח והסרטונים התקבלו. תקבל עדכון כשאפשר להמשיך.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
    </div>
  );
}
