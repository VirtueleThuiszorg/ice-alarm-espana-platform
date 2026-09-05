// @vitest-environment node
//
// A wrong emergency number is worse than no emergency number.
//
// `useCompanySettings` defaulted `emergency_phone` to "+34 900 123 456" — a number this company
// does not own — and rendered it as a live `tel:` link on the public site, the pendant page, the
// member's own device page, the join confirmation and the readiness bar. A member in trouble
// could have dialled it. No number sends you to look for the right one; a wrong one sends you
// somewhere confidently.
//
// The real number is 950 473 199, and it lives in `system_settings.settings_emergency_phone`.
// Until that row exists, every surface shows nothing and the console says why.
//
// Negative-first: the assertions that matter are that the placeholder is GONE and cannot return.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { telHref, waNumber } from "../lib/phone";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PLACEHOLDER_PATTERNS = [
  /\+34\s*900\s*123\s*456/,
  /900123456/,
];

describe("the placeholder emergency number is gone from src/", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      // This test names the placeholder in order to forbid it.
      if (p.endsWith("noFakeEmergencyNumber.test.ts")) continue;
      const src = readFileSync(p, "utf8");
      if (PLACEHOLDER_PATTERNS.some((re) => re.test(src))) offenders.push(p.replace(ROOT + "/", ""));
    }
  };
  walk(join(ROOT, "src"));

  it("no source file falls back to +34 900 123 456", () => {
    // SettingsPage's admin form and the readiness-bar test fixture are allowed to carry a
    // sample value; everything else must not. Pinned exactly, so a NEW one fails here.
    const allowed = new Set([
      // Input `placeholder=` attributes in admin video tooling — a form hint, never a link,
      // never dialled, never saved.
      "src/components/admin/video-hub/VideoCreateTab.tsx",
      "src/components/admin/video-hub/VideoSettingsTab.tsx",
      // Test fixtures and a sanitiser case — never rendered to a member.
      "src/test/memberReadinessBar.test.tsx",
      "src/test/sanitize.test.ts",
      // These two NAME the placeholder in a comment in order to forbid it.
      "src/hooks/useCompanySettings.ts",
      "src/App.tsx",
    ]);
    expect(offenders.filter((o) => !allowed.has(o))).toEqual([]);
  });

  it("useCompanySettings has no emergency_phone default at all", () => {
    const src = read("src/hooks/useCompanySettings.ts");
    // The other three defaults are cosmetic and may stay. This one may not exist.
    expect(src).not.toMatch(/emergency_phone:\s*["'][^"']+["']/);
    expect(src).toMatch(/emergency_phone:\s*string\s*\|\s*null/);
  });

  it("App.tsx no longer keeps a second copy of the settings query", () => {
    // It had its own duplicate queryFn with its own hardcoded fallback — two places to fix.
    const src = read("src/App.tsx");
    expect(src).toContain("fetchCompanySettings");
    expect(src).not.toMatch(/settings_emergency_phone/);
  });

  it("a missing number is logged, not swallowed", () => {
    expect(read("src/hooks/useCompanySettings.ts")).toMatch(/console\.warn/);
  });

  it("the admin Settings form cannot SAVE an invented number", () => {
    // It pre-filled the placeholder and Save wrote it into system_settings — which is how an
    // invented number reached the database and then the public site.
    const src = read("src/pages/admin/SettingsPage.tsx");
    expect(src).toMatch(/emergency_phone:\s*""/);
  });

  it("no invented phone number is printed on a generated invoice", () => {
    // DEFAULT_COMPANY is spread into every invoice.
    const src = read("src/lib/pdfGenerator.ts");
    expect(src).toMatch(/phone:\s*''/);
  });
});

describe("the helpers refuse to invent a number", () => {
  it("telHref returns null for null, undefined and empty", () => {
    for (const v of [null, undefined, "", "   "]) expect(telHref(v)).toBeNull();
  });

  it("waNumber returns null for null, undefined and empty", () => {
    for (const v of [null, undefined, "", "  "]) expect(waNumber(v)).toBeNull();
  });

  it("telHref strips spaces and builds a dialable href", () => {
    expect(telHref("950 473 199")).toBe("tel:950473199");
    expect(telHref("+34 950 473 199")).toBe("tel:+34950473199");
  });

  it("waNumber strips spaces and the plus, for wa.me", () => {
    expect(waNumber("+34 950 473 199")).toBe("34950473199");
  });

  it("neither helper ever returns a string when given nothing — no empty tel: links", () => {
    // `tel:` with nothing after it is a dead link that looks live. That is the same class of
    // defect as the placeholder: an affordance that does not work.
    expect(telHref("")).not.toBe("tel:");
    expect(telHref("   ")).toBeNull();
  });
});
