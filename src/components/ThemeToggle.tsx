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
      className="flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-bold transition-transform duration-75 active:scale-95"
      style={{
        background: "var(--soft-2)",
        border: "1px solid var(--line)",
        color: "var(--dim)",
      }}
    >
      <span className="theme-when-dark items-center gap-1.5">
        <SunIcon />
        בהיר
      </span>
      <span className="theme-when-light items-center gap-1.5">
        <MoonIcon />
        כהה
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 15.2A8 8 0 0 1 8.8 4 8.2 8.2 0 1 0 20 15.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
