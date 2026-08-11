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
import { readFileSync, readdirSync } from "node:fs";
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
