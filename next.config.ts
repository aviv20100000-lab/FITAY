import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static מחזיר נתיב לקובץ בינארי במקום לייבא אותו. הגלאי האוטומטי
  // של Next לא רואה קובץ שמגיעים אליו דרך משתנה, ולכן הבינארי לא היה נארז
  // והדחיסה בפרודקשן הייתה נכשלת ב-"ffmpeg לא נמצא בחבילה". שני המסלולים
  // האלה הם היחידים שמריצים אותו.
  outputFileTracingIncludes: {
    "/api/coach/videos": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/cron/compress-videos": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default nextConfig;
