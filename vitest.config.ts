import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// הבדיקות רצות על הלוגיקה בלבד, בסביבת node, בלי דפדפן ובלי מסד אמיתי.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
