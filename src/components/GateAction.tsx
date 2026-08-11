"use client";

/**
 * המילה על סף השער במסך הבית.
 *
 * מסך האימון שומר את מצבו ב-localStorage תחת `fitay-workout-{id}` ומשחזר
 * אותו כשחוזרים אליו — תרגיל, סט, רישומים וטיימר. הפונקציונליות הזאת
 * קיימת ועובדת, אבל מסך הבית לא ידע עליה, ולכן הוא אמר "מתחילים" גם
 * למתאמן שיצא באמצע וחזר.
 *
 * המצב שמור על המכשיר ולא במסד, ולכן אין דרך לדעת אותו בשרת ואין טעם
 * בשאילתה. הבדיקה נעשית כאן, אחרי ההרכבה.
 *
 * ברירת המחדל היא "מתחילים", וזה גם מה שמוצג בשרת. מתאמן שאין לו אימון
 * פתוח לא רואה שום הבהוב, ומי שיש לו רואה את המילה מתחלפת מיד.
 */
import { useEffect, useState } from "react";

/** YYYY-MM-DD בשעון המקומי, בדיוק כמו במסך האימון. */
function localDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function GateAction({ workoutId }: { workoutId: string }) {
  const [inProgress, setInProgress] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`fitay-workout-${workoutId}`);
      if (!raw) return;
      const saved = JSON.parse(raw);
      // רק אימון של היום. מצב משומר מאתמול נחשב אימון נטוש, ומסך האימון
      // ממילא מוחק אותו ומדווח עליו כשנכנסים.
      if (saved?.savedDay === localDay(new Date())) setInProgress(true);
    } catch {
      // localStorage חסום בגלישה פרטית. במקרה כזה נשארים על "מתחילים".
    }
  }, [workoutId]);

  return <>{inProgress ? "ממשיכים" : "מתחילים"}</>;
}
