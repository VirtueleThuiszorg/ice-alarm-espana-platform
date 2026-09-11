#!/usr/bin/env -S node --experimental-strip-types
/**
 * HOW MUCH JAVASCRIPT DOES ONE ROUTE ACTUALLY COST?
 *
 * Answered from `dist/.vite/manifest.json` rather than from a browser, because the
 * question has an exact answer and a browser only gives an approximate one. A cold
 * visit to a route downloads:
 *
 *     the entry chunk and everything it STATICALLY imports        (the shell)
 *   + the route's own chunk and everything IT statically imports  (the page)
 *
 * Dynamic imports are deliberately excluded — that is what makes them lazy, and
 * counting them would erase the difference between a split bundle and a monolith.
 *
 * Sizes are GZIPPED, because that is what crosses the wire. `vite preview` serves
 * uncompressed, so a number scraped from a preview server would be ~3.5x the truth
 * and every budget would look broken. Vercel serves gzip/brotli; gzip is the
 * conservative of the two, so a route that fits here fits in production.
 *
 * Usage:
 *   node scripts/perf/route-bundles.mjs            # print the table
 *   node scripts/perf/route-bundles.mjs --check    # exit 1 if any route is over
 *   node scripts/perf/route-bundles.mjs --json out.json
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.join(REPO_ROOT, "dist");
const MANIFEST = path.join(DIST, ".vite/manifest.json");

function die(message) {
  console.error(`route-bundles: ${message}`);
  process.exit(2);
}

if (!fs.existsSync(MANIFEST)) {
  die(
    `no build manifest at ${path.relative(REPO_ROOT, MANIFEST)}.\n` +
      `  Run a production build first (npm run build). This script reports on the\n` +
      `  built output and must never invent numbers when the build is missing.`,
  );
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

/** Gzipped byte size of a built asset, memoised — chunks are shared across routes. */
const gzCache = new Map();
function gzBytes(file) {
  if (gzCache.has(file)) return gzCache.get(file);
  const full = path.join(DIST, file);
  if (!fs.existsSync(full)) die(`manifest names ${file}, which is not in dist/`);
  const size = zlib.gzipSync(fs.readFileSync(full), { level: 9 }).length;
  gzCache.set(file, size);
  return size;
}

/**
 * Every chunk reachable from `key` by STATIC imports, including itself.
 * `seen` is shared by the caller so the shell is counted once per route, not twice.
 */
function staticClosure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  const entry = manifest[key];
  if (!entry) return seen;
  seen.add(key);
  for (const imported of entry.imports ?? []) staticClosure(imported, seen);
  return seen;
}

/** The manifest key for the entry chunk (`src/main.tsx`). */
const ENTRY_KEY = Object.keys(manifest).find((k) => manifest[k].isEntry);
if (!ENTRY_KEY) die("no entry chunk in the manifest");

/**
 * Resolve a route's module path (`pages/admin/MembersPage.tsx`, relative to src/)
 * to its manifest key. Vite keys by path relative to the project root.
 */
function manifestKeyFor(modulePath) {
  const key = `src/${modulePath}`;
  return manifest[key] ? key : null;
}

export function measureRoute(modulePath) {
  const shell = staticClosure(ENTRY_KEY);
  const chunks = new Set(shell);
  let pageChunkFound = true;

  if (modulePath) {
    const key = manifestKeyFor(modulePath);
    if (!key) {
      pageChunkFound = false;
    } else {
      staticClosure(key, chunks);
    }
  }

  let shellBytes = 0;
  for (const key of shell) shellBytes += gzBytes(manifest[key].file);

  let totalBytes = 0;
  for (const key of chunks) totalBytes += gzBytes(manifest[key].file);

  return {
    totalGzBytes: totalBytes,
    shellGzBytes: shellBytes,
    pageGzBytes: totalBytes - shellBytes,
    chunkCount: chunks.size,
    pageChunkFound,
  };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const budgets = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "perf/budgets.json"), "utf8"));
  // The route catalogue is TypeScript and is IMPORTED, not re-parsed: node's type
  // stripping (--experimental-strip-types, in the shebang) runs it directly. An
  // earlier version scraped the list with a regex and silently fell to zero routes
  // the first time the formatting changed — a bundle gate that checks nothing.
  const { ROUTES } = await import(
    new URL("../../src/test/perf/scorecard.ts", import.meta.url).href
  );
  const routes = ROUTES;
  if (routes.length === 0) die("the route catalogue is empty");

  const PUBLIC_SURFACES = new Set(["public", "join", "auth"]);
  const rows = routes.map((route) => {
    const measured = measureRoute(route.module);
    const override = budgets.overrides?.[route.id]?.routeJsGzBytes;
    const budget =
      typeof override === "number"
        ? override
        : PUBLIC_SURFACES.has(route.surface)
          ? budgets.thresholds.publicRouteJsGzBytes
          : budgets.thresholds.routeJsGzBytes;
    return { ...route, ...measured, budget, over: measured.totalGzBytes > budget };
  });

  const jsonFlag = process.argv.indexOf("--json");
  if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
    const out = path.resolve(REPO_ROOT, process.argv[jsonFlag + 1]);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log(`route-bundles: wrote ${path.relative(REPO_ROOT, out)}`);
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const missing = rows.filter((r) => !r.pageChunkFound);
  const width = Math.max(...rows.map((r) => r.id.length));

  console.log(`\nRoute JS, gzipped (shell + page), from ${path.relative(REPO_ROOT, MANIFEST)}\n`);
  console.log(
    `${"route".padEnd(width)}  ${"total".padStart(9)}  ${"shell".padStart(9)}  ${"page".padStart(9)}  ${"budget".padStart(9)}`,
  );
  for (const r of [...rows].sort((a, b) => b.totalGzBytes - a.totalGzBytes)) {
    console.log(
      `${r.id.padEnd(width)}  ${kb(r.totalGzBytes).padStart(9)}  ${kb(r.shellGzBytes).padStart(9)}  ` +
        `${kb(r.pageGzBytes).padStart(9)}  ${kb(r.budget).padStart(9)}  ${r.over ? "OVER" : "ok"}`,
    );
  }

  if (missing.length) {
    console.error(
      `\nroute-bundles: ${missing.length} route(s) name a module with no chunk in the manifest:\n` +
        missing.map((r) => `  ${r.id} -> src/${r.module}`).join("\n") +
        `\n  Either the module moved or the route stopped being lazy. Both are real.`,
    );
  }

  if (process.argv.includes("--check")) {
    const over = rows.filter((r) => r.over);
    if (missing.length || over.length) {
      console.error(
        `\nroute-bundles: FAILED — ${over.length} route(s) over budget, ${missing.length} unresolved.`,
      );
      for (const r of over) {
        console.error(`  ${r.id}: ${kb(r.totalGzBytes)} > ${kb(r.budget)}`);
      }
      process.exit(1);
    }
    console.log(`\nroute-bundles: all ${rows.length} routes within budget.`);
  }
}
