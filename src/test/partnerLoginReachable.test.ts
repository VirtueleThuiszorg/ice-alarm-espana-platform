/**
 * A returning partner must be able to find the way in from the public site.
 *
 * `/partner/login` existed and worked, but nothing public linked to it. The header
 * nav and the landing footer both pointed only at `/partner` — the application
 * page — so a partner who already had an account could reach their login only by
 * typing the URL. Every other link into it sat *inside* a flow you had to already
 * be in (the join form's "already have an account", the post-verification screen,
 * an invite acceptance) or was a redirect from a guard.
 *
 * These assert the public entry points exist, and are negative where that is the
 * sharper test: the route must not be orphaned again.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const LOGIN_PATH = "/partner/login";

describe("the partner login route", () => {
  it("is registered in the router", () => {
    expect(read("src/App.tsx")).toMatch(/path="\/partner\/login"/);
  });
});

describe("a cold visitor can find it", () => {
  it("the landing footer links to it", () => {
    const src = read("src/pages/LandingPage.tsx");
    expect(src).toContain(`to="${LOGIN_PATH}"`);
  });

  it("the page the public nav actually reaches links to it", () => {
    // PublicHeader sends everyone to /partner, so that page has to offer the way
    // in — this is the entry point that matters most.
    const header = read("src/components/layout/PublicHeader.tsx");
    expect(header, "PublicHeader still points at /partner").toMatch(/to:\s*["']\/partner["']/);

    const onboarding = read("src/pages/partner/PartnerOnboarding.tsx");
    expect(onboarding, "/partner must offer a route to the partner login").toContain(
      `to="${LOGIN_PATH}"`
    );
  });

  it("uses translated copy rather than hardcoded English", () => {
    const onboarding = read("src/pages/partner/PartnerOnboarding.tsx");
    expect(onboarding).toMatch(/partnerOnboarding\.alreadyPartner/);
    expect(onboarding).toMatch(/partnerOnboarding\.signIn/);

    const landing = read("src/pages/LandingPage.tsx");
    expect(landing).toMatch(/landing\.footer\.partnerLogin/);
  });

  it("the copy exists in all three locales", () => {
    for (const loc of ["en", "es", "nl"]) {
      const dict = JSON.parse(read(`src/i18n/locales/${loc}.json`));
      expect(dict.partnerOnboarding?.alreadyPartner, `${loc}: alreadyPartner`).toBeTruthy();
      expect(dict.partnerOnboarding?.signIn, `${loc}: signIn`).toBeTruthy();
      expect(dict.landing?.footer?.partnerLogin, `${loc}: footer.partnerLogin`).toBeTruthy();
    }
  });

  it("the three locales are actually different strings, not English copied across", () => {
    const value = (loc: string) =>
      JSON.parse(read(`src/i18n/locales/${loc}.json`)).partnerOnboarding.signIn;
    expect(value("es")).not.toBe(value("en"));
    expect(value("nl")).not.toBe(value("en"));
  });

  it("is reachable from at least two distinct public pages", () => {
    // One link is a single point of failure; a redesign of either page would
    // orphan the route again.
    const publicPages = ["src/pages/LandingPage.tsx", "src/pages/partner/PartnerOnboarding.tsx"];
    const linking = publicPages.filter((f) => read(f).includes(`to="${LOGIN_PATH}"`));
    expect(linking.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
//  G3 — the new link has to be usable, not just present
// ============================================================
//
// GOALS.md G3 sets WCAG AA as the minimum. The first version of this link was
// `text-primary hover:underline`, i.e. distinguished from the sentence around it by
// COLOUR ALONE at rest — a WCAG 1.4.1 failure. Caught by auditing the change
// against GOALS.md rather than by anything automated.

describe("the sign-in link meets G3", () => {
  const src = () => read("src/pages/partner/PartnerOnboarding.tsx");

  it("does not rely on colour alone — the underline is persistent, not hover-only", () => {
    const link = src().match(/<Link\s+to="\/partner\/login"[\s\S]*?>/)?.[0] ?? "";
    expect(link).toMatch(/\bunderline\b/);
    // The failure mode being pinned: an underline that only appears on hover.
    expect(link).not.toMatch(/hover:underline/);
  });

  it("shows a visible focus state, since a bare Link shows none here", () => {
    const link = src().match(/<Link\s+to="\/partner\/login"[\s\S]*?>/)?.[0] ?? "";
    expect(link).toMatch(/focus-visible:ring/);
  });

  it("gives the link a tap target rather than bare inline text", () => {
    const link = src().match(/<Link\s+to="\/partner\/login"[\s\S]*?>/)?.[0] ?? "";
    expect(link).toMatch(/inline-block/);
    expect(link).toMatch(/py-\d/);
  });

  it("does not shrink the surrounding copy below the base size", () => {
    // G3: scalable, readable text. text-sm was needlessly small for a line whose
    // whole job is to be noticed by someone who cannot find their way in.
    expect(src()).toMatch(/text-base text-muted-foreground/);
  });
});

// ============================================================
//  The self-serve path must be reachable too (Option C, 3/3)
// ============================================================
//
// Option C keeps /partner as lead capture and converts applications by admin
// invite. That only works as a product if a partner who would rather do everything
// now can still get to /partner/join — otherwise the low-friction path is the ONLY
// path, which is the situation that produced zero invocations on partner-register.
//
// The success screen matters more than it looks: its own copy promises "a link to
// complete your registration" and used to deliver only an email — over interim
// Gmail transport, where a silent delivery failure is indistinguishable from an
// applicant who never bothered.

describe("the self-serve registration path is reachable from /partner", () => {
  const onboarding = () => read("src/pages/partner/PartnerOnboarding.tsx");

  it("the application page offers it", () => {
    expect(onboarding()).toContain('to="/partner/join"');
  });

  it("the success screen delivers the link its own copy promises", () => {
    const src = onboarding();
    // The promise:
    expect(src).toMatch(/link to complete your registration/);
    // …and the delivery, inside the submitted branch.
    const submitted = src.slice(src.indexOf("if (submitted)"), src.indexOf("if (submitted)") + 2000);
    expect(submitted, "the success screen must link to /partner/join").toContain(
      'to="/partner/join"'
    );
  });

  it("uses translated copy in all three locales", () => {
    expect(onboarding()).toMatch(/partnerOnboarding\.completeNow/);
    for (const loc of ["en", "es", "nl"]) {
      const dict = JSON.parse(read(`src/i18n/locales/${loc}.json`));
      expect(dict.partnerOnboarding?.preferNow, `${loc}: preferNow`).toBeTruthy();
      expect(dict.partnerOnboarding?.completeNow, `${loc}: completeNow`).toBeTruthy();
    }
  });

  it("the locales are real translations, not English copied across", () => {
    const value = (loc: string) =>
      JSON.parse(read(`src/i18n/locales/${loc}.json`)).partnerOnboarding.completeNow;
    expect(value("es")).not.toBe(value("en"));
    expect(value("nl")).not.toBe(value("en"));
  });

  it("does not regress the sign-in link's accessibility treatment", () => {
    // G3 / WCAG 1.4.1: an inline link must not be distinguished by colour alone.
    // Both links carry the same persistent underline and focus ring.
    const src = onboarding();
    const joinLink = src.slice(src.indexOf('to="/partner/join"'));
    expect(joinLink).toMatch(/underline underline-offset-4/);
    expect(joinLink).toMatch(/focus-visible:ring-2/);
  });

  it("still keeps the nav pointed at /partner — Option C is lead capture first", () => {
    const header = read("src/components/layout/PublicHeader.tsx");
    expect(header).toMatch(/to:\s*["']\/partner["']/);
    expect(header).not.toMatch(/to:\s*["']\/partner\/join["']/);
  });
});
