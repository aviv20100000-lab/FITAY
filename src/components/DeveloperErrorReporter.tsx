"use client";

import { useEffect } from "react";

const reported = new Set<string>();

export function reportClientError(error: unknown) {
  const normalized =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Unknown client error");
  const path = window.location.pathname;
  const key = `${normalized.name}:${normalized.message}:${path}`;
  if (reported.has(key)) return;
  reported.add(key);

  void fetch("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack,
      path,
    }),
  }).catch(() => undefined);
}

export default function DeveloperErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
