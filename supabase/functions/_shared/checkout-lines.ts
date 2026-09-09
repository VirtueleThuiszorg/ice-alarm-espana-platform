/**
 * The line items of a Stripe Checkout Session, built from SYNCED PRICE IDS — never from an
 * amount somebody sent us.
 *
 * THE DEFECT THIS EXISTS TO AVOID REBUILDING. `create-checkout` composes every line from
 * `price_data` with `unit_amount: Math.round(item.amount * 100)`, where `item.amount` came from
 * the BROWSER (REVIEW_JOIN_PATH.md F7), and nothing server-side ever checked it (F9). A visitor
 * who edited the request body paid whatever they typed and was activated as a full member. The
 * new staff path must not have a second version of that hole, so this module names Stripe Price
 * IDS — objects created from `pricing_plans` / `pricing_settings` by `stripe-sync-prices` — and
 * there is no number left in the request for anyone to tamper with.
 *
 * ONE IMPLEMENTATION, SHARED. The brief says "the SAME price-id logic as create-checkout (share
 * the module, never a second copy)". This is that module, and BOTH now import it:
 * `send-payment-link` (staff sending a link) and `create-checkout` (the join wizard's Pay
 * button). It was written while `create-checkout` still built `price_data` from client amounts,
 * so it was designed to be adopted by import rather than by rewrite: everything below is pure
 * and takes its inputs as arguments. The rows those arguments come from are fetched once, in
 * `_shared/checkout-pricing.ts`, for the same reason.
 *
 * WHAT IT REFUSES, and why refusing is right:
 *
 *   PRICE_NOT_SYNCED  a price this order needs has no current row in `stripe_prices`. Charging
 *                     anyway would mean inventing an amount, which is the F7 defect.
 *   PRICE_STALE       the synced Price disagrees with what our tables now say. Somebody edited
 *                     a price and did not press "Sync prices to Stripe", so the customer would
 *                     be charged last month's figure while the admin screen showed this
 *                     month's. Both numbers look right in isolation; that is what makes it
 *                     dangerous.
 *   TOTAL_MISMATCH    the Prices we are about to charge do not add up to what `calculateOrder`
 *                     says the order costs. Two sources of truth have diverged and neither can
 *                     be trusted for money.
 *   BAD_SELECTION     the staff selection is not a thing we sell.
 *
 * THE ONE INLINE LINE, and it is deliberate. `registration_fee_discount` is a PERCENTAGE in
 * system_settings; a Stripe Price is a fixed amount, so a discounted fee cannot be one of the
 * seven synced Prices without creating a new Price per discount. When a discount is active that
 * single line is priced inline from the SERVER's own figure (`calculateOrder`), which keeps the
 * rule that matters — the browser sends no amounts — while not requiring a Stripe round trip
 * every time Lee moves the discount. With no discount, the synced Price is used.
 */

import {
  calculateOrder,
  type BillingFrequency,
  type MembershipType,
  type OrderCalculation,
  type PricingConfig,
} from "./pricing-calc.ts";
import {
  desiredPrices,
  planPriceKey,
  toCents,
  type ExistingPrice,
  type StripePriceKey,
} from "./stripe-price-sync.ts";

/** What staff chose on the member's record. No amounts: that is the whole point. */
export interface LinkSelection {
  membershipType: MembershipType;
  billingFrequency: BillingFrequency;
  /** 0, 1 or 2. A couple defaults to 2 in the UI; three pendants is not a thing we sell. */
  pendantCount: number;
  /** Shipping is charged ONCE per order, however many pendants (P3). */
  includeShipping: boolean;
  registrationFeeEnabled: boolean;
  /** Percentage, 0-100, from system_settings — never from the browser. */
  registrationFeeDiscount: number;
}

export type CheckoutLineSource = "synced_price" | "server_amount";

export interface CheckoutLine {
  /** Which of our prices this line is. */
  priceKey: StripePriceKey;
  /** A Stripe Price id, or null for the one inline line (a discounted registration fee). */
  stripePriceId: string | null;
  /** Present only for an inline line: the name Stripe shows on the invoice. */
  inlineName: string | null;
  source: CheckoutLineSource;
  quantity: number;
  /** IVA-included, in cents, per unit. */
  unitAmountCents: number;
  recurringInterval: "month" | "year" | null;
}

