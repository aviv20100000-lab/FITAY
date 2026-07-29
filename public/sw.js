/*
 * FITAY — service worker.
 *
 * הבעיה: הרשת בחצר של איתי חלשה. רישום הסטים כבר נשמר מקומית, אבל הדף
 * עצמו לא נטען בלי רשת, והמתאמן נתקע מול מסך לבן באמצע אימון.
 *
 * מה שנעשה כאן:
 *   • קבצים סטטיים (JS/CSS/פונטים/אייקונים) — מהמטמון קודם. אלה ממילא
 *     בעלי כתובת ייחודית לכל בילד, אז אין סכנה שיתיישנו.
 *   • דפים — מהרשת קודם, ואם הרשת נופלת נופלים בחזרה לעותק האחרון.
 *     המתאמן יראה את המסך כמו שהיה בפעם הקודמת, וזה מספיק כדי לאמן.
 *   • /api — אף פעם לא נשמר. תשובות שרת חייבות להיות טריות.
 *   • סרטונים ב-Blob — כתובת חיצונית, לא עוברת כאן בכלל. 68MB במטמון
 *     של הטלפון זה לא משהו שאנחנו רוצים לעשות בשקט.
 *
 * שים לב: אנחנו שומרים HTML של דפים מאחורי התחברות. לכן ביציאה מהחשבון
 * הכל נמחק — ראה clearCaches ב-LogoutButton.
 */

const VERSION = "fitay-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// מחיקה מלאה ביציאה מהחשבון, כדי שהמסכים של מתאמן אחד לא יישארו במכשיר.
self.addEventListener("message", (event) => {
  if (event.data === "fitay-clear-caches") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/app-icon/") ||
    /\.(css|js|woff2?|png|jpe?g|svg|ico)$/.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// שומרים רק את המסכים האחרונים. בלי זה המטמון גדל בלי סוף עם כל דף.
const MAX_PAGES = 30;

async function trimPages(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_PAGES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_PAGES).map((k) => cache.delete(k)));
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // רק תשובות מלאות. 206 (טווח) ו-redirect לא ניתנים לשמירה כמו שצריך.
    if (response.status === 200 && response.type === "basic") {
      const cache = await caches.open(PAGES_CACHE);
      await cache.put(request, response.clone());
      await trimPages(cache);
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // דפים וטעינות ניווט של Next — מהרשת קודם, מטמון כגיבוי.
  if (request.mode === "navigate" || request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request));
  }
});
