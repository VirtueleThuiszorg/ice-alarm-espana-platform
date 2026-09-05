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
    // PublicHeader sends everyone to /partner/join, so that page has to offer the
    // way in — this is the entry point that matters most.
    const header = read("src/components/layout/PublicHeader.tsx");
    expect(header, "PublicHeader must point at /partner/join").toMatch(
      /to:\s*["']\/partner\/join["']/
    );

    const join = read("src/pages/partner/PartnerJoin.tsx");
    expect(join, "/partner/join must offer a route to the partner login").toContain(
      `to="${LOGIN_PATH}"`
    );
  });

  it("the landing footer link uses translated copy rather than hardcoded English", () => {
    const landing = read("src/pages/LandingPage.tsx");
    expect(landing).toMatch(/landing\.footer\.partnerLogin/);
  });

  it("the footer copy exists in all three locales, as real translations", () => {
    const value = (loc: string) =>
      JSON.parse(read(`src/i18n/locales/${loc}.json`)).landing?.footer?.partnerLogin;
    for (const loc of ["en", "es", "nl"]) {
      expect(value(loc), `${loc}: footer.partnerLogin`).toBeTruthy();
    }
    expect(value("es")).not.toBe(value("en"));
    expect(value("nl")).not.toBe(value("en"));
  });

  // NOT asserted here, and not silently: `/partner/join` itself is hardcoded
  // English end to end — 970 lines, two `t()` calls, no `useTranslation`. That was
  // survivable while the nav reached a fully-translated page; it is now the sole
  // public partner entry point for a business that ships EN + ES + NL
  // (LAUNCH_SCOPE §6). Translating a 970-line wizard is its own work package —
  // recorded as the top open gap in PARTNER_JOURNEY.md and in STATE.md, not
  // papered over with two translated strings on an otherwise English page.

  it("is reachable from at least two distinct public pages", () => {
    // One link is a single point of failure; a redesign of either page would
    // orphan the route again.
    const publicPages = ["src/pages/LandingPage.tsx", "src/pages/partner/PartnerJoin.tsx"];
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
  // Re-pointed at PartnerJoin: the page these guarantees were written for is gone,
  // and the page that inherited its job had `text-primary hover:underline` — colour
  // alone at rest, no focus state, no tap target. Deleting a page must not delete
  // the accessibility guarantee it carried.
  const src = () => read("src/pages/partner/PartnerJoin.tsx");

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

  it("treats both sign-in links the same way, not just the first", () => {
    // PartnerJoin offers the link twice — under the form and on the success screen.
    // A fix applied to one of them is the failure mode being pinned.
    const links = src().match(/<Link\s+to="\/partner\/login"[\s\S]*?>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toMatch(/underline underline-offset-4/);
      expect(link).toMatch(/focus-visible:ring-2/);
      expect(link).not.toMatch(/hover:underline/);
    }
  });
});

// ============================================================
//  There is no second path left to be reachable from
// ============================================================
//
// This file used to end with a block asserting that `/partner` — the application
// page — offered the self-serve path as a choice before its form, in all three
// locales, and did not route an applicant into `partner-register`'s 409. Every one
// of those assertions described a page and a choice that no longer exist: partners
// have one way in. The single entry point, and the absence of the apply path from
// the public site, are asserted in `partnerSingleEntry.test.ts`.
