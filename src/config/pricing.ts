// Pricing for Care Conneqt — frontend entry point.
//
// SINGLE SOURCE OF TRUTH = the DB (pricing_plans + pricing_settings). The pure math lives in
// supabase/functions/_shared/pricing-calc.ts and is shared with the charge path
// (submit-registration). This module keeps the long-standing helper signatures
// (getSubscriptionMonthlyFinal(type), calculateOrder(options), …) but they read an
// "active config" that usePricing() hydrates from the DB at runtime. Until hydrated (and on
// fetch failure) the active config is DEFAULT_PRICING_CONFIG, which mirrors the DB seed —
// so prices are correct even before the network call, and the seed-parity test locks
// DEFAULT == migration seed. See PRICING_REFACTOR_PLAN.md.

import {
  type PricingConfig,
  type MembershipType,
  type BillingFrequency,
  type OrderOptions,
  type OrderCalculation,
  buildPricingConfig as buildPricingConfigPure,
  calculateOrder as calcOrder,
  getSubscriptionNetPrice as calcSubNet,
  getSubscriptionFinalPrice as calcSubFinal,
  getSubscriptionMonthlyFinal as calcSubMonthlyFinal,
  getSubscriptionTax as calcSubTax,
  getAnnualSavings as calcAnnualSavings,
  getPendantFinalPrice as calcPendantFinal,
  getPendantTax as calcPendantTax,
  getPendantNetPrice as calcPendantNet,
  formatPrice as fmt,
} from "../../supabase/functions/_shared/pricing-calc";

export type { PricingConfig, MembershipType, BillingFrequency, OrderOptions, OrderCalculation };

/** Fallback / seed-mirror. The DB is authoritative; this only applies before hydration. */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  single: { monthlyNet: 24.99, annualMonths: 10, subscriptionTaxRate: 0.10 },
  couple: { monthlyNet: 34.99, annualMonths: 10, subscriptionTaxRate: 0.10 },
  pendantNet: 125.00,
  pendantTaxRate: 0.21,
  shipping: 14.99,
  registrationBase: 59.99,
  registrationTaxRate: 0,
};

// ── active config (hydrated from DB by usePricing) ──
let activeConfig: PricingConfig = DEFAULT_PRICING_CONFIG;
export function setPricingConfig(config: PricingConfig): void { activeConfig = config; }
export function getActivePricingConfig(): PricingConfig { return activeConfig; }
export function buildPricingConfig(
  plans: Parameters<typeof buildPricingConfigPure>[0],
  settings: Parameters<typeof buildPricingConfigPure>[1],
): PricingConfig {
  return buildPricingConfigPure(plans, settings, DEFAULT_PRICING_CONFIG);
}

// ── helpers — same signatures as before, now config-driven ──
export const formatPrice = fmt;
export function getSubscriptionNetPrice(type: MembershipType, freq: BillingFrequency): number {
  return calcSubNet(activeConfig, type, freq);
}
export function getSubscriptionFinalPrice(type: MembershipType, freq: BillingFrequency): number {
  return calcSubFinal(activeConfig, type, freq);
}
export function getSubscriptionTax(type: MembershipType, freq: BillingFrequency): number {
  return calcSubTax(activeConfig, type, freq);
}
export function getSubscriptionMonthlyFinal(type: MembershipType): number {
  return calcSubMonthlyFinal(activeConfig, type);
}
export function getAnnualSavings(type: MembershipType): number {
  return calcAnnualSavings(activeConfig, type);
}
export function getPendantNetPrice(quantity = 1): number {
  return calcPendantNet(activeConfig, quantity);
}
export function getPendantTax(quantity = 1): number {
  return calcPendantTax(activeConfig, quantity);
}
export function getPendantFinalPrice(quantity = 1): number {
  return calcPendantFinal(activeConfig, quantity);
}
export function getRegistrationFee(): number { return activeConfig.registrationBase; }
export function getShippingCost(): number { return activeConfig.shipping; }
export function calculateOrder(options: OrderOptions): OrderCalculation {
  return calcOrder(activeConfig, options);
}

export function getDisplayPrices() {
  return {
    single: {
      monthly: formatPrice(getSubscriptionMonthlyFinal("single")),
      annual: formatPrice(getSubscriptionFinalPrice("single", "annual")),
      annualSavings: formatPrice(getAnnualSavings("single")),
    },
    couple: {
      monthly: formatPrice(getSubscriptionMonthlyFinal("couple")),
      annual: formatPrice(getSubscriptionFinalPrice("couple", "annual")),
      annualSavings: formatPrice(getAnnualSavings("couple")),
    },
    pendant: {
      net: formatPrice(getPendantNetPrice(1)),
      final: formatPrice(getPendantFinalPrice(1)),
    },
    registration: formatPrice(activeConfig.registrationBase),
    shipping: formatPrice(activeConfig.shipping),
  };
}

/**
 * Legacy compatibility shim for the old `PRICING` object shape (a few callers read
 * PRICING.registration.amount etc.). Mirrors DEFAULT — operational flags/base only. New
 * code should use the config-driven helpers / usePricing() instead.
 */
export const PRICING = {
  subscription: {
    single: { monthlyNet: DEFAULT_PRICING_CONFIG.single.monthlyNet, annualMonths: DEFAULT_PRICING_CONFIG.single.annualMonths },
    couple: { monthlyNet: DEFAULT_PRICING_CONFIG.couple.monthlyNet, annualMonths: DEFAULT_PRICING_CONFIG.couple.annualMonths },
    taxRate: DEFAULT_PRICING_CONFIG.single.subscriptionTaxRate,
  },
  registration: { amount: DEFAULT_PRICING_CONFIG.registrationBase, taxRate: DEFAULT_PRICING_CONFIG.registrationTaxRate },
  pendant: { unitPriceNet: DEFAULT_PRICING_CONFIG.pendantNet, taxRate: DEFAULT_PRICING_CONFIG.pendantTaxRate },
  shipping: { amount: DEFAULT_PRICING_CONFIG.shipping, taxIncluded: true },
} as const;
