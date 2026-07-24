/**
 * Guards the 2026-07-24 nl.json legacy-translation fix: the shifts/leads/
 * covers/callCentre.members namespaces shipped with English values pasted
 * into the Dutch locale. This pins that they stay genuinely Dutch — any key
 * in these namespaces whose nl value is byte-identical to its en value fails,
 * except the pinned legitimate identicals ("Status" is the same word in
 * Dutch). A regression that re-copies English strings in fails immediately.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const load = (locale: string) =>
  JSON.parse(readFileSync(join(process.cwd(), `src/i18n/locales/${locale}.json`), "utf8"));

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

const FIXED_NAMESPACES = ["shifts.", "leads.", "covers.", "callCentre.members."];
// "Status" is identical in Dutch and English — the only allowed carbon copies.
const LEGITIMATE_IDENTICALS = new Set(["leads.statusFilter", "callCentre.members.statusFilter"]);

describe("nl locale — no English left in the fixed namespaces", () => {
  it("every shifts/leads/covers/callCentre.members value differs from en (except pinned identicals)", () => {
    const en = flatten(load("en"));
    const nl = flatten(load("nl"));
    const englishLeftovers = Object.keys(nl).filter(
      (key) =>
        FIXED_NAMESPACES.some((ns) => key.startsWith(ns)) &&
        key in en &&
        nl[key] === en[key] &&
        !LEGITIMATE_IDENTICALS.has(key),
    );
    expect(
      englishLeftovers,
      `nl value identical to en — translate it or pin it as a legitimate identical: ${englishLeftovers.join(", ")}`,
    ).toEqual([]);
  });

  it("the pinned identicals are still accurate (remove from the set if translated)", () => {
    const en = flatten(load("en"));
    const nl = flatten(load("nl"));
    for (const key of LEGITIMATE_IDENTICALS) {
      expect(nl[key], `${key} should exist in nl`).toBeDefined();
      expect(nl[key]).toBe(en[key]);
    }
  });
});
