import { ImageResponse } from "next/og";

/**
 * אייקון האפליקציה — שתי טבעות תלויות על רצועות, כמו בלוגו.
 * נוצר בקוד ולא כקובץ PNG כדי שלא יהיו נכסים בינאריים בריפו,
 * ושהצבעים יישארו נעולים לאותה פלטה של העץ.
 */
const SIZES = [96, 180, 192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: raw } = await params;
  const size = SIZES.includes(Number(raw) as (typeof SIZES)[number])
    ? Number(raw)
    : 192;

  const unit = size / 100;
  const ring = 32 * unit;
  const border = 4.5 * unit;
  const strapWidth = 2.4 * unit;
  const strapHeight = 17 * unit;

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
        }}
      >
        <div style={{ display: "flex", gap: 10 * unit }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                width: strapWidth,
                height: strapHeight,
                background: "#7a5430",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 * unit, marginTop: -border / 2 }}>
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
      </div>
    ),
    { width: size, height: size }
  );
}
