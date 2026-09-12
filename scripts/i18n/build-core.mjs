#!/usr/bin/env node
/**
 * WHICH TRANSLATIONS MUST EXIST BEFORE THE FIRST PAINT — derived, not guessed.
 *
 * `en.json` is 305 KB raw / ~86 KB gz and was imported statically by
 * `src/i18n/index.ts`, so every visitor downloaded all 107 namespaces before
 * anything rendered. It is the single largest item in the shell: removing it
 * takes the entry from 326.5 KB gz to 245.2 KB.
 *
 * It cannot simply be made lazy. i18next renders the KEY when a translation is
 * missing, so a page that paints before its bundle lands shows `nav.home` to the
 * user. The fix is to ship the little that the ALWAYS-MOUNTED shell needs and
 * lazily load the rest — and the only safe way to decide "the little" is to walk
 * the module graph rather than to keep a hand-written list in step.
 *
 * This walks `src/main.tsx` following STATIC imports only — `import(...)` is the
 * lazy boundary, and everything past one is a route chunk that already waits
 * behind `<Suspense fallback={<PageLoader/>}>`. Whatever `t("x.y")` prefixes turn
 * up in what is left is what must be inline.
 *
 *   node scripts/i18n/build-core.mjs          # write src/i18n/locales/en.core.json
 *   node scripts/i18n/build-core.mjs --check  # fail if the committed file is stale
 *
 * `src/test/perf/i18nCore.test.ts` runs the --check form, so a new eager import
 * that needs a namespace fails CI instead of shipping a raw key to a visitor.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EN = path.join(ROOT, "src/i18n/locales/en.json");
const OUT = path.join(ROOT, "src/i18n/locales/en.core.json");

function resolveSpec(spec, from) {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, "src", spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Static specifiers only; a dynamic import is blanked so it is never followed. */
function staticSpecifiers(src) {
  const cleaned = src.replace(/\bimport\s*\(/g, "DYNAMIC(");
  const out = [];
  for (const m of cleaned.matchAll(/\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of cleaned.matchAll(/\bexport\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

export function eagerNamespaces() {
  const seen = new Set();
  const namespaces = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    let src;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch {
      return;
    }
    // t("ns.key"), t(`ns.key`) and <Trans i18nKey="ns.key">
    for (const m of src.matchAll(/\bt\(\s*["'`]([A-Za-z0-9_]+)\./g)) namespaces.add(m[1]);
    for (const m of src.matchAll(/i18nKey=["']([A-Za-z0-9_]+)\./g)) namespaces.add(m[1]);
    for (const spec of staticSpecifiers(src)) {
      const resolved = resolveSpec(spec, file);
      if (resolved) walk(resolved);
    }
  };
  walk(path.join(ROOT, "src/main.tsx"));
  return [...namespaces].sort();
}

export function buildCore() {
  const en = JSON.parse(fs.readFileSync(EN, "utf8"));
  const core = {};
  const missing = [];
  for (const ns of eagerNamespaces()) {
    if (ns in en) core[ns] = en[ns];
    else missing.push(ns);
  }
  return { core, missing };
}

const { core, missing } = buildCore();
const serialised = `${JSON.stringify(core, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== serialised) {
    console.error(
      "src/i18n/locales/en.core.json is stale.\n" +
        "An eager module now uses a namespace the core bundle does not carry, or one\n" +
        "it no longer needs. Run: node scripts/i18n/build-core.mjs",
    );
    process.exit(1);
  }
  console.log(`i18n core is current: ${Object.keys(core).length} namespace(s), ${serialised.length} bytes`);
} else {
  fs.writeFileSync(OUT, serialised);
  console.log(
    `build-core: ${Object.keys(core).length} namespace(s) -> ${path.relative(ROOT, OUT)} ` +
      `(${serialised.length} bytes of ${fs.statSync(EN).size})`,
  );
}

if (missing.length) {
  // Not fatal: a prefix that is not a namespace (a variable, a false positive
  // from the regex) is normal. Printed so a REAL missing namespace is visible.
  console.warn(`  ! not found in en.json, ignored: ${missing.join(", ")}`);
}