export type PriceResolutionCode =
  | "PRICE_NOT_SYNCED"
  | "PRICE_STALE"
  | "TOTAL_MISMATCH"
  | "BAD_SELECTION";

export class PriceResolutionError extends Error {
  readonly code: PriceResolutionCode;
  /** The price keys involved, so the UI can name them rather than saying "something is wrong". */
  readonly priceKeys: string[];

  constructor(code: PriceResolutionCode, message: string, priceKeys: string[] = []) {
    super(message);
    this.name = "PriceResolutionError";
    this.code = code;
    this.priceKeys = priceKeys;
  }
}

export interface ResolvedCheckout {
  lines: CheckoutLine[];
  /** The accounting split (nets and taxes) from calculateOrder — what the order rows record. */
  order: OrderCalculation;
  /** What Stripe will actually charge on the first invoice, in cents. */
  totalCents: number;
  /** The recurring line, called out because Checkout needs `mode: "subscription"` for it. */
  recurringLine: CheckoutLine;
}

/** Names for the inline line. Only the fee can be inline, so only the fee is named. */
const INLINE_NAMES: Partial<Record<StripePriceKey, string>> = {
  registration_fee: "ICE Alarm España — registration fee (discounted)",
};

/** Cents difference we will tolerate between the Prices and calculateOrder: none worth naming. */
export const TOTAL_TOLERANCE_CENTS = 2;

function currentByKey(prices: ExistingPrice[]): Map<string, ExistingPrice> {
  // Last one wins if a caller hands us duplicates; the table's partial unique index makes that
  // impossible for `is_current` rows, and a caller passing history is a caller bug, not a price.
  return new Map(prices.map((p) => [p.price_key, p]));
}

/**
 * Resolve one price key against the synced table AND against what our tables say today.
 *
 * Both halves matter. A missing row means we have nothing to charge; a row that disagrees with
 * `desiredPrices()` means the tables moved and nobody synced, and charging the old Price would
 * be charging a price no screen in the product is showing.
 */
function requirePrice(
  key: StripePriceKey,
  current: Map<string, ExistingPrice>,
  desiredCents: Map<StripePriceKey, number>,
): ExistingPrice {
  const row = current.get(key);
  if (!row) {
    throw new PriceResolutionError(
      "PRICE_NOT_SYNCED",
      `No Stripe Price is synced for "${key}". Press "Sync prices to Stripe" in Admin → ` +
        "Settings → Pricing before sending a payment link.",
      [key],
    );
  }
  const want = desiredCents.get(key);
  if (want !== undefined && row.amount_cents !== want) {
    throw new PriceResolutionError(
      "PRICE_STALE",
      `The Stripe Price for "${key}" is ${row.amount_cents} cents but the pricing tables now ` +
        `say ${want}. Sync prices to Stripe first — sending this link would charge the old ` +
        "amount while the screens show the new one.",
      [key],
    );
  }
  return row;
}

/**
 * The cross-check that ties Stripe to our own arithmetic: if the Prices we are about to charge
 * do not add up to what `calculateOrder` says this order costs, two sources of truth have
 * diverged, and the honest response is to charge nobody.
 *
 * EXPORTED SO IT CAN BE TESTED DIRECTLY, and the reason is worth writing down: with the current
 * seven prices this is UNREACHABLE from rounding alone. The only multiplied line is the pendant
 * (quantity ≤ 2), so cent-rounding can drift the total by at most one cent against a tolerance
 * of two. It is a DIVERGENCE DETECTOR for a future edit — someone changing `desiredPrices()`,
 * adding a line, or raising a quantity — not a condition today's data can produce. Testing it
 * through `resolveCheckoutLines` would therefore be testing nothing; testing it here tests the
 * rule.
 */
