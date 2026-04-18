import { describe, it, expect } from "vitest";
import {
  PRICING,
  calculateOrder,
  getSubscriptionNetPrice,
  getSubscriptionTax,
  getSubscriptionFinalPrice,
  getSubscriptionMonthlyFinal,
  getAnnualSavings,
  getPendantNetPrice,
  getPendantTax,
  getPendantFinalPrice,
  getRegistrationFee,
  getShippingCost,
  formatPrice,
  getDisplayPrices,
} from "@/config/pricing";

// ---- Helpers ----

/** Round to 2 decimal places to avoid floating-point noise in assertions. */
function r(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
//  1. Subscription helpers
// ============================================================

describe("Subscription pricing helpers", () => {
  // ---------- Net prices ----------

  describe("getSubscriptionNetPrice", () => {
    it("returns monthly net price for single", () => {
      expect(getSubscriptionNetPrice("single", "monthly")).toBe(24.99);
    });

    it("returns monthly net price for couple", () => {
      expect(getSubscriptionNetPrice("couple", "monthly")).toBe(34.99);
    });

    it("returns annual net price for single (10 months)", () => {
      // 24.99 * 10 = 249.90
      expect(r(getSubscriptionNetPrice("single", "annual"))).toBe(249.9);
    });

    it("returns annual net price for couple (10 months)", () => {
      // 34.99 * 10 = 349.90
      expect(r(getSubscriptionNetPrice("couple", "annual"))).toBe(349.9);
    });
  });

  // ---------- Tax ----------

  describe("getSubscriptionTax", () => {
    it("applies 10% IVA on single monthly", () => {
      // 24.99 * 0.10 = 2.499
      expect(r(getSubscriptionTax("single", "monthly"))).toBe(2.5);
    });

    it("applies 10% IVA on couple monthly", () => {
      // 34.99 * 0.10 = 3.499
      expect(r(getSubscriptionTax("couple", "monthly"))).toBe(3.5);
    });

    it("applies 10% IVA on single annual", () => {
      // 249.90 * 0.10 = 24.99
      expect(r(getSubscriptionTax("single", "annual"))).toBe(24.99);
    });

    it("applies 10% IVA on couple annual", () => {
      // 349.90 * 0.10 = 34.99
      expect(r(getSubscriptionTax("couple", "annual"))).toBe(34.99);
    });
  });

  // ---------- Final (net + IVA) ----------

  describe("getSubscriptionFinalPrice", () => {
    it("calculates single monthly final price", () => {
      // 24.99 * 1.10 = 27.489
      expect(r(getSubscriptionFinalPrice("single", "monthly"))).toBe(27.49);
    });

    it("calculates couple monthly final price", () => {
      // 34.99 * 1.10 = 38.489
      expect(r(getSubscriptionFinalPrice("couple", "monthly"))).toBe(38.49);
    });

    it("calculates single annual final price", () => {
      // 249.90 * 1.10 = 274.89
      expect(r(getSubscriptionFinalPrice("single", "annual"))).toBe(274.89);
    });

    it("calculates couple annual final price", () => {
      // 349.90 * 1.10 = 384.89
      expect(r(getSubscriptionFinalPrice("couple", "annual"))).toBe(384.89);
    });
  });

  // ---------- Monthly equivalent ----------

  describe("getSubscriptionMonthlyFinal", () => {
    it("returns single monthly final with IVA", () => {
      // 24.99 * 1.10 = 27.489
      expect(r(getSubscriptionMonthlyFinal("single"))).toBe(27.49);
    });

    it("returns couple monthly final with IVA", () => {
      // 34.99 * 1.10 = 38.489
      expect(r(getSubscriptionMonthlyFinal("couple"))).toBe(38.49);
    });
  });
});

// ============================================================
//  2. Annual savings
// ============================================================

describe("getAnnualSavings", () => {
  it("calculates 2-month savings for single plan", () => {
    // monthly final * 12 - annual final
    // 27.489 * 12 = 329.868 ; annual = 274.89 ; savings = 54.978
    const savings = getAnnualSavings("single");
    expect(r(savings)).toBe(r(getSubscriptionMonthlyFinal("single") * 12 - getSubscriptionFinalPrice("single", "annual")));
    // savings should be roughly 2 months' worth
    expect(savings).toBeGreaterThan(0);
  });

  it("calculates 2-month savings for couple plan", () => {
    const savings = getAnnualSavings("couple");
    expect(r(savings)).toBe(r(getSubscriptionMonthlyFinal("couple") * 12 - getSubscriptionFinalPrice("couple", "annual")));
    expect(savings).toBeGreaterThan(0);
  });

  it("annual savings are approximately equal to 2 monthly payments", () => {
    const singleMonthly = getSubscriptionMonthlyFinal("single");
    const singleSavings = getAnnualSavings("single");
    // Should be very close to 2 * monthly (the difference is floating-point rounding)
    expect(r(singleSavings)).toBeCloseTo(r(singleMonthly * 2), 1);
  });
});

// ============================================================
//  3. Pendant pricing
// ============================================================

describe("Pendant pricing helpers", () => {
  describe("getPendantNetPrice", () => {
    it("returns net price for 1 pendant", () => {
      expect(getPendantNetPrice(1)).toBe(125.0);
    });

    it("returns net price for 2 pendants", () => {
      expect(getPendantNetPrice(2)).toBe(250.0);
    });

    it("defaults to 1 pendant when no quantity given", () => {
      expect(getPendantNetPrice()).toBe(125.0);
    });
  });

  describe("getPendantTax", () => {
    it("applies 21% IVA for 1 pendant", () => {
      // 125 * 0.21 = 26.25
      expect(getPendantTax(1)).toBe(26.25);
    });

    it("applies 21% IVA for 2 pendants", () => {
      // 250 * 0.21 = 52.50
      expect(getPendantTax(2)).toBe(52.5);
    });
  });

  describe("getPendantFinalPrice", () => {
    it("calculates final price for 1 pendant", () => {
      // 125 * 1.21 = 151.25
      expect(getPendantFinalPrice(1)).toBe(151.25);
    });

    it("calculates final price for 2 pendants", () => {
      // 250 * 1.21 = 302.50
      expect(getPendantFinalPrice(2)).toBe(302.5);
    });
  });
});

// ============================================================
//  4. Registration & shipping
// ============================================================

describe("Registration and shipping", () => {
  it("returns the registration fee", () => {
    expect(getRegistrationFee()).toBe(59.99);
  });

  it("registration fee has 0% IVA", () => {
    expect(PRICING.registration.taxRate).toBe(0);
  });

  it("returns the shipping cost", () => {
    expect(getShippingCost()).toBe(14.99);
  });

  it("shipping has IVA already included", () => {
    expect(PRICING.shipping.taxIncluded).toBe(true);
  });
});

// ============================================================
//  5. calculateOrder - full order breakdown
// ============================================================

describe("calculateOrder", () => {
  // ---------- Single monthly ----------

  describe("single monthly with pendant", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: true,
    });

    it("sets pendantCount to 1 for single", () => {
      expect(order.pendantCount).toBe(1);
    });

    it("calculates subscription amounts correctly", () => {
      expect(r(order.subscriptionNet)).toBe(24.99);
      expect(r(order.subscriptionTax)).toBe(2.5);
      expect(r(order.subscriptionFinal)).toBe(27.49);
    });

    it("calculates pendant amounts correctly", () => {
      expect(order.pendantNet).toBe(125.0);
      expect(order.pendantTax).toBe(26.25);
      expect(order.pendantFinal).toBe(151.25);
    });

    it("includes registration fee by default", () => {
      expect(order.registrationFeeEnabled).toBe(true);
      expect(order.registrationFee).toBe(59.99);
      expect(order.registrationFeeDiscount).toBe(0);
    });

    it("includes shipping when pendant is ordered", () => {
      expect(order.shipping).toBe(14.99);
    });

    it("calculates grand total correctly", () => {
      // subscriptionFinal + pendantFinal + registrationFee + shipping
      const expected = r(order.subscriptionFinal + order.pendantFinal + order.registrationFee + order.shipping);
      expect(r(order.grandTotal)).toBe(expected);
    });
  });

  // ---------- Single annual ----------

  describe("single annual with pendant", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "annual",
      includePendant: true,
    });

    it("calculates annual subscription net as 10 months", () => {
      expect(r(order.subscriptionNet)).toBe(249.9);
    });

    it("applies 10% IVA on annual subscription", () => {
      expect(r(order.subscriptionTax)).toBe(24.99);
    });

    it("calculates grand total", () => {
      const expected = r(order.subscriptionFinal + order.pendantFinal + order.registrationFee + order.shipping);
      expect(r(order.grandTotal)).toBe(expected);
    });
  });

  // ---------- Couple monthly ----------

  describe("couple monthly with pendant", () => {
    const order = calculateOrder({
      membershipType: "couple",
      billingFrequency: "monthly",
      includePendant: true,
    });

    it("sets pendantCount to 2 for couple", () => {
      expect(order.pendantCount).toBe(2);
    });

    it("calculates couple subscription amounts", () => {
      expect(r(order.subscriptionNet)).toBe(34.99);
      expect(r(order.subscriptionTax)).toBe(3.5);
      expect(r(order.subscriptionFinal)).toBe(38.49);
    });

    it("calculates pendant amounts for 2 pendants", () => {
      expect(order.pendantNet).toBe(250.0);
      expect(order.pendantTax).toBe(52.5);
      expect(order.pendantFinal).toBe(302.5);
    });
  });

  // ---------- Couple annual ----------

  describe("couple annual with pendant", () => {
    const order = calculateOrder({
      membershipType: "couple",
      billingFrequency: "annual",
      includePendant: true,
    });

    it("calculates annual subscription for couple", () => {
      expect(r(order.subscriptionNet)).toBe(349.9);
      expect(r(order.subscriptionFinal)).toBe(384.89);
    });

    it("includes 2 pendants", () => {
      expect(order.pendantCount).toBe(2);
    });
  });

  // ---------- No pendant ----------

  describe("order without pendant", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: false,
    });

    it("sets pendant count to 0", () => {
      expect(order.pendantCount).toBe(0);
    });

    it("pendant amounts are all zero", () => {
      expect(order.pendantNet).toBe(0);
      expect(order.pendantTax).toBe(0);
      expect(order.pendantFinal).toBe(0);
    });

    it("does not add shipping when no pendant", () => {
      expect(order.shipping).toBe(0);
    });

    it("grand total is subscription + registration only", () => {
      const expected = r(order.subscriptionFinal + order.registrationFee);
      expect(r(order.grandTotal)).toBe(expected);
    });
  });

  // ---------- Registration fee disabled ----------

  describe("registration fee disabled", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: false,
      registrationFeeEnabled: false,
    });

    it("sets registration fee to 0 when disabled", () => {
      expect(order.registrationFee).toBe(0);
      expect(order.registrationFeeEnabled).toBe(false);
    });

    it("preserves the original fee amount", () => {
      expect(order.registrationFeeOriginal).toBe(59.99);
    });

    it("grand total does not include registration fee", () => {
      expect(r(order.grandTotal)).toBe(r(order.subscriptionFinal));
    });
  });

  // ---------- Registration fee discounted ----------

  describe("registration fee with discount", () => {
    it("applies 50% discount to registration fee", () => {
      const order = calculateOrder({
        membershipType: "single",
        billingFrequency: "monthly",
        includePendant: false,
        registrationFeeEnabled: true,
        registrationFeeDiscount: 50,
      });

      expect(r(order.registrationFee)).toBe(r(59.99 * 0.5));
      expect(order.registrationFeeDiscount).toBe(50);
    });

    it("applies 100% discount (free registration)", () => {
      const order = calculateOrder({
        membershipType: "single",
        billingFrequency: "monthly",
        includePendant: false,
        registrationFeeEnabled: true,
        registrationFeeDiscount: 100,
      });

      expect(order.registrationFee).toBe(0);
    });

    it("applies 0% discount (full price)", () => {
      const order = calculateOrder({
        membershipType: "single",
        billingFrequency: "monthly",
        includePendant: false,
        registrationFeeEnabled: true,
        registrationFeeDiscount: 0,
      });

      expect(order.registrationFee).toBe(59.99);
    });
  });

  // ---------- Custom pendant count ----------

  describe("custom pendant count override", () => {
    it("allows overriding pendant count for single", () => {
      const order = calculateOrder({
        membershipType: "single",
        billingFrequency: "monthly",
        includePendant: true,
        pendantCount: 3,
      });

      expect(order.pendantCount).toBe(3);
      expect(order.pendantNet).toBe(375.0);
    });

    it("allows overriding pendant count for couple", () => {
      const order = calculateOrder({
        membershipType: "couple",
        billingFrequency: "monthly",
        includePendant: true,
        pendantCount: 1,
      });

      // Override couple default of 2 to 1
      expect(order.pendantCount).toBe(1);
      expect(order.pendantNet).toBe(125.0);
    });
  });

  // ---------- Shipping control ----------

  describe("shipping toggle", () => {
    it("excludes shipping when includeShipping is false", () => {
      const order = calculateOrder({
        membershipType: "single",
        billingFrequency: "monthly",
        includePendant: true,
        includeShipping: false,
      });

      expect(order.shipping).toBe(0);
    });

    it("includes shipping by default when pendant is ordered", () => {
      const order = calculateOrder({
        membershipType: "single",
        billingFrequency: "monthly",
        includePendant: true,
      });

      expect(order.shipping).toBe(14.99);
    });
  });

  // ---------- Tax totals ----------

  describe("tax calculations in order totals", () => {
    it("totalTax includes subscription + pendant tax", () => {
      const order = calculateOrder({
        membershipType: "single",
        billingFrequency: "monthly",
        includePendant: true,
      });

      expect(r(order.totalTax)).toBe(r(order.subscriptionTax + order.pendantTax));
    });

    it("totalTax is zero tax on pendant when no pendant ordered", () => {
      const order = calculateOrder({
        membershipType: "single",
        billingFrequency: "monthly",
        includePendant: false,
      });

      expect(r(order.totalTax)).toBe(r(order.subscriptionTax));
    });
  });
});

