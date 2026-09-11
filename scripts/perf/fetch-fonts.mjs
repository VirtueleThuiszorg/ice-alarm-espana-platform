#!/usr/bin/env node
/**
 * SELF-HOST THE TWO WEBFONTS, and ship only the subsets this product reads in.
 *
 * ── WHY SELF-HOST ───────────────────────────────────────────────────────────
 *
 * `index.html` used to carry a render-blocking `<link>` to fonts.googleapis.com.
 * That is two extra DNS lookups, two TLS handshakes and two round trips to a
 * third party BEFORE the first byte of CSS arrives — on the cold first visit to a
 * marketing page, on a phone, which is exactly the path this audit is about. It
 * is also a third party that can be slow, blocked, or unreachable, and when it is,
 * the page waits: measuring this platform in a sandbox that cannot reach Google
 * put LCP at 13 SECONDS on pages that render in well under one.
 *
 * ── WHY A SCRIPT AND NOT A ONE-OFF DOWNLOAD ─────────────────────────────────
 *
 * The font files are content-hashed by Google and change when a family is
 * revised. Committing binaries nobody can regenerate is how a dependency becomes
 * folklore. This is the command that produced what is in `public/fonts/`, it can
 * be re-run, and its output is deterministic.
 *
 *   node scripts/perf/fetch-fonts.mjs
 *
 * ── WHICH SUBSETS, AND WHY THAT IS A DECISION ───────────────────────────────
 *
 * Google serves seven per family here: latin, latin-ext, vietnamese, cyrillic,
 * cyrillic-ext, greek, greek-ext. This platform serves Spain in Spanish, English
 * and Dutch (`supportedLngs: ["en", "es", "nl"]`), all of which are covered by
 * latin + latin-ext — the latter carrying the accented characters Spanish names
 * and place names need.
 *
 * Dropping the other five is most of the saving. It is also the one thing here
 * that could be WRONG later: adding a language in a non-latin script means adding
 * its subset to KEEP_SUBSETS and re-running this. Stated loudly for that reason,
 * rather than left as a silent filter.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(REPO_ROOT, "public/fonts");
const CSS_OUT = path.join(REPO_ROOT, "src/styles/fonts.css");

/**
 * VARIABLE, not a list of static weights — and this is the whole saving.
 *
 * Asking for `wght@500;600;700;800` gets one file PER WEIGHT, and a page that
 * uses three heading weights downloads three of them. Measured on this build,
 * every route pulled SIX faces totalling 190 KB, which on the mobile profile
 * (1.6 Mbps) is most of a second of the critical path before a heading can
 * settle.
 *
 * A `wght@a..b` range gets ONE variable file per family covering the whole axis.
 * Two requests instead of six, fewer bytes than the three Archivo weights alone,
 * and every intermediate weight becomes available rather than fewer.
 */
const FAMILIES =
  "family=Archivo:wght@100..900&family=Source+Sans+3:wght@200..900";
const CSS_URL = `https://fonts.googleapis.com/css2?${FAMILIES}&display=swap`;

/** The scripts this product's languages are written in. See the header. */
const KEEP_SUBSETS = new Set(["latin", "latin-ext"]);

// Google serves woff2 only to browsers that advertise support; a bare fetch gets
// the ancient TTF fallback, which is roughly twice the size.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const css = await fetch(CSS_URL, { headers: { "user-agent": UA } }).then((r) => {
  if (!r.ok) throw new Error(`Google Fonts answered ${r.status} for the stylesheet`);
  return r.text();
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(CSS_OUT), { recursive: true });

/**
 * The stylesheet is a flat list of `/* subset *​/` comments each followed by one
 * `@font-face`. Parsed by splitting on the comment rather than with a CSS parser:
 * the shape is fixed by Google and a parser would be a dependency for one file.
 */
const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
if (blocks.length === 0) throw new Error("parsed no @font-face blocks — has the format changed?");

const kept = [];
const skipped = [];
let downloaded = 0;

for (const [, subset, face] of blocks) {
  if (!KEEP_SUBSETS.has(subset)) {
    skipped.push(subset);
    continue;
  }

  const family = /font-family:\s*'([^']+)'/.exec(face)?.[1];
  // A variable face declares a RANGE ("font-weight: 100 900"), a static one a
  // single number. Both are captured; the range is what names the file.
  const weight = /font-weight:\s*([\d]+(?:\s+[\d]+)?)\s*;/.exec(face)?.[1]?.trim();
  const url = /url\((https:[^)]+)\)/.exec(face)?.[1];
  const range = /unicode-range:\s*([^;]+);/.exec(face)?.[1];
  if (!family || !weight || !url) throw new Error(`could not read a face: ${face.slice(0, 80)}`);

  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const variable = /\s/.test(weight);
  const file = `${slug}-${variable ? "var" : weight}-${subset}.woff2`;
  const dest = path.join(OUT_DIR, file);

  const bytes = Buffer.from(
    await fetch(url, { headers: { "user-agent": UA } }).then((r) => {
      if (!r.ok) throw new Error(`${url} answered ${r.status}`);
      return r.arrayBuffer();
    }),
  );
  fs.writeFileSync(dest, bytes);
  downloaded += 1;

  kept.push(
    [
      `/* ${family} ${variable ? `variable ${weight}` : weight} — ${subset} */`,
      `@font-face {`,
      `  font-family: '${family}';`,
      `  font-style: normal;`,
      `  font-weight: ${weight};`,
      `  /* swap, not block: text is readable in the fallback immediately and`,
      `     reflows once the webfont lands. For a product read by people with`,
      `     failing eyesight, invisible text is the worse trade. */`,
      `  font-display: swap;`,
      `  src: url('/fonts/${file}') format('woff2');`,
      range ? `  unicode-range: ${range};` : null,
      `}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const header = `/*
 * GENERATED by scripts/perf/fetch-fonts.mjs — do not edit by hand.
 *
 * Self-hosted so the cold first visit does not wait on a third party: the
 * Google Fonts <link> in index.html cost two DNS lookups, two TLS handshakes
 * and two round trips before the first byte of CSS arrived.
 *
 * ONE VARIABLE FILE PER FAMILY. The first version of this shipped static
 * weights, and every page then downloaded six of them (190 KB) because the
 * design uses three Archivo weights and three Source Sans weights. A variable
 * face carries the whole 100-900 axis in one file.
 *
 * Only the latin and latin-ext subsets are shipped. This platform serves Spain
 * in Spanish, English and Dutch, all of which are written in latin script;
 * latin-ext carries the accented characters Spanish names and places need.
 * ADDING A LANGUAGE IN ANOTHER SCRIPT means adding its subset to KEEP_SUBSETS
 * in that script and re-running it.
 */\n\n`;

fs.writeFileSync(CSS_OUT, header + kept.join("\n\n") + "\n");

const bytes = fs
  .readdirSync(OUT_DIR)
  .filter((f) => f.endsWith(".woff2"))
  .reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);

console.log(
  `fetch-fonts: ${downloaded} face(s) into public/fonts (${(bytes / 1024).toFixed(0)} KB total)\n` +
    `             skipped ${skipped.length} face(s) in subsets this product does not use: ` +
    `${[...new Set(skipped)].sort().join(", ")}\n` +
    `             wrote ${path.relative(REPO_ROOT, CSS_OUT)}`,
);
