/* ================================================================== */
/*  ICE Alarm España  -  Service Worker                               */
/*  Statics cached. THE API IS NEVER CACHED. Offline page for pages.  */
/* ================================================================== */

/*
  v8, and the bump is load-bearing rather than routine: v7 and everything before
  it wrote Supabase RESPONSES into a cache on the device's disk — members' medical
  records, their emergency contacts, their alert history. Activation below now
  deletes every cache this worker does not use, which includes every `-api` cache
  any previous version created. Keeping the name in an allow-list, as v7 did,
  would have left that data sitting on every device that ever loaded the app.
*/
const CACHE_VERSION = "ice-alarm-espana-v8";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

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
// Brand identity assets must NEVER be pinned by a stale cache: the tab icon is
// what users (and Lee) see. Served network-first with HTTP-cache revalidation;
// the SW cache is only an offline fallback for these.
const ICON_PATHS = /^\/(favicon(-\d+x\d+)?\.(ico|png)|icon(-[\w-]+)?\.(png|svg)|apple-touch-icon\.png|og-image\.png|manifest\.json)$/i;
const SUPABASE_HOST = "supabase.co";

/* ================================================================== */
/*  Install  -  pre-cache critical shell                              */
/* ================================================================== */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // cache: "reload" bypasses the browser's HTTP cache. Without it, addAll()
      // is satisfied by whatever the HTTP cache holds — which is how every
      // previous CACHE_VERSION bump re-baked the STALE favicon into the "new"
      // cache (the old icon was pinned by long CDN headers on old deploys).
      const requests = PRE_CACHE.map((url) => new Request(url, { cache: "reload" }));
      return cache.addAll(requests).catch((err) => {
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
  /*
    DELETE EVERYTHING THIS WORKER DOES NOT USE — which is now the whole point.

    `STATIC_CACHE` is the only cache written from here on, so every other key goes,
    and that deliberately includes `ice-alarm-espana-v*-api`: the caches earlier
    versions filled with members' medical records, emergency contacts and alert
    history. An allow-list that named the API cache, as v7 had, would preserve
    exactly the data this change exists to remove.
  */
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      )
      .catch(() => {
        // A CacheStorage we cannot enumerate is one we cannot clean. Never let
        // that stop the worker activating — an inactive worker serves nothing.
      }),
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

  /*
    --- API calls (Supabase): NOT HANDLED AT ALL, and that is the fix ---

    This used to be `networkFirst(request, API_CACHE)`. Two things were wrong with
    that, and both were observed rather than theorised:

    1. IT CACHED THE API. A member's medical records, their emergency contacts and
       their alert history were written into CacheStorage on the device's disk.
       On a shared or lost phone that is exactly the data this product exists to
       protect, and nothing ever evicted it.

    2. ON ANY FAILURE IT ANSWERED WITH `offline.html`. A data call got back an
       HTML document with status 503, so `supabase-js` tried to parse a web page
       as JSON. A network error is something the client already handles; an HTML
       page pretending to be a response is not.

    Returning nothing from the fetch handler lets the request go to the network
    untouched — which is what an API call should always do. The app's own
    react-query cache is the right place for freshness decisions about data,
    because it knows what the data MEANS.
  */
  if (url.hostname.includes(SUPABASE_HOST)) {
    return;
  }

  /*
    --- Hashed JS/CSS chunks: CACHE-FIRST, revalidating in the background ---

    These filenames contain a hash of their own contents, so a given URL can
    never legitimately change: `index-C06uHvj9.js` is that file for ever, and a
    deploy produces new NAMES rather than new bytes at the same name. Going to
    the network first for something immutable is a round trip that can only ever
    return what is already held.

    Cache-first makes a warm route transition cost no network at all, which is
    the "returning to a page is instant" half of the performance work. The
    background refresh keeps the entry from going stale if a cache was ever
    populated with a truncated or error response.
  */
  if (/\/assets\/.*-[a-zA-Z0-9]{8,}\.(js|css)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // --- Icons / manifest: network-first, revalidating the HTTP cache too ---
  // These are un-hashed fixed paths, so cache-first would pin an old brand
  // icon forever (the "tab loads the right logo then switches back" bug: the
  // network gave the fresh icon, then the SW answered a later request with
  // the stale cached one). Offline still falls back to the last cached copy.
  if (url.origin === self.location.origin && ICON_PATHS.test(url.pathname)) {
    event.respondWith(networkFirst(request, STATIC_CACHE, { revalidate: true }));
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
  const cached = await safeMatch(request);
  if (cached) return cached;

  const response = await fetch(request);
  void store(cacheName, request, response);
  return response;
}

/**
 * Answer from cache immediately, and refresh the entry in the background.
 *
 * For a content-hashed asset the cached copy is by definition the right bytes,
 * so this is cache-first with a safety net rather than a freshness compromise.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await safeMatch(request);

  const refresh = fetch(request)
    .then((response) => {
      void store(cacheName, request, response);
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Do not await the refresh — that would make this network-first again.
    void refresh;
    return cached;
  }

  const fresh = await refresh;
  if (fresh) return fresh;
  // Nothing cached and the network failed: let the caller see a real failure.
  return fetch(request);
}

/**
 * PUT INTO THE CACHE WITHOUT EVER BREAKING THE RESPONSE.
 *
 * THE BUG THIS EXISTS TO STOP: the cache write used to sit inside the same `try`
 * as the fetch —
 *
 *     const response = await fetch(request);
 *     if (response.ok) {
 *       const cache = await caches.open(cacheName);   // <- can reject
 *       cache.put(request, response.clone());
 *     }
 *     return response;
 *     } catch { return offlineFallback(); }
 *
 * — so when CacheStorage was unavailable (a private window, blocked site data, a
 * full quota) a request THE NETWORK HAD ANSWERED PERFECTLY was thrown away and
 * the caller got `offline.html` with status 503 instead. For a lazily-loaded
 * chunk that means the app cannot load its own code.
 *
 * Observed, not theorised: in the performance harness every Supabase read and the
 * `GlobalSearch` chunk came back as 503 offline pages with the worker registered.
 *
 * Storing is now strictly best-effort and strictly separate from answering.
 */
async function store(cacheName, request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {
    // A cache we cannot write to is a cache we do without.
  }
}

/** `caches.match` throws in the same situations `caches.open` does. */
async function safeMatch(request) {
  try {
    return await caches.match(request);
  } catch {
    return undefined;
  }
}

/**
 * Network-first: try the network, fall back to cache.
 * { revalidate: true } additionally bypasses the browser HTTP cache
 * (cache: "no-cache" → conditional request to the server/CDN), so a
 * long-lived stale HTTP-cache entry can't masquerade as "the network".
 */
async function networkFirst(request, cacheName, { revalidate = false } = {}) {
  try {
    const response = await fetch(request, revalidate ? { cache: "no-cache" } : undefined);
    // Storing is best-effort and CANNOT fail the response — see `store`.
    void store(cacheName, request, response);
    return response;
  } catch {
    const cached = await safeMatch(request);
    if (cached) return cached;
    // No HTML fallback for a sub-resource: an icon or a font that answers with a
    // web page is a broken image, not a helpful message. Only a NAVIGATION gets
    // the offline page, and `networkFirstNavigation` is where that happens.
    throw new Error("offline and not cached");
  }
}

/**
 * Network-first for navigation with offline HTML fallback.
 */
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    // Best-effort, and OUTSIDE the try's failure path: this function had the same
    // defect as the other two — a rejecting `caches.open` sent a page the network
    // had served perfectly into the catch below, and the visitor was told they
    // were offline while they were not.
    void store(STATIC_CACHE, request, response);
    return response;
  } catch {
    // SPA routing: any path is served by the same document, so a cached
    // index.html is a real answer rather than a consolation.
    const cached = await safeMatch("/index.html");
    if (cached) return cached;

    // A NAVIGATION is a person looking at a screen, so this is the one place the
    // offline page belongs.
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
  <title>ICE Alarm España - Offline</title>
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
      background: #C8102E; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 28px; font-weight: bold;
    }
    h1 { font-size: 22px; margin-bottom: 12px; }
    p { color: #64748b; line-height: 1.6; margin-bottom: 24px; }
    button {
      background: #C8102E; color: white; border: none;
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
      ICE Alarm España requires an internet connection. Please check your
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
