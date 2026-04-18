// Centralized pricing configuration for ICE Alarm España
// All prices are in EUR

export const PRICING = {
  // Subscription prices (NET prices, before IVA)
  subscription: {
    single: {
      monthlyNet: 24.99,    // Net price per month
      annualMonths: 10,      // Pay for 10 months, get 12 (2 months free)
    },
    couple: {
      monthlyNet: 34.99,    // Net price per month  
      annualMonths: 10,      // Pay for 10 months, get 12 (2 months free)
    },
    taxRate: 0.10,           // 10% IVA for subscriptions
  },
  
  // One-time fees
  registration: {
    amount: 59.99,           // Registration fee (no IVA)
    taxRate: 0,              // No IVA on registration fee
  },
  
  pendant: {
    unitPriceNet: 125.00,    // Net price per pendant
    taxRate: 0.21,           // 21% IVA for products
  },
  
  shipping: {
    amount: 14.99,           // Shipping cost (IVA included)
    taxIncluded: true,       // No additional IVA
  },
} as const;

// ============ HELPER FUNCTIONS ============

export type MembershipType = 'single' | 'couple';
export type BillingFrequency = 'monthly' | 'annual';

/**
 * Get the NET subscription price (before IVA)
 */
export function getSubscriptionNetPrice(
  type: MembershipType, 
  frequency: BillingFrequency
): number {
  const plan = PRICING.subscription[type];
  if (frequency === 'monthly') {
    return plan.monthlyNet;
  }
  // Annual = monthly × 10 (2 months free)
  return plan.monthlyNet * plan.annualMonths;
}

/**
 * Get the subscription IVA amount
 */
export function getSubscriptionTax(
  type: MembershipType, 
  frequency: BillingFrequency
): number {
  const net = getSubscriptionNetPrice(type, frequency);
  return net * PRICING.subscription.taxRate;
}

/**
 * Get the FINAL subscription price (including IVA)
 */
export function getSubscriptionFinalPrice(
  type: MembershipType, 
  frequency: BillingFrequency
): number {
  const net = getSubscriptionNetPrice(type, frequency);
  const tax = net * PRICING.subscription.taxRate;
  return net + tax;
}

/**
 * Get the monthly equivalent of the final price (for display)
 */
export function getSubscriptionMonthlyFinal(type: MembershipType): number {
  const net = PRICING.subscription[type].monthlyNet;
  return net * (1 + PRICING.subscription.taxRate);
}

/**
 * Get the annual savings when paying annually
 */
export function getAnnualSavings(type: MembershipType): number {
  const monthlyFinal = getSubscriptionMonthlyFinal(type);
  const annualFinal = getSubscriptionFinalPrice(type, 'annual');
  return (monthlyFinal * 12) - annualFinal; // 2 months savings
}

/**
 * Get the NET pendant price
 */
export function getPendantNetPrice(quantity: number = 1): number {
  return PRICING.pendant.unitPriceNet * quantity;
}

/**
 * Get the pendant IVA amount
 */
export function getPendantTax(quantity: number = 1): number {
  return getPendantNetPrice(quantity) * PRICING.pendant.taxRate;
}

/**
 * Get the FINAL pendant price (including IVA)
 */
export function getPendantFinalPrice(quantity: number = 1): number {
  const net = getPendantNetPrice(quantity);
  return net * (1 + PRICING.pendant.taxRate);
}

/**
 * Get the registration fee (no IVA)
 */
export function getRegistrationFee(): number {
  return PRICING.registration.amount;
}

/**
 * Get shipping cost (IVA already included)
 */
export function getShippingCost(): number {
  return PRICING.shipping.amount;
}

/**
 * Calculate full order breakdown
 */
export interface OrderCalculation {
  // Subscription
  subscriptionNet: number;
  subscriptionTax: number;
  subscriptionFinal: number;
  
