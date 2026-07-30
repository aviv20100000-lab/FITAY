import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // החבילה בונה את הנתיב לבינארי בזמן ריצה, עם require על מחרוזת מחושבת.
  // ה-bundler מנסה לפענח את זה בזמן בנייה, לא מצליח, והבנייה נופלת על
  // "Module not found: Can't resolve <dynamic>". כאן אומרים לו להשאיר
  // אותה בחוץ ולטעון אותה כרגיל בזמן ריצה.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],

  // הבינארי של ffmpeg מגיע כחבילה נפרדת לכל מערכת הפעלה, והנתיב אליו
  // מחושב בזמן ריצה ולא מיובא. הגלאי האוטומטי של Next לא רואה קובץ
  // שמגיעים אליו דרך משתנה, ולכן צריך לבקש אותו במפורש.
  //
  // התבנית מכסה את כל מסלולי ה-API בכוונה. כשהוספתי מסלול חדש לדחיסה
  // ושכחתי אותו כאן, הדחיסה נפלה שם בלבד וזה היה קשה לאבחן.
  //
  // linux-x64 היא החבילה שוורסל מריץ. השאר נשארות למחשב המקומי.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/@ffmpeg-installer/linux-x64/**",
      "./node_modules/@ffmpeg-installer/win32-x64/**",
    ],
  },
};

export default nextConfig;
