/**
 * Pure pricing calculation — the SINGLE shared implementation used by BOTH the frontend
 * (src/config/pricing.ts) and the charge path (submit-registration). No literals, no
 * Deno/https imports → runs in Deno + Node (vitest). All prices come from a PricingConfig
 * that is sourced from the DB (pricing_plans + pricing_settings). See PRICING_REFACTOR_PLAN.md.
 */

export type MembershipType = "single" | "couple";
export type BillingFrequency = "monthly" | "annual";

export interface PlanConfig {
  monthlyNet: number;        // net €/month before IVA
  annualMonths: number;      // months charged annually (10 = 2 free)
  subscriptionTaxRate: number;
}

export interface PricingConfig {
  single: PlanConfig;
  couple: PlanConfig;
  pendantNet: number;
  pendantTaxRate: number;
  shipping: number;          // IVA included
  registrationBase: number;  // no IVA by default
  registrationTaxRate: number;
}

export function getSubscriptionNetPrice(c: PricingConfig, type: MembershipType, freq: BillingFrequency): number {
  const plan = c[type];
  return freq === "monthly" ? plan.monthlyNet : plan.monthlyNet * plan.annualMonths;
}

export function getSubscriptionFinalPrice(c: PricingConfig, type: MembershipType, freq: BillingFrequency): number {
  const net = getSubscriptionNetPrice(c, type, freq);
  return net * (1 + c[type].subscriptionTaxRate);
}

export function getSubscriptionTax(c: PricingConfig, type: MembershipType, freq: BillingFrequency): number {
  return getSubscriptionNetPrice(c, type, freq) * c[type].subscriptionTaxRate;
}

export function getSubscriptionMonthlyFinal(c: PricingConfig, type: MembershipType): number {
  return c[type].monthlyNet * (1 + c[type].subscriptionTaxRate);
}

export function getAnnualSavings(c: PricingConfig, type: MembershipType): number {
  return getSubscriptionMonthlyFinal(c, type) * 12 - getSubscriptionFinalPrice(c, type, "annual");
}

export function getPendantNetPrice(c: PricingConfig, quantity = 1): number {
  return c.pendantNet * quantity;
}

export function getPendantTax(c: PricingConfig, quantity = 1): number {
  return getPendantNetPrice(c, quantity) * c.pendantTaxRate;
}

export function getPendantFinalPrice(c: PricingConfig, quantity = 1): number {
  return getPendantNetPrice(c, quantity) * (1 + c.pendantTaxRate);
}

export interface OrderOptions {
  membershipType: MembershipType;
  billingFrequency: BillingFrequency;
  includePendant: boolean;
  pendantCount?: number;
  includeShipping?: boolean;
  registrationFeeEnabled?: boolean;
  registrationFeeDiscount?: number; // 0-100
}

export interface OrderCalculation {
  subscriptionNet: number;
  subscriptionTax: number;
  subscriptionFinal: number;
  pendantNet: number;
  pendantTax: number;
  pendantFinal: number;
  pendantCount: number;
  registrationFee: number;
  registrationFeeOriginal: number;
  registrationFeeDiscount: number;
  registrationFeeEnabled: boolean;
  shipping: number;
  subtotalNet: number;
  totalTax: number;
  grandTotal: number;
}

/**
 * Compute the full order from config + options ONLY. There is deliberately no "total"
 * input — a caller (e.g. a tampered client) cannot supply a total; the grand total is
 * always derived here. submit-registration calls this server-side with DB config.
 */
export function calculateOrder(c: PricingConfig, options: OrderOptions): OrderCalculation {
  const {
    membershipType,
    billingFrequency,
    includePendant,
    includeShipping = true,
    registrationFeeEnabled = true,
    registrationFeeDiscount = 0,
  } = options;

  let pendantCount = 0;
  if (includePendant) {
    const requested = options.pendantCount;
    pendantCount = (typeof requested === "number" && requested >= 1 && requested <= 4)
      ? Math.floor(requested)
      : (membershipType === "couple" ? 2 : 1);
  }

  const subscriptionNet = getSubscriptionNetPrice(c, membershipType, billingFrequency);
  const subscriptionTax = subscriptionNet * c[membershipType].subscriptionTaxRate;
  const subscriptionFinal = subscriptionNet + subscriptionTax;

  const pendantNet = getPendantNetPrice(c, pendantCount);
  const pendantTax = pendantNet * c.pendantTaxRate;
  const pendantFinal = pendantNet + pendantTax;

  const registrationFeeOriginal = c.registrationBase;
  let registrationFee = 0;
  if (registrationFeeEnabled) {
    registrationFee = registrationFeeOriginal * (1 - registrationFeeDiscount / 100);
  }

  const shipping = includePendant && includeShipping ? c.shipping : 0;

  const subtotalNet = subscriptionNet + pendantNet + registrationFee;
  const totalTax = subscriptionTax + pendantTax;
  const grandTotal = subscriptionFinal + pendantFinal + registrationFee + shipping;

  return {
    subscriptionNet, subscriptionTax, subscriptionFinal,
    pendantNet, pendantTax, pendantFinal, pendantCount,
    registrationFee, registrationFeeOriginal, registrationFeeDiscount, registrationFeeEnabled,
    shipping, subtotalNet, totalTax, grandTotal,
  };
}

export function formatPrice(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/** Build a PricingConfig from raw DB rows (pricing_plans + pricing_settings). */
export function buildPricingConfig(
  plans: Array<{ plan_key: string; monthly_net: number; annual_months: number; subscription_tax_rate: number }>,
  settings: Array<{ key: string; value: number }>,
  fallback: PricingConfig,
): PricingConfig {
  const planByKey = new Map(plans.map((p) => [p.plan_key, p]));
  const s = new Map(settings.map((x) => [x.key, Number(x.value)]));
  const plan = (key: MembershipType): PlanConfig => {
    const row = planByKey.get(key);
    return row
      ? { monthlyNet: Number(row.monthly_net), annualMonths: Number(row.annual_months), subscriptionTaxRate: Number(row.subscription_tax_rate) }
      : fallback[key];
  };
  return {
    single: plan("single"),
    couple: plan("couple"),
    pendantNet: s.get("pendant_net") ?? fallback.pendantNet,
    pendantTaxRate: s.get("pendant_tax_rate") ?? fallback.pendantTaxRate,
    shipping: s.get("shipping_amount") ?? fallback.shipping,
    registrationBase: s.get("registration_base") ?? fallback.registrationBase,
    registrationTaxRate: s.get("registration_tax_rate") ?? fallback.registrationTaxRate,
  };
}