export function assertTotalsAgree(
  lineTotalCents: number,
  orderTotalCents: number,
  priceKeys: string[] = [],
): void {
  if (Math.abs(lineTotalCents - orderTotalCents) > TOTAL_TOLERANCE_CENTS) {
    throw new PriceResolutionError(
      "TOTAL_MISMATCH",
      `The synced Prices total ${lineTotalCents} cents but the pricing tables compute ` +
        `${orderTotalCents}. Sync prices to Stripe and try again.`,
      priceKeys,
    );
  }
}

export function resolveCheckoutLines(
  selection: LinkSelection,
  prices: ExistingPrice[],
  config: PricingConfig,
): ResolvedCheckout {
  if (selection.membershipType !== "single" && selection.membershipType !== "couple") {
    throw new PriceResolutionError(
      "BAD_SELECTION",
      `Unknown membership type "${selection.membershipType}".`,
    );
  }
  if (selection.billingFrequency !== "monthly" && selection.billingFrequency !== "annual") {
    throw new PriceResolutionError(
      "BAD_SELECTION",
      `Unknown billing frequency "${selection.billingFrequency}".`,
    );
  }
  if (
    !Number.isInteger(selection.pendantCount) ||
    selection.pendantCount < 0 ||
    selection.pendantCount > 2
  ) {
    throw new PriceResolutionError(
      "BAD_SELECTION",
      `pendantCount must be 0, 1 or 2 (got ${selection.pendantCount}).`,
    );
  }
  if (
    !Number.isFinite(selection.registrationFeeDiscount) ||
    selection.registrationFeeDiscount < 0 ||
    selection.registrationFeeDiscount > 100
  ) {
    throw new PriceResolutionError(
      "BAD_SELECTION",
      `registrationFeeDiscount must be 0-100 (got ${selection.registrationFeeDiscount}).`,
    );
  }

  const includePendant = selection.pendantCount > 0;
  const order = calculateOrder(config, {
    membershipType: selection.membershipType,
    billingFrequency: selection.billingFrequency,
    includePendant,
    pendantCount: includePendant ? selection.pendantCount : undefined,
    // Shipping only exists because a pendant is being posted; charged once (P3).
    includeShipping: includePendant && selection.includeShipping,
    registrationFeeEnabled: selection.registrationFeeEnabled,
    registrationFeeDiscount: selection.registrationFeeDiscount,
  });

  const current = currentByKey(prices);
  const desiredCents = new Map<StripePriceKey, number>(
    desiredPrices(config).map((d) => [d.priceKey, d.amountCents]),
  );

  const lines: CheckoutLine[] = [];

  // ── the membership: the one recurring line, and the reason for mode: "subscription" ──
  const planKey = planPriceKey(selection.membershipType, selection.billingFrequency);
  const planRow = requirePrice(planKey, current, desiredCents);
  const recurringLine: CheckoutLine = {
    priceKey: planKey,
    stripePriceId: planRow.stripe_price_id,
    inlineName: null,
    source: "synced_price",
    quantity: 1,
    unitAmountCents: planRow.amount_cents,
    recurringInterval: (planRow.recurring_interval as "month" | "year" | null) ?? null,
  };
  if (recurringLine.recurringInterval === null) {
    // A membership Price with no interval would charge once and never renew — P1 is an
    // auto-renewing subscription, so this is a refusal rather than a warning.
    throw new PriceResolutionError(
      "PRICE_STALE",
      `The synced Price for "${planKey}" has no recurring interval, so it would charge once ` +
        "and never renew. Re-sync prices to Stripe.",
      [planKey],
    );
  }
  lines.push(recurringLine);

  // ── the pendant: quantity 2 for a couple, one price ──
  if (includePendant) {
    const pendantRow = requirePrice("pendant", current, desiredCents);
    lines.push({
      priceKey: "pendant",
      stripePriceId: pendantRow.stripe_price_id,
      inlineName: null,
      source: "synced_price",
      quantity: selection.pendantCount,
      unitAmountCents: pendantRow.amount_cents,
      recurringInterval: null,
    });

    // ── shipping: ONCE, however many pendants ──
    if (selection.includeShipping) {
      const shippingRow = requirePrice("shipping", current, desiredCents);
      lines.push({
        priceKey: "shipping",
        stripePriceId: shippingRow.stripe_price_id,
        inlineName: null,
        source: "synced_price",
        quantity: 1,
        unitAmountCents: shippingRow.amount_cents,
        recurringInterval: null,
      });
    }
  }

  // ── the registration fee, synced at full price and inline when discounted ──
  if (order.registrationFee > 0) {
    if (selection.registrationFeeDiscount > 0) {
      lines.push({
        priceKey: "registration_fee",
        stripePriceId: null,
        inlineName: INLINE_NAMES.registration_fee ?? "Registration fee",
        source: "server_amount",
        quantity: 1,
        unitAmountCents: toCents(order.registrationFee),
        recurringInterval: null,
      });
    } else {
      const feeRow = requirePrice("registration_fee", current, desiredCents);
      lines.push({
        priceKey: "registration_fee",
        stripePriceId: feeRow.stripe_price_id,
        inlineName: null,
        source: "synced_price",
        quantity: 1,
        unitAmountCents: feeRow.amount_cents,
        recurringInterval: null,
      });
    }
  }

  const totalCents = lines.reduce((sum, l) => sum + l.unitAmountCents * l.quantity, 0);
  assertTotalsAgree(totalCents, toCents(order.grandTotal), lines.map((l) => l.priceKey));

  return { lines, order, totalCents, recurringLine };
}

