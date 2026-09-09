import { getActivePricingConfig } from "@/config/pricing";
import type { BillingFrequency, MembershipType } from "@/config/pricing";

/**
 * WHAT THE MEMBER IS ACTUALLY CHARGED — because `subscriptions.amount` is not that number.
 *
 * THE DEFECT. Both functions that create a subscription write the NET figure into
 * `subscriptions.amount`:
 *
 *   submit_registration_atomic  (20260908120500:336)  `v_subscription_net`
 *   create_payment_link_order   (20260909110000:169)  `v_sub_net`
 *
 * and the Membership page rendered it straight out as `€{amount}/mo`. So a single monthly member
 * whose card is debited €27.39 read **€24.90** on the one page in the product that is supposed to
 * tell them what their membership costs. Every other surface — the join wizard's summary, the
 * plan cards, the Stripe line items — shows the IVA-inclusive figure, because that is what
 * leaves the bank. This page was the odd one out, and it understated the price by the tax.
 *
 * WHY DERIVE RATHER THAN CHANGE THE COLUMN. `subscriptions.amount` being net is load-bearing for
 * the accounting split: `toOrderAmounts()` reports nets and taxes separately, and finance reads
 * it. Redefining the column would be a data migration touching every historical row and every
 * query over them, to fix a display. The tax rate is a property of the PLAN, held in
 * `pricing_plans.subscription_tax_rate`, so the inclusive figure is derivable from the row we
 * already have.
 *
 * THEIR NET, TODAY'S RATE. The rate comes from the active pricing config rather than from the
 * subscription, because the row does not record one — and a VAT rate is set by law and applies
 * uniformly, so today's is the right one to apply to a member's own contracted net. What is NOT
 * done here is re-pricing them: the net is theirs, from their row, so a member on an old price
 * keeps it.
 */

export interface SubscriptionPrice {
  /** The contracted net, straight from the row. */
  net: number;
  /** The plan's IVA rate, 0-1, from `pricing_plans`. */
  taxRate: number;
  /** Net + IVA — what the member is actually charged. */
  final: number;
  /** True when a rate was found and applied. False means `final === net`, and say so. */
  taxApplied: boolean;
}

/**
 * A missing or unusable amount returns nulls rather than 0.
 *
 * €0.00 is a real price — `subscriptions.is_free_of_charge` exists — so rendering 0 for "we
 * could not read it" would tell a paying member their membership is free.
 */
export function subscriptionPrice(
  amountNet: number | null | undefined,
  planType: MembershipType | string | null | undefined,
): SubscriptionPrice | null {
  if (amountNet === null || amountNet === undefined) return null;
  const net = Number(amountNet);
  if (!Number.isFinite(net) || net < 0) return null;

  const config = getActivePricingConfig();
  const plan =
    planType === "single" || planType === "couple" ? config[planType] : undefined;

  // No plan, no rate. Reporting the net as though it were the charge is what this module
  // exists to stop, so the caller is told the tax could not be applied and can say so.
  if (!plan || !Number.isFinite(plan.subscriptionTaxRate)) {
    return { net, taxRate: 0, final: net, taxApplied: false };
  }

  const taxRate = plan.subscriptionTaxRate;
  return {
    net,
    taxRate,
    final: Number((net * (1 + taxRate)).toFixed(2)),
    taxApplied: true,
  };
}

/** The rate as a whole-number percentage, for "incl. 10% IVA". */
export function taxRatePercent(price: SubscriptionPrice): number {
  return Math.round(price.taxRate * 100);
}

/** Re-exported so a caller does not need two imports to render a period. */
export type { BillingFrequency, MembershipType };
