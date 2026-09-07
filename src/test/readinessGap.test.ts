// @vitest-environment node
//
// WHICH condition is missing — the one function three surfaces read.
//
// D4 made readiness two conditions. The brief then asks the queue, the member header notice and
// the operator card zero-state each to name the missing one, and three screens deriving that
// from raw columns is three chances to phrase it differently or get it wrong. So it is derived
// once, and the edges are asserted here rather than in each screen's render test.
//
// THE EDGE THAT MATTERS is `unknown`. A row that cannot be read into a condition is neither a
// ready member nor an unready one, and collapsing it into either is a false all-clear or a false
// alarm — the two failures READINESS_MODEL.md §1-A exists to prevent. Every assertion about
// nulls below is about that.
import { describe, it, expect } from "vitest";
import { readinessGap, isActionableGap, READINESS_GAP_STAFF } from "../lib/readinessGap";

describe("readinessGap", () => {
  it.each([
    [{ emergency_contact_count: 1, device_tested_at: "2026-09-01T00:00:00Z" }, "none"],
    [{ emergency_contact_count: 9, device_tested_at: "2026-09-01T00:00:00Z" }, "none"],
    [{ emergency_contact_count: 0, device_tested_at: "2026-09-01T00:00:00Z" }, "contacts"],
    [{ emergency_contact_count: 2, device_tested_at: null }, "pendant"],
    [{ emergency_contact_count: 0, device_tested_at: null }, "both"],
  ] as const)("%o → %s", (row, expected) => {
    expect(readinessGap(row)).toBe(expected);
  });

  it("a missing row is `unknown`, not ready and not unready", () => {
    expect(readinessGap(null)).toBe("unknown");
    expect(readinessGap(undefined)).toBe("unknown");
  });

  it("a NULL contact count is `unknown`, not zero", () => {
    // The view uses count(), which cannot be null for an existing row — so a null here means
    // the column was not selected. Answering "no contacts" to that is inventing a fact from a
    // missing projection, and this is the fact the queue is worked by phone off.
    expect(readinessGap({ emergency_contact_count: null, device_tested_at: null })).toBe(
      "unknown",
    );
    expect(
      readinessGap({ emergency_contact_count: null, device_tested_at: "2026-09-01T00:00:00Z" }),
    ).toBe("unknown");
  });

  it("an empty-string tested_at counts as NOT tested", () => {
    // Defensive rather than expected: the column is timestamptz. But a falsy value must never
    // read as evidence that somebody pressed a button.
    expect(readinessGap({ emergency_contact_count: 1, device_tested_at: "" })).toBe("pendant");
  });
});

describe("isActionableGap", () => {
  it("is true for the three real gaps", () => {
    expect(isActionableGap("contacts")).toBe(true);
    expect(isActionableGap("pendant")).toBe(true);
    expect(isActionableGap("both")).toBe(true);
  });

  it("is FALSE for `unknown` — you cannot chase a fact you do not have", () => {
    // This is what keeps the member bar and the operator zero-state silent on a failed read,
    // rather than warning somebody about a condition nobody has established.
    expect(isActionableGap("unknown")).toBe(false);
  });

  it("is false for `none`", () => {
    expect(isActionableGap("none")).toBe(false);
  });
});

describe("the staff wording", () => {
  it("covers every gap except `none`, and names the WORK as well as the state", () => {
    for (const gap of ["contacts", "pendant", "both", "unknown"] as const) {
      expect(READINESS_GAP_STAFF[gap]?.fallback, `no label for ${gap}`).toBeTruthy();
      expect(READINESS_GAP_STAFF[gap].work.fallback, `no work for ${gap}`).toBeTruthy();
    }
  });

  it("does not tell staff to treat an unreadable row as a state", () => {
    expect(READINESS_GAP_STAFF.unknown.work.fallback).toMatch(/not a state/i);
  });

  it("both row kinds are phone work, per the brief", () => {
    expect(READINESS_GAP_STAFF.contacts.work.fallback).toMatch(/phone/i);
    expect(READINESS_GAP_STAFF.pendant.work.fallback).toMatch(/phone/i);
  });

  it("every key it names exists in all three locale files", async () => {
    // The fallbacks are inline so these strings are never blank; the KEYS still have to exist,
    // or a Spanish operator reads English. Deep key parity is enforced by localeParse.test.ts;
    // this is the one that ties these particular keys to it.
    const { readFileSync } = await import("node:fs");
    for (const locale of ["en", "es", "nl"]) {
      const json = JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, "utf8"));
      for (const gap of ["contacts", "pendant", "both", "unknown"] as const) {
        for (const { key } of [READINESS_GAP_STAFF[gap], READINESS_GAP_STAFF[gap].work]) {
          const value = key.split(".").reduce<unknown>(
            (o, k) => (o as Record<string, unknown> | undefined)?.[k],
            json,
          );
          expect(value, `${locale}.json is missing ${key}`).toBeTruthy();
        }
      }
    }
  });
});