/**
 * The `line_items` array for `stripe.checkout.sessions.create`.
 *
 * Kept beside the resolver rather than inside the edge function so the SHAPE is testable: a
 * one-off `price` in a `mode: "subscription"` session is added to the first invoice, which is
 * exactly P1 ("membership = subscription; pendant, shipping and the fee are one-off items on the
 * first invoice"). Getting that wrong in either direction — a recurring pendant, or a
 * membership charged once — is a billing defect nobody notices for a month.
 */
export function toStripeLineItems(lines: CheckoutLine[]): Array<Record<string, unknown>> {
  return lines.map((l) =>
    l.stripePriceId
      ? { price: l.stripePriceId, quantity: l.quantity }
      : {
          quantity: l.quantity,
          price_data: {
            currency: "eur",
            unit_amount: l.unitAmountCents,
            product_data: { name: l.inlineName ?? l.priceKey },
          },
        },
  );
}

/**
 * The `amounts` block `create_payment_link_order()` stores.
 *
 * The FINALS and the TOTAL come from the resolved lines — what Stripe will actually charge —
 * while the nets and tax rates come from `calculateOrder`, which is the accounting split. That
 * is not a fudge: the SQL function asserts the finals sum to the total, and the only figures it
 * can honestly assert that of are the ones being charged.
 */
export function toOrderAmounts(resolved: ResolvedCheckout): Record<string, number> {
  const cents = (key: StripePriceKey) =>
    resolved.lines
      .filter((l) => l.priceKey === key)
      .reduce((sum, l) => sum + l.unitAmountCents * l.quantity, 0);
  const euros = (c: number) => Number((c / 100).toFixed(2));

  const { order } = resolved;
  // The membership line is `recurringLine` — the resolver already identified it, so there is no
  // need to find it again by key and no chance of picking the wrong one.
  const planLine = resolved.recurringLine;
  const subscriptionFinal = euros(planLine.unitAmountCents * planLine.quantity);

  return {
    subscriptionNet: Number(order.subscriptionNet.toFixed(2)),
    subscriptionTax: Number((subscriptionFinal - order.subscriptionNet).toFixed(2)),
    subscriptionFinal,
    subscriptionTaxRate: Number(
      (order.subscriptionNet > 0
        ? (subscriptionFinal - order.subscriptionNet) / order.subscriptionNet
        : 0
      ).toFixed(4),
    ),
    pendantNet: Number(order.pendantNet.toFixed(2)),
    pendantTax: Number((euros(cents("pendant")) - order.pendantNet).toFixed(2)),
    pendantFinal: euros(cents("pendant")),
    pendantTaxRate: Number(
      (order.pendantNet > 0
        ? (euros(cents("pendant")) - order.pendantNet) / order.pendantNet
        : 0
      ).toFixed(4),
    ),
    registrationFee: euros(cents("registration_fee")),
    shipping: euros(cents("shipping")),
    total: euros(resolved.totalCents),
  };
}
