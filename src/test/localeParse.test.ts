/**
 * Locale-file integrity guard.
 *
 * 2026-07-23: a bad conflict resolution in a merge commit ("main into
 * sos/wp-c-real-escalation") left all three locale files with invalid JSON
 * (two branches' appended keys stitched together without a comma). It reached
 * main and broke every production deploy. Vite only catches this at build
 * time; this test catches it in any vitest run, including PR CI on the merge
 * ref — which is exactly where that breakage existed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOCALES = ["en", "es", "nl"] as const;

function raw(locale: string): string {
  return readFileSync(join(process.cwd(), "src/i18n/locales", `${locale}.json`), "utf8");
}

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
});
