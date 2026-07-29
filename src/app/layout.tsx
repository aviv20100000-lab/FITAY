import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "FITAY",
  description: "אימון בטבעות אולימפיות — איתי סרד",
  manifest: "/manifest.webmanifest",
  // מסך מלא באייפון אחרי "הוספה למסך הבית". בלי זה iOS מתעלם מה-manifest.
  appleWebApp: {
    capable: true,
    title: "FITAY",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [{ url: "/app-icon/180", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
