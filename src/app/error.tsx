"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/DeveloperErrorReporter";

export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--bg)] px-6 text-center text-[var(--text)]">
      <div className="max-w-sm">
        <p className="text-2xl font-black">משהו לא הסתדר</p>
        <p className="mt-2 text-sm text-[var(--dim)]">
          אפשר לנסות שוב. התקלה נשלחה לבדיקה.
        </p>
        <button
          type="button"
          onClick={reset}
          className="wood mt-6 min-h-12 w-full rounded-2xl px-5 font-extrabold text-[#f7ebda]"
        >
          נסה שוב
        </button>
      </div>
    </main>
  );
}
