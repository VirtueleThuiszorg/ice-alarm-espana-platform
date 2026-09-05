/**
 * Partner commission terms: €50 per pendant sold, FLAT (Lee, 2026-07-24).
 * No volume tiers, no discounts for more. Three surfaces must agree:
 *
 *  1. The PUBLIC partner page (/partner/join; /partner redirects to it) shows
 *     NO commission figures at all —
 *     general value prop only; terms are stated in the confirmation email.
 *  2. The application confirmation email (partner-apply) states the flat
 *     terms explicitly, in the applicant's language, non-blocking.
 *  3. The actual payout math (useOrderActions) pays the same flat €50 —
 *     the old €55/€60 volume-tier calculation is gone everywhere, including
 *     the partner-portal copy that advertised it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const apply = read("supabase/functions/partner-apply/index.ts");
const orderActions = read("src/hooks/useOrderActions.ts");

describe("1 — the public partner page carries no commission figures", () => {
  // Surface 1 used to be `/partner` (PartnerOnboarding). That page is retired and
  // `/partner` now redirects here, so PartnerJoin IS the public partner page.
  it("PartnerJoin states no figure (terms come by email)", () => {
    const page = read("src/pages/partner/PartnerJoin.tsx");
    expect(page).not.toMatch(/€\s?\d/);
    expect(page).not.toMatch(/commissionTitle|commBase|comm10|comm20/);
  });

  it("no locale carries the retired page's tier copy either", () => {
    for (const loc of ["en", "es", "nl"]) {
      const dict = JSON.parse(read(`src/i18n/locales/${loc}.json`));
      expect(dict.partnerOnboarding, `${loc}: partnerOnboarding is dead copy`).toBeUndefined();
    }
  });
});

describe("2 — confirmation email states the flat terms", () => {
  it("partner-apply sends the applicant a confirmation via the shared transport", () => {
    expect(apply).toMatch(/from "\.\.\/_shared\/email\.ts"/);
    expect(apply).toMatch(/sendEmail\(\s*values\.email/);
  });

  it("terms are €50 per pendant, flat, no tiers — in English and Spanish", () => {
    expect(apply).toMatch(/€50 for every pendant sold/);
    expect(apply).toMatch(/flat rate/);
    expect(apply).toMatch(/no volume tiers/);
    expect(apply).toMatch(/50 € por cada colgante vendido/);
    expect(apply).toMatch(/tarifa fija/);
  });

  it("email failure never blocks or fakes the application response", () => {
    // the send sits in a try/catch that only logs; the saved application
    // still returns success — and the failure is logged loudly, not hidden
    expect(apply).toMatch(/confirmation email FAILED \(application saved\)/);
  });
});

describe("3 — payout math and portal copy match the emailed terms", () => {
  it("useOrderActions pays a flat €50 constant — tier calculation deleted", () => {
    expect(orderActions).toMatch(/COMMISSION_PER_PENDANT_EUR = 50/);
    expect(orderActions).not.toMatch(/calculateCommissionAmount/);
    expect(orderActions).not.toMatch(/TIER_10|TIER_20|\b55\b|\b60\b/);
  });

  it("no €55/€60 tier figure survives anywhere in src/ or the locales", () => {
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|json)$/.test(name) && !p.includes("/test/")) {
          const src = readFileSync(p, "utf8");
          if (/€\s?55|€\s?60|55\s?€|60\s?€|55\/device|60\/device/.test(src)) {
            offenders.push(p.replace(ROOT + "/", ""));
          }
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders, "volume-tier commission figures must not exist").toEqual([]);
  });

  it("portal copy states the flat rate (commissionFlat key in en/es/nl)", () => {
    const commissions = read("src/pages/partner/PartnerCommissionsPage.tsx");
    expect(commissions).toMatch(/partner\.commissionFlat/);
    expect(commissions).not.toMatch(/commissionTier10|commissionTier20|commissionBase/);
    for (const loc of ["en", "es", "nl"]) {
      const d = JSON.parse(read(`src/i18n/locales/${loc}.json`));
      expect(d.partner.commissionFlat, `${loc} partner.commissionFlat`).toBeTruthy();
      expect(d.partner.commissionBase, `${loc} tier keys removed`).toBeUndefined();
      expect(d.partner.commissionTier10).toBeUndefined();
      expect(d.partner.commissionTier20).toBeUndefined();
    }
  });

  it("the approve flow exists: admin PartnersPage activates pending partners", () => {
    const partnersPage = read("src/pages/admin/PartnersPage.tsx");
    expect(partnersPage).toMatch(/status: "active"/);
  });
});
