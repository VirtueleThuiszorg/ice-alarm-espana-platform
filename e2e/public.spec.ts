import { test, expect } from "@playwright/test";
import {
  gotoAudited,
  findDeadAnchors,
  collectInternalHrefs,
  findBrandLeaks,
  collectMissingI18nKeys,
  findNoOpButtons,
  type Lang,
} from "./helpers/pageAudit";
import { getDeclaredRoutes, routeExists } from "./helpers/routes";

/**
 * Per-page audit for PUBLIC routes (LAUNCH_SCOPE.md §8).
 *
 * Each check that FAILS today because of a KNOWN DEFECT is registered in
 * KNOWN_ISSUES below and skipped via test.fixme() with its reason — so the suite
 * runs "green or annotated", never falsely green (GOALS.md G5). Every entry here
 * is mirrored in FINDINGS.md. Remove an entry when the underlying defect is fixed
 * and the check goes green.
 *
 * Key format: `${route} :: ${check}` or `* :: ${check}` (applies to every route).
 */
const KNOWN_ISSUES: Record<string, string> = {
  // Missing i18n keys — the same keys fire for en/es/nl because they are absent
  // from en.json itself, so nl (which falls back to en) inherits the gap. Each
  // is mirrored in FINDINGS.md; remove the entry once the keys are added.
  "/ :: render": "missing i18n key: help.title — FINDINGS.md F1",
  "/pricing :: render":
    "missing i18n keys: pricing.oneTime/pendant/shipping/registration, landing.save — FINDINGS.md F2",
  "/help :: render":
    "missing i18n keys: help.heading/subheading/searchPlaceholder/allCategories/userGuide/faq/general/device/footer/contactUs — FINDINGS.md F3",
  "/terms :: render":
    "missing i18n keys: legal.footer.termsOfService, legal.footer.privacyPolicy — FINDINGS.md F4",
  "/privacy :: render":
    "missing i18n keys: legal.footer.termsOfService, legal.footer.privacyPolicy — FINDINGS.md F5",
  "/login :: render": "missing i18n key: validation.passwordMin — FINDINGS.md F6",
  "/partner :: render":
    "missing i18n keys: partnerOnboarding.* (15 keys, howItWorks/steps/commission/region/howHeard) — FINDINGS.md F7",
  "/partner/login :: render":
    "missing i18n keys: partnerLogin.title, partnerLogin.subtitle — FINDINGS.md F8",

  // No-op-button heuristic false positives: handlers verified present in source,
  // but their effect is not DOM-observable under the anon/empty backend (form
  // submits need filled fields + a live provider; data filters have no rows to
  // filter). NOT dead buttons. See FINDINGS.md "button-check false positives".
  "/how-it-works :: dead-buttons":
    "FAQ AccordionTrigger ('What if it's 3am?') is real; expand not caught by the click heuristic — FINDINGS.md B1",
  "/contact :: dead-buttons": "'Send Message' is a real form onSubmit — FINDINGS.md B1",
  "/partner :: dead-buttons":
    "'Register Your Interest' is a real form onSubmit — FINDINGS.md B1",
  "/help :: dead-buttons":
    "'general'/'device' are category filters over an empty (dead-backend) article list — FINDINGS.md B1",
  "/join :: dead-buttons":
    "step-nav / Back on step 1 are handled but no-op by design under audit state — FINDINGS.md B1",
};

const PUBLIC_ROUTES: { path: string; name: string }[] = [
  { path: "/", name: "landing" },
  { path: "/pendant", name: "pendant" },
  { path: "/how-it-works", name: "how-it-works" },
  { path: "/pricing", name: "pricing" },
  { path: "/contact", name: "contact" },
  { path: "/help", name: "help" },
  { path: "/blog", name: "blog" },
  { path: "/terms", name: "terms" },
  { path: "/privacy", name: "privacy" },
  { path: "/join", name: "join-step1" },
  { path: "/login", name: "login" },
  { path: "/partner", name: "partner" },
  { path: "/partner/join", name: "partner-join" },
  { path: "/partner/login", name: "partner-login" },
];

const LANGS: Lang[] = ["en", "es", "nl"];
const declared = getDeclaredRoutes();

function knownIssue(route: string, check: string): string | undefined {
  // Exact match, then an all-language `render` fallback (a route's missing keys
  // are the same across en/es/nl), then a wildcard-route fallback.
  const renderFallback = check.startsWith("render-") ? `${route} :: render` : undefined;
  return (
    KNOWN_ISSUES[`${route} :: ${check}`] ??
    (renderFallback ? KNOWN_ISSUES[renderFallback] : undefined) ??
    KNOWN_ISSUES[`* :: ${check}`]
  );
}

for (const { path, name } of PUBLIC_ROUTES) {
  test.describe(`${name} (${path})`, () => {
    test("no dead anchors (href='#')", async ({ page }) => {
      const reason = knownIssue(path, "dead-anchors");
      test.fixme(!!reason, reason);
      await gotoAudited(page, path, "en");
      const dead = await findDeadAnchors(page);
      expect(
        dead,
        `Dead anchors found:\n${dead.map((d) => `  "${d.text}" -> ${d.href}`).join("\n")}`
      ).toEqual([]);
    });

    test("internal links resolve to a declared route", async ({ page }) => {
      const reason = knownIssue(path, "internal-links");
      test.fixme(!!reason, reason);
      await gotoAudited(page, path, "en");
      const hrefs = await collectInternalHrefs(page);
      const broken = hrefs.filter((h) => !routeExists(h, declared));
      expect(broken, `Links to nonexistent routes:\n  ${broken.join("\n  ")}`).toEqual([]);
    });

    test("no forbidden brand strings in rendered output", async ({ page }) => {
      const reason = knownIssue(path, "brand");
      test.fixme(!!reason, reason);
      await gotoAudited(page, path, "en");
      const hits = await findBrandLeaks(page);
      expect(
        hits,
        `Forbidden brand strings:\n${hits.map((h) => `  ${h.term}: "${h.sample}"`).join("\n")}`
      ).toEqual([]);
    });

    for (const lng of LANGS) {
      test(`renders in ${lng} with zero missing i18n keys`, async ({ page }) => {
        const reason = knownIssue(path, `render-${lng}`);
        test.fixme(!!reason, reason);
        await gotoAudited(page, path, lng);

        // The page rendered real content (not a blank/crashed shell).
        const bodyText = await page.evaluate(() => document.body.innerText || "");
        expect(bodyText.trim().length, "page rendered no visible text").toBeGreaterThan(30);

        const missing = await collectMissingI18nKeys(page);
        expect(
          missing,
          `Missing i18n keys in ${lng}:\n  ${missing.slice(0, 40).join("\n  ")}`
        ).toEqual([]);
      });
    }

    test("every visible button has an effect (no no-op handlers)", async ({ page }) => {
      const reason = knownIssue(path, "dead-buttons");
      test.fixme(!!reason, reason);
      test.slow(); // re-navigates per button
      const dead = await findNoOpButtons(page, path, "en");
      expect(
        dead,
        `Buttons with no observable effect:\n${dead.map((d) => `  [#${d.index}] "${d.name}"`).join("\n")}`
      ).toEqual([]);
    });
  });
}
