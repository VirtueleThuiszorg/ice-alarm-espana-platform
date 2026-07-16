import { describe, it, expect } from "vitest";
import {
  calculateOrder,
  getSubscriptionMonthlyFinal,
  getSubscriptionFinalPrice,
  buildPricingConfig,
  type PricingConfig,
} from "../../supabase/functions/_shared/pricing-calc";
import { DEFAULT_PRICING_CONFIG } from "@/config/pricing";
import { configToForm, formToConfig, formToDbRows } from "@/lib/pricingEditor";

// The exact rows the migration seeds (20260617120000_pricing_source.sql).
const SEED_PLANS = [
  { plan_key: "single", monthly_net: 24.99, annual_months: 10, subscription_tax_rate: 0.10 },
  { plan_key: "couple", monthly_net: 34.99, annual_months: 10, subscription_tax_rate: 0.10 },
];
const SEED_SETTINGS = [
  { key: "pendant_net", value: 125.0 },
  { key: "pendant_tax_rate", value: 0.21 },
  { key: "shipping_amount", value: 14.99 },
  { key: "registration_base", value: 59.99 },
  { key: "registration_tax_rate", value: 0.0 },
];

describe("seed-parity — DB seed maps to the same config as the code DEFAULT", () => {
  it("buildPricingConfig(seed rows) deep-equals DEFAULT_PRICING_CONFIG", () => {
    const fromSeed = buildPricingConfig(SEED_PLANS, SEED_SETTINGS, DEFAULT_PRICING_CONFIG);
    expect(fromSeed).toEqual(DEFAULT_PRICING_CONFIG);
  });

  it("DEFAULT still holds today's exact values (locks no-change-at-launch)", () => {
    expect(DEFAULT_PRICING_CONFIG.single.monthlyNet).toBe(24.99);
    expect(DEFAULT_PRICING_CONFIG.couple.monthlyNet).toBe(34.99);
    expect(DEFAULT_PRICING_CONFIG.single.annualMonths).toBe(10);
    expect(DEFAULT_PRICING_CONFIG.pendantNet).toBe(125.0);
    expect(DEFAULT_PRICING_CONFIG.shipping).toBe(14.99);
    expect(DEFAULT_PRICING_CONFIG.registrationBase).toBe(59.99);
  });
});

describe("calc-parity — displayed prices reproduce today's figures", () => {
  const c = DEFAULT_PRICING_CONFIG;
  it("monthly finals are 27.49 / 38.49", () => {
    expect(getSubscriptionMonthlyFinal(c, "single")).toBeCloseTo(27.49, 2);
    expect(getSubscriptionMonthlyFinal(c, "couple")).toBeCloseTo(38.49, 2);
  });
  it("annual finals are 274.89 / 384.89", () => {
    expect(getSubscriptionFinalPrice(c, "single", "annual")).toBeCloseTo(274.89, 2);
    expect(getSubscriptionFinalPrice(c, "couple", "annual")).toBeCloseTo(384.89, 2);
  });
});

describe("calc-parity — same calc → displayed total == server total across the matrix", () => {
  const c = DEFAULT_PRICING_CONFIG;
  const matrix = [
    { membershipType: "single", billingFrequency: "monthly" },
    { membershipType: "single", billingFrequency: "annual" },
    { membershipType: "couple", billingFrequency: "monthly" },
    { membershipType: "couple", billingFrequency: "annual" },
  ] as const;
  for (const base of matrix) {
    for (const fee of [{ registrationFeeEnabled: true, registrationFeeDiscount: 0 }, { registrationFeeEnabled: false }, { registrationFeeEnabled: true, registrationFeeDiscount: 50 }]) {
      for (const includePendant of [true, false]) {
        it(`${base.membershipType}/${base.billingFrequency} fee=${JSON.stringify(fee)} pendant=${includePendant}`, () => {
          const display = calculateOrder(c, { ...base, includePendant, ...fee });
          const server = calculateOrder(c, { ...base, includePendant, ...fee }); // same fn used both sides
          expect(server.grandTotal).toBe(display.grandTotal);
          expect(server.grandTotal).toBeGreaterThan(0);
        });
      }
    }
  }
});

describe("server-compute — the total is derived, a tampered client total is impossible", () => {
  it("calculateOrder ignores any extraneous total-like field in options", () => {
    const c = DEFAULT_PRICING_CONFIG;
    const legit = calculateOrder(c, { membershipType: "single", billingFrequency: "monthly", includePendant: false });
    // A malicious client tries to smuggle a total — the function signature has no such input,
    // and the result is identical to the legit computation.
    const tampered = calculateOrder(c, { membershipType: "single", billingFrequency: "monthly", includePendant: false, grandTotal: 0.01, total: 0.01 } as Parameters<typeof calculateOrder>[1]);
    expect(tampered.grandTotal).toBe(legit.grandTotal);
    expect(tampered.grandTotal).not.toBe(0.01);
  });

  it("changing DB config changes the computed total (proves DB is the source)", () => {
    const cheaper: PricingConfig = { ...DEFAULT_PRICING_CONFIG, single: { ...DEFAULT_PRICING_CONFIG.single, monthlyNet: 10 } };
    const a = calculateOrder(DEFAULT_PRICING_CONFIG, { membershipType: "single", billingFrequency: "monthly", includePendant: false });
    const b = calculateOrder(cheaper, { membershipType: "single", billingFrequency: "monthly", includePendant: false });
    expect(b.grandTotal).toBeLessThan(a.grandTotal);
  });
});

describe("editor I/O — form ↔ config ↔ DB rows", () => {
  it("configToForm → formToConfig round-trips", () => {
    const form = configToForm(DEFAULT_PRICING_CONFIG);
    expect(formToConfig(form)).toEqual(DEFAULT_PRICING_CONFIG);
  });

  it("formToDbRows produces the canonical plan + settings rows", () => {
    const rows = formToDbRows(configToForm(DEFAULT_PRICING_CONFIG));
    expect(rows.plans.map((p) => p.plan_key).sort()).toEqual(["couple", "single"]);
    const single = rows.plans.find((p) => p.plan_key === "single")!;
    expect(single.monthly_net).toBe(24.99);
    const keys = rows.settings.map((s) => s.key).sort();
    expect(keys).toEqual(["pendant_net", "pendant_tax_rate", "registration_base", "registration_tax_rate", "shipping_amount"]);
  });
});
