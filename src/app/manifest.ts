import type { MetadataRoute } from "next";

/**
 * מאפשר "הוספה למסך הבית". בלי זה האפליקציה נפתחת עם סרגל כתובת של
 * דפדפן — באמצע אימון זה גוזל שליש מהמסך ומזמין לחיצות בטעות.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FITAY · אימון בטבעות",
    short_name: "FITAY",
    description: "אימון בטבעות אולימפיות",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    lang: "he",
    dir: "rtl",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      {
        src: "/app-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
