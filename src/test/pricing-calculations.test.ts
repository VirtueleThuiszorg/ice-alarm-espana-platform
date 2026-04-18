import { describe, it, expect } from "vitest";
import {
  calculateOrder,
  PRICING,
  getSubscriptionNetPrice,
  // getSubscriptionFinalPrice,
  getSubscriptionMonthlyFinal,
  getAnnualSavings,
  getPendantFinalPrice,
  formatPrice,
} from "@/config/pricing";

describe("calculateOrder", () => {
  it("calculates single monthly order with pendant correctly", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: true,
    });

    // Subscription: 24.99 + 10% IVA
    expect(order.subscriptionNet).toBe(24.99);
    expect(order.subscriptionTax).toBeCloseTo(2.499);
    expect(order.subscriptionFinal).toBeCloseTo(27.489);

    // Pendant: 125.00 + 21% IVA = 151.25
    expect(order.pendantNet).toBe(125.0);
    expect(order.pendantTax).toBeCloseTo(26.25);
    expect(order.pendantFinal).toBeCloseTo(151.25);
    expect(order.pendantCount).toBe(1);

    // Registration: 59.99 (no IVA)
    expect(order.registrationFee).toBe(59.99);

    // Shipping: 14.99
    expect(order.shipping).toBe(14.99);

    // Grand total
    expect(order.grandTotal).toBeCloseTo(27.489 + 151.25 + 59.99 + 14.99);
  });

  it("calculates couple monthly order with 2 pendants", () => {
    const order = calculateOrder({
      membershipType: "couple",
      billingFrequency: "monthly",
      includePendant: true,
    });

    expect(order.subscriptionNet).toBe(34.99);
    expect(order.pendantCount).toBe(2);
    expect(order.pendantNet).toBeCloseTo(250.0);
    expect(order.pendantFinal).toBeCloseTo(302.5);
  });

  it("calculates couple annual order correctly", () => {
    const order = calculateOrder({
      membershipType: "couple",
      billingFrequency: "annual",
      includePendant: true,
    });

    // Couple annual = 34.99 × 10 months = 349.90 net
    expect(order.subscriptionNet).toBeCloseTo(349.9);
    expect(order.pendantCount).toBe(2);
    expect(order.pendantNet).toBeCloseTo(250.0);
  });

  it("skips pendant and shipping when not included", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: false,
    });

    expect(order.pendantNet).toBe(0);
    expect(order.pendantFinal).toBe(0);
    expect(order.pendantCount).toBe(0);
    expect(order.shipping).toBe(0);
  });

  it("applies registration fee discount correctly", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: false,
      registrationFeeEnabled: true,
      registrationFeeDiscount: 50,
    });

    expect(order.registrationFee).toBeCloseTo(29.995);
    expect(order.registrationFeeOriginal).toBe(59.99);
    expect(order.registrationFeeDiscount).toBe(50);
  });

  it("applies 100% registration fee discount (free)", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: false,
      registrationFeeEnabled: true,
      registrationFeeDiscount: 100,
    });

    expect(order.registrationFee).toBe(0);
  });

  it("disables registration fee when setting is off", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: false,
      registrationFeeEnabled: false,
    });

    expect(order.registrationFee).toBe(0);
    expect(order.registrationFeeEnabled).toBe(false);
  });

  it("respects explicit pendant count override", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: true,
      pendantCount: 3,
    });

    expect(order.pendantCount).toBe(3);
    expect(order.pendantNet).toBe(375.0);
  });

  it("skips shipping when includeShipping is false", () => {
    const order = calculateOrder({
      membershipType: "single",
      billingFrequency: "monthly",
      includePendant: true,
      includeShipping: false,
    });

    expect(order.shipping).toBe(0);
    expect(order.pendantCount).toBe(1);
  });
});

describe("getSubscriptionNetPrice", () => {
  it("returns monthly net price for single", () => {
    expect(getSubscriptionNetPrice("single", "monthly")).toBe(24.99);
  });

  it("returns annual net price (10 months) for single", () => {
    expect(getSubscriptionNetPrice("single", "annual")).toBeCloseTo(249.9);
  });

  it("returns monthly net price for couple", () => {
    expect(getSubscriptionNetPrice("couple", "monthly")).toBe(34.99);
  });

  it("returns annual net price (10 months) for couple", () => {
    expect(getSubscriptionNetPrice("couple", "annual")).toBeCloseTo(349.9);
  });
});

describe("getAnnualSavings", () => {
  it("annual savings equals 2 months of final price for single", () => {
    const savings = getAnnualSavings("single");
    const monthlyFinal = getSubscriptionMonthlyFinal("single");
    expect(savings).toBeCloseTo(monthlyFinal * 2);
  });

  it("annual savings equals 2 months of final price for couple", () => {
    const savings = getAnnualSavings("couple");
    const monthlyFinal = getSubscriptionMonthlyFinal("couple");
    expect(savings).toBeCloseTo(monthlyFinal * 2);
  });
});

describe("getPendantFinalPrice", () => {
  it("single pendant is 125 + 21% IVA = 151.25", () => {
    expect(getPendantFinalPrice(1)).toBeCloseTo(151.25);
  });

  it("two pendants double the price", () => {
    expect(getPendantFinalPrice(2)).toBeCloseTo(302.5);
  });

  it("zero pendants costs nothing", () => {
    expect(getPendantFinalPrice(0)).toBe(0);
  });
});

describe("formatPrice", () => {
  it("formats with euro symbol and 2 decimals", () => {
    expect(formatPrice(24.99)).toBe("€24.99");
    expect(formatPrice(0)).toBe("€0.00");
    expect(formatPrice(151.25)).toBe("€151.25");
  });
});

describe("PRICING constants", () => {
  it("subscription tax rate is 10%", () => {
    expect(PRICING.subscription.taxRate).toBe(0.1);
  });

  it("pendant tax rate is 21%", () => {
    expect(PRICING.pendant.taxRate).toBe(0.21);
  });

  it("registration has no IVA", () => {
    expect(PRICING.registration.taxRate).toBe(0);
  });

  it("annual plans give 2 months free (pay 10 for 12)", () => {
    expect(PRICING.subscription.single.annualMonths).toBe(10);
    expect(PRICING.subscription.couple.annualMonths).toBe(10);
  });
});
