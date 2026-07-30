import { ImageResponse } from "next/og";

/**
 * התמונה שמופיעה כשמישהו שולח את הקישור בוואטסאפ, בטלגרם או בכל מקום אחר.
 *
 * בלי הקובץ הזה הקישור מגיע כשורת טקסט אפורה בלי שום זיהוי, ומי שמקבל
 * אותו לא יודע מה זה. עם הקובץ מופיעה תמונה עם הטבעות והשם.
 *
 * נוצרת בקוד ולא כקובץ PNG, בדיוק כמו אייקון האפליקציה, כדי שלא יהיו
 * נכסים בינאריים בריפו והצבעים יישארו נעולים לאותה פלטה של העץ.
 *
 * 1200 על 630 הוא הגודל שכל האפליקציות מצפות לו. גודל אחר נחתך.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "FITAY · אימון בטבעות אולימפיות";

export default function OpengraphImage() {
  const ring = 190;
  const border = 26;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          // אותה הילה חמה שיש בראש כל מסך באפליקציה.
          backgroundImage:
            "radial-gradient(120% 55% at 50% 0%, rgba(180,133,79,.20), rgba(10,10,11,0) 62%)",
        }}
      >
        {/* הרצועות */}
        <div style={{ display: "flex", gap: 74 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ width: 15, height: 104, background: "#7a5430" }} />
          ))}
        </div>

        {/* שתי הטבעות */}
        <div style={{ display: "flex", gap: 44, marginTop: -border / 2 }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                width: ring,
                height: ring,
                borderRadius: ring,
                border: `${border}px solid #b4854f`,
              }}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 54,
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: 18,
            color: "#fbf8f3",
            display: "flex",
          }}
        >
          FITAY
        </div>

        <div
          style={{
            marginTop: 16,
            fontSize: 34,
            color: "rgba(251,248,243,.62)",
            display: "flex",
          }}
        >
          אימון בטבעות אולימפיות
        </div>
      </div>
    ),
    size
  );
}
