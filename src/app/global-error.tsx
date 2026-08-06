"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/DeveloperErrorReporter";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0a0a0b",
          color: "#fbf8f3",
          fontFamily: "Arial, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 360 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>FITAY לא נטענה</h1>
          <p style={{ color: "rgba(251,248,243,.62)", lineHeight: 1.6 }}>
            נסה לרענן. התקלה נשלחה לבדיקה.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              width: "100%",
              minHeight: 48,
              marginTop: 16,
              borderRadius: 16,
              border: "1px solid rgba(224,190,147,.35)",
              background: "#b4854f",
              color: "#fff7ec",
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            נסה שוב
          </button>
        </main>
      </body>
    </html>
  );
}
