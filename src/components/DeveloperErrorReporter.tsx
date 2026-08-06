"use client";

import { useEffect } from "react";

const reported = new Set<string>();
const pending = new Set<string>();

type ErrorContext = {
  digest?: string;
  location?: string;
};

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") {
    try {
      return value.constructor?.name || "object";
    } catch {
      return "object";
    }
  }
  return typeof value;
}

function serializeUnknown(value: unknown) {
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_key, nested) => {
      if (typeof nested === "bigint") return `${nested.toString()}n`;
      if (typeof nested === "object" && nested !== null) {
        if (seen.has(nested)) return "[Circular]";
        seen.add(nested);
      }
      return nested;
    });
    if (json !== undefined) return json.slice(0, 600);
  } catch {
    // String below is the safest fallback for values with a throwing toJSON.
  }

  try {
    return String(value).slice(0, 600);
  } catch {
    return "[Unserializable value]";
  }
}

export function reportClientError(error: unknown, context: ErrorContext = {}) {
  const isError = error instanceof Error;
  const name = isError ? error.name : "NonError";
  const message = isError ? error.message : serializeUnknown(error);
  const originalType = isError ? undefined : valueType(error);
  const path = window.location.pathname;
  const key = `${name}:${message}:${originalType ?? ""}:${context.digest ?? ""}:${context.location ?? ""}:${path}`;
  if (reported.has(key) || pending.has(key)) return;
  pending.add(key);

  void fetch("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      name,
      message,
      stack: isError ? error.stack : undefined,
      valueType: originalType,
      digest: context.digest,
      location: context.location,
      path,
    }),
  })
    .then(async (response) => {
      if (!response.ok) return;
      const result = (await response.json()) as {
        accepted?: boolean;
        duplicate?: boolean;
        throttled?: boolean;
      };
      if (result.accepted && !result.duplicate && !result.throttled) {
        reported.add(key);
      }
    })
    .catch(() => undefined)
    .finally(() => pending.delete(key));
}

export default function DeveloperErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (event.error) {
        reportClientError(event.error);
        return;
      }

      const line = event.lineno ? `:${event.lineno}` : "";
      const column = event.colno ? `:${event.colno}` : "";
      const location = event.filename
        ? `${event.filename}${line}${column}`
        : undefined;
      reportClientError(event.message, { location });
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
