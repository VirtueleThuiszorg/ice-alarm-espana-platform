/**
 * Partner commission terms: €50 FLAT, ONCE PER MEMBER (Lee, 2026-07-24;
 * re-confirmed and tightened 2026-09-08 — "one member, one payment").
 * No volume tiers, no discounts for more, and the same €50 for every partner
 * type. Three surfaces must agree:
 *
 *  1. The PUBLIC partner page (/partner/join; /partner redirects to it) shows
 *     NO commission figures at all —
 *     general value prop only; terms are stated in the confirmation email.
 *  2. (RETIRED) partner-apply's confirmation email stated the terms. That
 *     function is deleted; see the note where its block used to be.
 *  3. The actual payout math (useOrderActions) pays the same flat €50 —
 *     the old €55/€60 volume-tier calculation is gone everywhere, including
 *     the partner-portal copy that advertised it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
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

// SURFACE 2 IS GONE. The flat terms used to be stated in partner-apply's confirmation email,
// and that function was deleted when the application path was retired (Lee confirmed zero
// pending applications). The terms now reach a partner through the invite and the agreement,
// not through an application acknowledgement — so there is no email here to assert on, and a
// test reading a deleted file would be worse than no test.
describe("3 — payout math and portal copy match the emailed terms", () => {
  it("useOrderActions pays a flat €50 constant — tier calculation deleted", () => {
    // Renamed from COMMISSION_PER_PENDANT_EUR on 2026-09-08. The agreement pays
    // "€50 gross for each successful referral"; the pendant is the trigger, not
    // the unit. The old name invited a couple's two pendants to be read as
    // €100, which would breach the agreement.
    expect(orderActions).toMatch(/COMMISSION_PER_MEMBER_EUR = 50/);
    // Code only — the docblock quotes the old name deliberately, to explain why
    // multiplying by pendant quantity would breach the agreement.
    const code = orderActions
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(code, "the per-pendant name must not come back").not.toMatch(
      /COMMISSION_PER_PENDANT_EUR/,
    );
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
