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

/**
 * The second half of the defect, found by the Playwright page audit rather than by me.
 *
 * Removing the invented number left every call affordance rendering `href={phoneHref ??
 * undefined}` — an `<a>` with no href at all. That is not neutral: it is a link-shaped,
 * button-shaped thing that looks live and does nothing. `e2e/helpers/pageAudit.ts`'s
 * `findDeadAnchors` counts `href === null` as dead, and it was right to: on the member's own
 * device page it produced a heading reading EMERGENCY NUMBER above an empty line and a
 * WhatsApp button that swallowed the tap.
 *
 * The rule now is that a call affordance is RENDERED CONDITIONALLY or not at all — no dead
 * anchors, and no `wa.me/null`, which is a URL that resolves to a WhatsApp error page.
 */
describe("no call affordance is rendered when there is no number to call", () => {
  const SURFACES = [
    "src/pages/LandingPage.tsx",
    "src/pages/PendantPage.tsx",
    "src/pages/ContactPage.tsx",
    "src/pages/HowItWorksPage.tsx",
    "src/pages/client/DevicePage.tsx",
    "src/pages/client/SupportPage.tsx",
    "src/pages/client/ClientDashboard.tsx",
    "src/pages/join/JoinWizard.tsx",
    "src/pages/partner/PartnerSupportPage.tsx",
    "src/components/join/steps/JoinConfirmationStep.tsx",
  ];

  it.each(SURFACES)("%s renders no anchor whose href may be absent", (file) => {
    const src = read(file);
    // `href={... ?? undefined}` is exactly how an anchor loses its href. Guard the whole
    // affordance instead, so it is not rendered at all.
    expect(src, "an <a> with no href is a dead link that looks live").not.toMatch(
      /href=\{[^}]*\?\?\s*undefined\s*\}/,
    );
  });

  it.each(SURFACES)("%s builds no wa.me URL from a number that may be null", (file) => {
    const src = read(file);
    const waTemplates = [...src.matchAll(/https:\/\/wa\.me\/\$\{([^}]+)\}/g)].map((m) => m[1]);
    for (const expr of waTemplates) {
      // The interpolated expression must be a plain identifier that a `{x && (...)}` guard has
      // already narrowed — never a call to waNumber(), which can return null and would render
      // the string "wa.me/null".
      expect(expr, `wa.me built from ${expr} in ${file}`).toMatch(/^\w+$/);
    }
  });

  it("no page hardcodes a phone number into a tel: or wa.me link", () => {
    // PartnerSupportPage carried +34 965 123 456 and +34 600 000 000 — two more numbers this
    // company does not own, on a page nobody thought to check, for the same reason.
    for (const file of SURFACES) {
      const src = read(file);
      // Both literal forms matter: the JSX attribute `href="tel:..."` AND the object property
      // `href: "tel:..."`. The first draft of this assertion checked only the attribute form,
      // and its mutation — putting `href: "tel:+34965123456"` back into PartnerSupportPage's
      // contactMethods — passed green. An assertion that cannot fail is not an assertion.
      expect(src, `hardcoded tel: in ${file}`).not.toMatch(/["'`]tel:[+\d]/);
      expect(src, `hardcoded wa.me in ${file}`).not.toMatch(/["'`]https:\/\/wa\.me\/\d/);
    }
  });
});
