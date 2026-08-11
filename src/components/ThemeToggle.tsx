"use client";

import { useEffect, useState } from "react";

type ClientTheme = "dark" | "light";

const STORAGE_KEY = "fitay-client-theme";

function readTheme(): ClientTheme {
  return document.documentElement.dataset.clientTheme === "light" ? "light" : "dark";
}

function applyTheme(theme: ClientTheme) {
  document.documentElement.dataset.clientTheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f3eee6" : "#0a0a0b");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ClientTheme>("dark");

  useEffect(() => {
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