  // Pendant
  pendantNet: number;
  pendantTax: number;
  pendantFinal: number;
  pendantCount: number;
  
  // Registration
  registrationFee: number;
  registrationFeeOriginal: number;
  registrationFeeDiscount: number; // percentage applied
  registrationFeeEnabled: boolean;
  
  // Shipping
  shipping: number;
  
  // Totals
  subtotalNet: number;
  totalTax: number;
  grandTotal: number;
}

export interface OrderOptions {
  membershipType: MembershipType;
  billingFrequency: BillingFrequency;
  includePendant: boolean;
  pendantCount?: number;
  includeShipping?: boolean;
  // Registration fee settings
  registrationFeeEnabled?: boolean;
  registrationFeeDiscount?: number; // 0-100
}

export function calculateOrder(options: OrderOptions): OrderCalculation {
  const { 
    membershipType, 
    billingFrequency, 
    includePendant, 
    includeShipping = true,
    registrationFeeEnabled = true,
    registrationFeeDiscount = 0,
  } = options;
  
  // Determine pendant count
  let pendantCount = 0;
  if (includePendant) {
    pendantCount = options.pendantCount ?? (membershipType === 'couple' ? 2 : 1);
  }
  
  // Subscription
  const subscriptionNet = getSubscriptionNetPrice(membershipType, billingFrequency);
  const subscriptionTax = subscriptionNet * PRICING.subscription.taxRate;
  const subscriptionFinal = subscriptionNet + subscriptionTax;
  
  // Pendant
  const pendantNet = getPendantNetPrice(pendantCount);
  const pendantTax = pendantNet * PRICING.pendant.taxRate;
  const pendantFinal = pendantNet + pendantTax;
  
  // Registration (no IVA) - apply enabled/discount settings
  const registrationFeeOriginal = PRICING.registration.amount;
  let registrationFee = 0;
  if (registrationFeeEnabled) {
    registrationFee = registrationFeeOriginal * (1 - registrationFeeDiscount / 100);
  }
  
  // Shipping (IVA included, only if pendant ordered)
  const shipping = (includePendant && includeShipping) ? PRICING.shipping.amount : 0;
  
  // Totals
  const subtotalNet = subscriptionNet + pendantNet + registrationFee;
  const totalTax = subscriptionTax + pendantTax;
  const grandTotal = subscriptionFinal + pendantFinal + registrationFee + shipping;
  
  return {
    subscriptionNet,
    subscriptionTax,
    subscriptionFinal,
    pendantNet,
    pendantTax,
    pendantFinal,
    pendantCount,
    registrationFee,
    registrationFeeOriginal,
    registrationFeeDiscount,
    registrationFeeEnabled,
    shipping,
    subtotalNet,
    totalTax,
    grandTotal,
  };
}

// ============ DISPLAY HELPERS ============

/**
 * Format price for display
 */
export function formatPrice(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/**
 * Get formatted monthly display prices (with IVA)
 */
export function getDisplayPrices() {
  return {
    single: {
      monthly: formatPrice(getSubscriptionMonthlyFinal('single')),      // €27.49
      annual: formatPrice(getSubscriptionFinalPrice('single', 'annual')), // €274.89
      annualSavings: formatPrice(getAnnualSavings('single')),           // ~€55
    },
    couple: {
      monthly: formatPrice(getSubscriptionMonthlyFinal('couple')),      // €38.49
      annual: formatPrice(getSubscriptionFinalPrice('couple', 'annual')), // €384.89
      annualSavings: formatPrice(getAnnualSavings('couple')),           // ~€77
    },
    pendant: {
      net: formatPrice(PRICING.pendant.unitPriceNet),                   // €125.00
      final: formatPrice(getPendantFinalPrice(1)),                      // €151.25
    },
    registration: formatPrice(PRICING.registration.amount),              // €59.99
    shipping: formatPrice(PRICING.shipping.amount),                      // €14.99
  };
}
