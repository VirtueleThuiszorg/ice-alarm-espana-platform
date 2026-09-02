/**
 * Favicon / service-worker cache regression guard.
 *
 * The bug (2026-07-23): the tab loaded the correct two-C logo, then SWITCHED
 * BACK to the old brand icon. Chain: sw.js served icons cache-first with no
 * revalidation, and its install-time `cache.addAll` went through the browser
 * HTTP cache — so the OLD icon (pinned by long CDN headers on stale deploys)
 * was re-baked into every "new" CACHE_VERSION. The network briefly showed the
 * fresh icon; the SW then answered the next favicon request with the stale one.
 *
 * These are source-contract tests on public/sw.js + the icon reference graph,
 * so the fix can't silently regress.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const swSource = readFileSync(join(ROOT, "public/sw.js"), "utf8");
const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(ROOT, "public/manifest.json"), "utf8"));
const vercelJson = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));

/** Every fixed-path brand asset the app references anywhere. */
const ICON_FILES = [
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon-48x48.png",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
];

// Mirror of sw.js's ICON_PATHS (kept in sync by the "regex actually matches" test below).
function extractIconPathsRegex(): RegExp {
  const m = swSource.match(/const ICON_PATHS = (\/.+\/i);/);
  expect(m, "sw.js must define ICON_PATHS").not.toBeNull();
  const literal = m![1];
  const body = literal.slice(1, literal.lastIndexOf("/"));
  return new RegExp(body, "i");
}

describe("sw.js never pins a stale brand icon", () => {
  it("cache version moved past the poisoned v5 caches", () => {
    const m = swSource.match(/CACHE_VERSION = "ice-alarm-espana-v(\d+)"/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(6);
  });

  it("install pre-cache bypasses the browser HTTP cache (cache: 'reload')", () => {
    // The poisoning vector: addAll(PRE_CACHE) with plain URLs is satisfied by
    // the HTTP cache. It must map to Requests with { cache: "reload" }.
    expect(swSource).toMatch(
      /PRE_CACHE\.map\(\s*\(url\)\s*=>\s*new Request\(url,\s*\{\s*cache:\s*"reload"\s*\}\s*\)\s*\)/,
    );
    expect(swSource).toMatch(/cache\.addAll\(requests\)/);
  });

  it("every shipped icon path (and the manifest) routes network-first, not cache-first", () => {
    const iconPaths = extractIconPathsRegex();
    for (const f of [...ICON_FILES, "manifest.json"]) {
      expect(iconPaths.test(`/${f}`), `/`+ f + ` must match ICON_PATHS`).toBe(true);
    }
    // …and that branch must run BEFORE the generic cache-first static branch.
    const iconBranch = swSource.indexOf("ICON_PATHS.test(url.pathname)");
    const cacheFirstBranch = swSource.indexOf("STATIC_EXTENSIONS.test(url.pathname)");
    expect(iconBranch).toBeGreaterThan(-1);
    expect(cacheFirstBranch).toBeGreaterThan(-1);
    expect(iconBranch, "icon routing must precede the cache-first static branch").toBeLessThan(
      cacheFirstBranch,
    );
    // The icon route must revalidate the HTTP cache too.
    expect(swSource).toMatch(/ICON_PATHS\.test\(url\.pathname\)[\s\S]{0,200}revalidate:\s*true/);
    expect(swSource).toMatch(/fetch\(request,\s*revalidate \? \{ cache: "no-cache" \} : undefined\)/);
  });
});

describe("icon reference graph is consistent (no dangling old-brand paths)", () => {
  it("every icon referenced by index.html exists in public/", () => {
    const hrefs = [...indexHtml.matchAll(/(?:href|content)="(\/[^"]+\.(?:ico|png|svg))"/g)].map(
      (m) => m[1],
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(existsSync(join(ROOT, "public", href)), `${href} referenced by index.html is missing`).toBe(true);
    }
  });

  it("every manifest icon exists in public/ and is a current-brand path", () => {
    for (const icon of manifest.icons) {
      const rel = icon.src.replace(/^\//, "");
      expect(existsSync(join(ROOT, "public", rel)), `${icon.src} in manifest.json is missing`).toBe(true);
      expect(
        [...ICON_FILES],
        `${icon.src} is not in the canonical icon set`,
      ).toContain(rel);
    }
  });

  it("sw.js PRE_CACHE only lists files that exist", () => {
    const pre = swSource.match(/const PRE_CACHE = \[([\s\S]*?)\];/);
    expect(pre).not.toBeNull();
    const urls = [...pre![1].matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]).filter((u) => u !== "/");
    for (const u of urls) {
      const rel = u === "/index.html" ? join(ROOT, "index.html") : join(ROOT, "public", u);
      expect(existsSync(rel), `${u} pre-cached by sw.js is missing`).toBe(true);
    }
  });
});

describe("vercel.json cache headers", () => {
  function ruleFor(fragment: string) {
    return vercelJson.headers.find((h: { source: string }) => h.source.includes(fragment));
  }

  it("icons stay short-cached + must-revalidate", () => {
    const rule = ruleFor("favicon.ico");
    expect(rule).toBeDefined();
    const cc = rule.headers.find((h: { key: string }) => h.key === "Cache-Control");
    expect(cc.value).toContain("must-revalidate");
    expect(cc.value).toMatch(/max-age=(3600|0)/);
  });

  it("the service workers themselves are never long-cached (updates must propagate)", () => {
    const rule = ruleFor("sw.js");
    expect(rule, "vercel.json needs a Cache-Control rule for sw.js").toBeDefined();
    const cc = rule.headers.find((h: { key: string }) => h.key === "Cache-Control");
    expect(cc.value).toContain("max-age=0");
    expect(cc.value).toContain("must-revalidate");
  });
});
