import type { PricingConfig } from "@/config/pricing";

/** Flat string form state for the admin pricing editor (inputs are strings). */
export interface PricingForm {
  singleMonthlyNet: string;
  coupleMonthlyNet: string;
  annualMonths: string;
  subscriptionTaxRate: string;
  pendantNet: string;
  pendantTaxRate: string;
  shipping: string;
  registrationBase: string;
  registrationTaxRate: string;
}

export function configToForm(c: PricingConfig): PricingForm {
  return {
    singleMonthlyNet: String(c.single.monthlyNet),
    coupleMonthlyNet: String(c.couple.monthlyNet),
    annualMonths: String(c.single.annualMonths),
    subscriptionTaxRate: String(c.single.subscriptionTaxRate),
    pendantNet: String(c.pendantNet),
    pendantTaxRate: String(c.pendantTaxRate),
    shipping: String(c.shipping),
    registrationBase: String(c.registrationBase),
    registrationTaxRate: String(c.registrationTaxRate),
  };
}

const n = (v: string, fallback = 0): number => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : fallback;
};

/** Build a PricingConfig from the form (for the live preview). */
export function formToConfig(f: PricingForm): PricingConfig {
  const months = Math.max(1, Math.round(n(f.annualMonths, 10)));
  const subTax = n(f.subscriptionTaxRate);
  return {
    single: { monthlyNet: n(f.singleMonthlyNet), annualMonths: months, subscriptionTaxRate: subTax },
    couple: { monthlyNet: n(f.coupleMonthlyNet), annualMonths: months, subscriptionTaxRate: subTax },
    pendantNet: n(f.pendantNet),
    pendantTaxRate: n(f.pendantTaxRate),
    shipping: n(f.shipping),
    registrationBase: n(f.registrationBase),
    registrationTaxRate: n(f.registrationTaxRate),
  };
}

/** Map the form to the DB rows to upsert (pricing_plans by plan_key, pricing_settings by key). */
export function formToDbRows(f: PricingForm): {
  plans: Array<{ plan_key: string; monthly_net: number; annual_months: number; subscription_tax_rate: number }>;
  settings: Array<{ key: string; value: number }>;
} {
  const months = Math.max(1, Math.round(n(f.annualMonths, 10)));
  const subTax = n(f.subscriptionTaxRate);
  return {
    plans: [
      { plan_key: "single", monthly_net: n(f.singleMonthlyNet), annual_months: months, subscription_tax_rate: subTax },
      { plan_key: "couple", monthly_net: n(f.coupleMonthlyNet), annual_months: months, subscription_tax_rate: subTax },
    ],
    settings: [
      { key: "pendant_net", value: n(f.pendantNet) },
      { key: "pendant_tax_rate", value: n(f.pendantTaxRate) },
      { key: "shipping_amount", value: n(f.shipping) },
      { key: "registration_base", value: n(f.registrationBase) },
      { key: "registration_tax_rate", value: n(f.registrationTaxRate) },
    ],
  };
}
