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

const VERSION = "fitay-v2";
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

self.addEventListener("message", (event) => {
  // מחיקה מלאה ביציאה מהחשבון, כדי שהמסכים של מתאמן אחד לא יישארו במכשיר.
  if (event.data === "fitay-clear-caches") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
    return;
  }

  // הדף שואל איזו גרסה מותקנת. service worker ישן ממשיך לשלוט בדף גם
  // אחרי פריסה חדשה, ואם הוא מלפני ההתראות הוא פשוט אין לו מאזין push.
  // ההשוואה הזאת היא מה שמאפשר לדף להחליט להחליף אותו.
  if (event.data && event.data.type === "GET_VERSION" && event.ports[0]) {
    event.ports[0].postMessage(VERSION);
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

/* ── התראות דחיפה ─────────────────────────────────────────────────────────
 * השרת שולח JSON עם title, body, url ו-tag. אם משהו בדרך מתקלקל, עדיף
 * להראות התראה כללית מלא להראות כלום — הרשאת דחיפה שלא מפיקה התראה
 * נחשבת בכרום כהפרה וחוסמת את האתר.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "FITAY";
  const options = {
    body: data.body || "",
    icon: "/app-icon/192",
    badge: "/app-icon/96",
    vibrate: [200, 100, 200],
    dir: "rtl",
    lang: "he",
    tag: data.tag || "fitay",
    // התראה חדשה על אותו נושא מחליפה את הקודמת בשקט, בלי צלצול חוזר.
    renotify: false,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// לחיצה על ההתראה: אם האפליקציה כבר פתוחה, מנווטים בה במקום לפתוח חלון נוסף.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target.href);
        return;
      }
      await self.clients.openWindow(target.href);
    })()
  );
});