// ============================================================
//  6. Display helpers
// ============================================================

describe("formatPrice", () => {
  it("formats whole numbers with two decimals", () => {
    expect(formatPrice(125)).toBe("\u20AC125.00");
  });

  it("formats prices with cents", () => {
    expect(formatPrice(24.99)).toBe("\u20AC24.99");
  });

  it("rounds to two decimal places", () => {
    expect(formatPrice(27.489)).toBe("\u20AC27.49");
  });

  it("handles zero", () => {
    expect(formatPrice(0)).toBe("\u20AC0.00");
  });
});

describe("getDisplayPrices", () => {
  it("returns a complete display prices object", () => {
    const prices = getDisplayPrices();

    // Structure checks
    expect(prices).toHaveProperty("single");
    expect(prices).toHaveProperty("couple");
    expect(prices).toHaveProperty("pendant");
    expect(prices).toHaveProperty("registration");
    expect(prices).toHaveProperty("shipping");

    // Spot-check specific values
    expect(prices.single.monthly).toBe("\u20AC27.49");
    expect(prices.couple.monthly).toBe("\u20AC38.49");
    expect(prices.pendant.net).toBe("\u20AC125.00");
    expect(prices.pendant.final).toBe("\u20AC151.25");
    expect(prices.registration).toBe("\u20AC59.99");
    expect(prices.shipping).toBe("\u20AC14.99");
  });
});
