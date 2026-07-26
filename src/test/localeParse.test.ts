/**
 * Locale-file integrity guard.
 *
 * 2026-07-23: a bad conflict resolution in a merge commit ("main into
 * sos/wp-c-real-escalation") left all three locale files with invalid JSON
 * (two branches' appended keys stitched together without a comma). It reached
 * main and broke every production deploy. Vite only catches this at build
 * time; this test catches it in any vitest run, including PR CI on the merge
 * ref — which is exactly where that breakage existed.
 *
 * 2026-07-25 (#84/#85/#87, and #89's own merge): the same "kept both sides"
 * resolution hit nl.json at FIVE sites. The parse and duplicate-key checks
 * below fired on PR CI every time — the merges happened anyway — but two of
 * the five sites were invisible to them, because keeping both sides of a JSON
 * *array* produces a longer array, not a syntax error or a duplicate key:
 *
 *   legal.terms.s7_1Items  10 elements instead of 5
 *   legal.terms.s9_4Items   6 elements instead of 4 — including "you must
 *                           return any devices", contradicting "you keep the
 *                           pendant" two elements above
 *
 * A third failure mode is silent too: when the duplicate wins, the English
 * value overwrites the translation and the file stays perfectly valid.
 *
 * So the three checks added below — deep key parity, ARRAY LENGTH parity, and
 * no-English-in-member-facing-namespaces — close the gap the first two leave.
 * Together they make every shape of a locale collision fail at PR time.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOCALES = ["en", "es", "nl"] as const;
type Locale = (typeof LOCALES)[number];
const TRANSLATED = ["es", "nl"] as const;

/**
 * Namespaces a member or visitor actually reads. An English string surfacing
 * here is a real defect — a lost translation. Admin/staff namespaces are
 * excluded: they carry a known ~700-string untranslated backlog (tracked
 * separately, see i18nKeyCoverage.test.ts).
 */
const MEMBER_FACING = ["support", "legal", "joinWizard", "landing", "pricing"];

/**
 * Values that are legitimately byte-identical to English and must stay so.
 * Pinned exactly, in the style of i18nKeyCoverage's KNOWN_MISSING: a new
 * English leak fails, and so does translating one of these without updating
 * the pin.
 */
const IDENTICAL_TO_EN_BY_DESIGN: Record<(typeof TRANSLATED)[number], string[]> = {
  // AEPD's registered name and Madrid address — a proper noun, not copy.
  es: ["legal.privacy.s15Authority"],
  // Same, plus "Contact: info@careconneqt.es" — "Contact" is the Dutch word too.
  nl: ["legal.privacy.s15Authority", "legal.terms.s2p2"],
};

function raw(locale: string): string {
  return readFileSync(join(process.cwd(), "src/i18n/locales", `${locale}.json`), "utf8");
}

type Leaf = string | number | boolean | null | unknown[];

/** Flatten to dotted paths, stopping at arrays so they can be compared whole. */
function flatten(value: Record<string, unknown>, prefix = ""): Record<string, Leaf> {
  const out: Record<string, Leaf> = {};
  for (const [k, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, path));
    } else {
      out[path] = v as Leaf;
    }
  }
  return out;
}

const flat = (locale: Locale) => flatten(JSON.parse(raw(locale)) as Record<string, unknown>);

describe("i18n locale files", () => {
  it.each(LOCALES)("%s.json is valid JSON", (locale) => {
    expect(() => JSON.parse(raw(locale))).not.toThrow();
  });

  it("all locales share the same top-level namespaces", () => {
    const [en, es, nl] = LOCALES.map((l) => Object.keys(JSON.parse(raw(l))).sort());
    expect(es, "es.json namespaces diverge from en.json").toEqual(en);
    expect(nl, "nl.json namespaces diverge from en.json").toEqual(en);
  });

  it.each(LOCALES)("%s.json has no duplicate keys within an object", (locale) => {
    // JSON.parse silently keeps the LAST duplicate — a duplicate key means a
    // merge quietly overwrote a translation. Scan with a tiny tokenizer:
    // track brace depth and the set of keys seen per open object.
    const text = raw(locale);
    const stack: Array<Set<string>> = [];
    const dups: string[] = [];
    // Match strings (keys or values), braces. Key = string immediately followed by ':'.
    const token = /"(?:[^"\\]|\\.)*"\s*:|[{}]/g;
    let m: RegExpExecArray | null;
    while ((m = token.exec(text)) !== null) {
      const t = m[0];
      if (t === "{") stack.push(new Set());
      else if (t === "}") stack.pop();
      else {
        const key = t.slice(0, t.lastIndexOf('"') + 1);
        const scope = stack[stack.length - 1];
        if (scope) {
          if (scope.has(key)) dups.push(`${locale}:${key} (depth ${stack.length})`);
          scope.add(key);
        }
      }
    }
    expect(dups, `duplicate keys found: ${dups.join(", ")}`).toEqual([]);
  });

  it.each(TRANSLATED)("%s.json has exactly the keys en.json has", (locale) => {
    // Top-level namespace parity (above) passes even when a merge drops or
    // invents keys deep inside one. Compare every leaf path instead.
    const en = flat("en");
    const other = flat(locale);
    const missing = Object.keys(en).filter((k) => !(k in other)).sort();
    const extra = Object.keys(other).filter((k) => !(k in en)).sort();
    expect(missing, `${locale}.json is missing keys en.json has`).toEqual([]);
    expect(extra, `${locale}.json has keys en.json does not`).toEqual([]);
  });

  it.each(TRANSLATED)("%s.json arrays are the same length as en.json's", (locale) => {
    // The check that would have caught legal.terms.s7_1Items and s9_4Items:
    // "keep both sides" of an array is valid JSON with no duplicate key, so
    // length divergence from en is the only structural signal there is.
    const en = flat("en");
    const other = flat(locale);
    const mismatched = Object.keys(en)
      .filter((k) => Array.isArray(en[k]) && Array.isArray(other[k]))
      .filter((k) => (en[k] as unknown[]).length !== (other[k] as unknown[]).length)
      .map((k) => `${k}: en=${(en[k] as unknown[]).length} ${locale}=${(other[k] as unknown[]).length}`);
    expect(mismatched, `array length diverges from en.json: ${mismatched.join(", ")}`).toEqual([]);
  });

  it.each(TRANSLATED)("%s.json has no English left in member-facing namespaces", (locale) => {
    // The check that would have caught a duplicate winning: when the English
    // copy of a key sorts last, JSON.parse keeps it and the translation is
    // silently gone with the file still valid.
    const en = flat("en");
    const other = flat(locale);
    const identical = Object.keys(en)
      .filter((k) => MEMBER_FACING.some((ns) => k.startsWith(`${ns}.`)))
      .filter((k) => typeof en[k] === "string" && (en[k] as string).length > 20)
      .filter((k) => other[k] === en[k])
      .sort();
    expect(
      identical,
      `${locale}.json values are still English (or the pin is stale)`,
    ).toEqual([...IDENTICAL_TO_EN_BY_DESIGN[locale]].sort());
  });
});
