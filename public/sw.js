/* ================================================================== */
/*  ICE Alarm Espana  -  Service Worker                               */
/*  Cache-first for statics, network-first for API, offline fallback  */
/* ================================================================== */

const CACHE_VERSION = "ice-alarm-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

/* ---- Assets to pre-cache during install ---- */
const PRE_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/icon-512.png",
];

/* ---- Patterns ---- */
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|eot|otf|png|jpe?g|gif|svg|ico|webp|avif)$/i;
const SUPABASE_HOST = "supabase.co";

/* ================================================================== */
/*  Install  -  pre-cache critical shell                              */
/* ================================================================== */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRE_CACHE).catch((err) => {
        // Non-critical: some assets may not exist yet during first deploy
        console.warn("[SW] Pre-cache partial failure:", err);
      });
    })
  );
  // Activate immediately without waiting for old SW to retire
  self.skipWaiting();
});

/* ================================================================== */
/*  Activate  -  clean old caches                                     */
/* ================================================================== */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Start controlling all open tabs immediately
  self.clients.claim();
});

/* ================================================================== */
/*  Fetch  -  routing strategy                                        */
/* ================================================================== */

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // --- API calls (Supabase): network-first, fall back to cache ---
  if (url.hostname.includes(SUPABASE_HOST)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // --- Hashed JS/CSS chunks: network-first (ensures fresh after deploys) ---
  if (/\/assets\/.*-[a-zA-Z0-9]{8,}\.(js|css)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // --- Other static assets (images, fonts): cache-first ---
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // --- Navigation requests: network-first with offline fallback ---
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // --- Everything else: network-first ---
  event.respondWith(networkFirst(request, STATIC_CACHE));
});

/* ================================================================== */
/*  Strategies                                                        */
/* ================================================================== */

/**
 * Cache-first: return cached response if available, otherwise fetch
 * from network and cache the result.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

/**
 * Network-first: try the network, fall back to cache.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

/**
 * Network-first for navigation with offline HTML fallback.
 */
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try to return cached index.html for SPA routing
    const cached = await caches.match("/index.html");
    if (cached) return cached;

    return offlineFallback();
  }
}

/**
 * Minimal offline fallback page when nothing is cached.
 */
function offlineFallback() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ICE Alarm Espana - Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f8fafc;
      color: #1e293b;
      padding: 24px;
      text-align: center;
    }
    .container { max-width: 420px; }
    .icon {
      width: 64px; height: 64px; margin: 0 auto 24px;
      background: #E74C3C; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 28px; font-weight: bold;
    }
    h1 { font-size: 22px; margin-bottom: 12px; }
    p { color: #64748b; line-height: 1.6; margin-bottom: 24px; }
    button {
      background: #E74C3C; color: white; border: none;
      padding: 12px 32px; border-radius: 8px; font-size: 16px;
      font-weight: 600; cursor: pointer;
    }
    button:hover { background: #c0392b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">!</div>
    <h1>You are offline</h1>
    <p>
      ICE Alarm Espana requires an internet connection. Please check your
      network and try again. In a medical emergency, call
      <strong>112</strong> directly.
    </p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
