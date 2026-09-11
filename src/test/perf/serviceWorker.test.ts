import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * THE SERVICE WORKER SITS IN FRONT OF EVERY REQUEST THE APP MAKES, and until now
 * nothing tested it at all.
 *
 * Two defects were found by the performance harness, not by reading:
 *
 *  1. It CACHED THE API. Every Supabase GET went through
 *     `networkFirst(request, API_CACHE)`, so a member's medical records, their
 *     emergency contacts and their alert history were written into CacheStorage
 *     on the device's disk — and the activate step's allow-list deliberately kept
 *     that cache across upgrades.
 *
 *  2. A CACHE FAILURE DESTROYED A GOOD RESPONSE. The cache write sat inside the
 *     same `try` as the fetch, so when CacheStorage was unavailable (private
 *     window, blocked site data, full quota) a request the network had answered
 *     perfectly was discarded and the caller got `offline.html` with status 503.
 *     For a lazily-loaded chunk that means the app cannot load its own code; for
 *     a data call it means `supabase-js` parsing a web page as JSON.
 *
 * These assertions read the worker as source because that is what ships — it is a
 * plain file served to the browser, not a module the app imports, so there is no
 * runtime to instantiate in a unit test. What a browser-level test could add is
 * covered instead by `e2e/globalSearchLazy.spec.ts`, which blocks the worker and
 * says why.
 */

const SW = fs.readFileSync(
  path.resolve(__dirname, "../../../public/sw.js"),
  "utf8",
);

/**
 * CODE WITH COMMENTS REMOVED — and a real stripper, not a line filter.
 *
 * Most source-scanning tests here drop lines that START with `//` or `*`. That is
 * not enough for this file: the comments below explain the defects by QUOTING the
 * banned code (`networkFirst(request, API_CACHE)`, `await caches.open(...)`), and
 * a block comment's interior lines start with neither marker. The first version of
 * this test failed on four of its own explanations.
 *
 * So block comments are removed as SPANS. String literals containing `/*` would
 * confuse this; there are none in sw.js, and if one ever appears the tests below
 * go red rather than quietly passing — which is the right direction to fail.
 */
const CODE = SW.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");

describe("the service worker never caches the API", () => {
  it("does not respond to a Supabase request at all", () => {
    // Returning nothing from the fetch handler lets the request go to the network
    // untouched, which is what an API call should always do. The app's own
    // react-query cache is the right place for freshness decisions about data,
    // because it knows what the data MEANS.
    const start = CODE.indexOf("SUPABASE_HOST)");
    const branch = CODE.slice(start, CODE.indexOf("}", start) + 1);
    expect(branch).toContain("return;");
    expect(branch).not.toContain("respondWith");
  });

  it("has no API cache to write to", () => {
    expect(CODE).not.toContain("API_CACHE");
  });

  it("DELETES the API caches earlier versions left on the device", () => {
    // The allow-list is the mechanism. v7 filtered on `key !== STATIC_CACHE &&
    // key !== API_CACHE`, which PRESERVED the medical records across every
    // upgrade. Only the static cache survives now.
    expect(CODE).toMatch(/keys\.filter\(\(key\) => key !== STATIC_CACHE\)/);
    expect(CODE).not.toMatch(/key !== API_CACHE/);
  });

  it("bumps the cache version, or the deletion never runs for anybody", () => {
    // `activate` only fires when the worker BYTES change; the version constant is
    // what makes the new worker distinguishable and its cleanup run.
    expect(CODE).toContain('CACHE_VERSION = "ice-alarm-espana-v8"');
  });
});

describe("a cache failure never destroys a good response", () => {
  it("stores through one best-effort helper rather than inline in each strategy", () => {
    expect(CODE).toContain("async function store(cacheName, request, response)");
    // The whole point: the write is wrapped, and a failure is swallowed.
    const storeFn = CODE.slice(
      CODE.indexOf("async function store("),
      CODE.indexOf("async function safeMatch("),
    );
    expect(storeFn).toContain("try {");
    expect(storeFn).toContain("catch");
  });

  it("no strategy awaits caches.open inside the same try as its fetch", () => {
    // The exact shape of the defect. `caches.open` rejecting must not reach the
    // catch that returns the offline page.
    expect(CODE).not.toMatch(/await fetch\([\s\S]{0,200}?await caches\.open\(/);
  });

  it("reads the cache through a guarded match — caches.match throws too", () => {
    expect(CODE).toContain("async function safeMatch(request)");
    expect(CODE).not.toMatch(/=\s*await caches\.match\(/);
  });
});

describe("the offline page is for pages", () => {
  it("a sub-resource that cannot be fetched fails, rather than becoming HTML", () => {
    // An icon or a font that answers with a web page is a broken image, not a
    // helpful message — and a JSON call that answers with one is worse.
    const networkFirst = CODE.slice(
      CODE.indexOf("async function networkFirst("),
      CODE.indexOf("async function networkFirstNavigation("),
    );
    expect(networkFirst).not.toContain("offlineFallback()");

    const cacheFirst = CODE.slice(
      CODE.indexOf("async function cacheFirst("),
      CODE.indexOf("async function staleWhileRevalidate("),
    );
    expect(cacheFirst).not.toContain("offlineFallback()");
  });

  it("a NAVIGATION still gets it, because that is a person looking at a screen", () => {
    const nav = CODE.slice(CODE.indexOf("async function networkFirstNavigation("));
    expect(nav).toContain("offlineFallback()");
  });
});

describe("hashed assets are served from cache first", () => {
  it("because a content-hashed URL can never legitimately change", () => {
    // Going to the network first for something immutable is a round trip that can
    // only ever return what is already held. This is the "returning to a page is
    // instant" half of the performance work.
    // The branch is matched by a REGEX LITERAL, so the source reads `\\/assets\\/`
    // with escapes — searching for "/assets/" finds nothing, which is how the
    // first version of this assertion sliced an empty string and "passed" its
    // way to a confusing failure.
    const start = CODE.indexOf("assets");
    expect(start, "the hashed-asset branch is gone from the fetch handler").toBeGreaterThan(0);
    const branch = CODE.slice(start, start + 300);
    expect(branch).toContain("staleWhileRevalidate(request, STATIC_CACHE)");
  });

  it("and the background refresh is NOT awaited, or it is network-first again", () => {
    const swr = CODE.slice(
      CODE.indexOf("async function staleWhileRevalidate("),
      CODE.indexOf("async function store("),
    );
    expect(swr).toMatch(/if \(cached\) \{[\s\S]*?void refresh;[\s\S]*?return cached;/);
  });
});
