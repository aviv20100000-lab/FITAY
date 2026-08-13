"use client";

import { useEffect, useState } from "react";

type ClientTheme = "dark" | "light";

const STORAGE_KEY = "fitay-client-theme";

/** שנה. הבחירה היא העדפה ולא הרשאה, ואין סיבה שהיא תפוג באמצע. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * מה המתאמן בחר.
 *
 * localStorage קודם, ואחריו מה שהשרת צייר. הסדר הזה הוא מה שמעביר את מי
 * שכבר בחר בהיר לפני שהעוגייה נכנסה: בטעינה הראשונה השרת עוד לא יודע
 * עליו, והבחירה השמורה אצלו בדפדפן היא זו שקובעת.
 */
function readTheme(): ClientTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // דפדפן שחוסם אחסון. נופלים למה שהשרת צייר.
  }
  return document.documentElement.dataset.clientTheme === "light" ? "light" : "dark";
}

function applyTheme(theme: ClientTheme) {
  document.documentElement.dataset.clientTheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // חסימת אחסון לא צריכה למנוע את החלפת התצוגה עצמה.
  }
  // העוגייה היא מה שהשרת קורא, ולכן היא זו שמונעת הבזק בטעינה הבאה.
  document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f3eee6" : "#0a0a0b");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ClientTheme>("dark");

  useEffect(() => {
    // גם כשאין מה לשנות, זה מה שכותב את העוגייה למי שעוד אין לו.
    const saved = readTheme();
    setTheme(saved);
    applyTheme(saved);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="שינוי מצב תצוגה"
      aria-pressed={theme === "light"}
      className="flex min-h-11 shrink-0 items-center rounded-lg px-3 text-xs font-bold transition-transform duration-75 active:scale-95"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        color: "var(--dim)",
      }}
    >
      {/* המילה אומרת הכל. שמש וירח גנריים לא הוסיפו מידע, רק סט אייקונים שני. */}
      <span className="theme-when-dark items-center">בהיר</span>
      <span className="theme-when-light items-center">כהה</span>
    </button>
  );
}

