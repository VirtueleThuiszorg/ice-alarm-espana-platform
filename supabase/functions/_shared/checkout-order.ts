/**
 * What a join-path checkout is allowed to charge, read back out of the database.
 *
 * THE DEFECT THIS REPLACES. `create-checkout` used to take a `lineItems` array with an `amount`
 * per line straight from the browser and hand it to Stripe as `price_data`
 * (REVIEW_JOIN_PATH.md F7); nothing server-side ever compared it to the order it claimed to be
 * paying (F9). Editing one number in the request body bought a full membership for a cent, and
 * the webhook then activated the member because the money "arrived". The fix is not a check
 * bolted onto the old shape — it is that the request no longer carries a figure at all. It
 * carries IDS, and every one of them is verified here against the rows `submit-registration`
 * actually wrote before a single line item is built from `stripe_prices`.
 *
 * IDS STILL COME FROM THE REQUEST, and that is a different risk to an amount. A tampered id
 * cannot invent a price; the worst it can do is name somebody else's pending order, which is
 * why each one is cross-checked against the others rather than merely fetched:
 * `payments.order_id` must be the order, both the payment and the subscription must belong to
 * the member, and every row must still be pending. A mismatch is a refusal, not a warning.
 *
 * THE COUPLE HOLE, closed here. A couple's partner member exists only as a second `members`
 * row and a second `subscriptions` row; NOTHING in the schema links either to the order (there
 * is no `orders.partner_member_id` and no `subscriptions.order_id`). Today the partner's ids
 * travel from `submit-registration`'s response through the BROWSER and back in `metadata`, so a
 * client that dropped them — a stale bundle, an adblocker mangling the body, a bug — produced a
 * paid couple whose second member stayed `inactive` for ever, with no error anywhere. So: when
 * the subscription says `couple`, the partner ids are REQUIRED and validated. A structural fix
 * (`subscriptions.order_id`, letting this derive both rows from the order alone and drop the
 * request ids entirely) belongs in the held schema PR — it is a data-model decision, and it is
 * recorded in REVIEW_JOIN_PATH.md rather than taken unilaterally here.
 *
 * WHAT IS NOT TAKEN FROM THE REQUEST ANY MORE, and why each one mattered:
 *   line items / amounts  F7 — the browser named the price (above).
 *   successUrl/cancelUrl  an open redirect on a payment page: whoever crafts the request
 *                         chooses where the customer lands after paying.
 *   customerEmail         the receipt address. Taken from the member row that is being sold to.
 *   metadata              the webhook TRUSTS metadata to decide which rows to activate, so a
 *                         browser-writable metadata bag is a browser-writable activation.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import type { BillingFrequency, MembershipType } from "./pricing-calc.ts";
import { TOTAL_TOLERANCE_CENTS } from "./checkout-lines.ts";

export type CheckoutContextCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_PENDING"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_NOT_PENDING"
  | "SUBSCRIPTION_NOT_FOUND"
  | "SUBSCRIPTION_NOT_PENDING"
  | "MEMBER_NOT_FOUND"
  | "IDS_DO_NOT_MATCH"
  | "PARTNER_REQUIRED"
  | "PARTNER_NOT_FOUND"
  | "PARTNER_MISMATCH"
  | "ORDER_PRICING_CHANGED";

export class CheckoutContextError extends Error {
  readonly code: CheckoutContextCode;

  constructor(code: CheckoutContextCode, message: string) {
    super(message);
    this.name = "CheckoutContextError";
    this.code = code;
  }
}

/** Exactly what the browser is allowed to say. Ids, and nothing that is a number. */
export interface CheckoutIds {
  memberId: string;
  orderId: string;
  paymentId: string;
  subscriptionId: string;
  partnerMemberId?: string;
  partnerSubscriptionId?: string;
}

export interface CheckoutContext {
  order: { id: string; orderNumber: string; totalAmount: number };
  payment: { id: string };
  member: { id: string; firstName: string; lastName: string; email: string };
  /** The primary subscription row. A couple has a second one; see `partner`. */
  subscription: { id: string; membershipType: MembershipType; billingFrequency: BillingFrequency };
  /** Present for a couple, absent for a single. Required when the plan says couple. */
  partner: { memberId: string; subscriptionId: string } | null;
  /** From `order_items` — the quantity that was actually priced, not a request field. */
  pendantCount: number;
}

/** The only order states it is honest to send somebody to a payment page for. */
const CHARGEABLE_ORDER_STATUS = "pending";

/**
 * Load and cross-check every row this checkout touches.
 *
 * The reads are sequential rather than parallel on purpose: each one narrows what the next is
 * allowed to be, and a mismatch found early is a refusal that should not have fired four more
 * queries at the database on behalf of a request that is already wrong.
 */
export async function loadCheckoutContext(
  db: SupabaseClient,
  ids: CheckoutIds,
): Promise<CheckoutContext> {
  // ── the order ────────────────────────────────────────────────────────────
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, member_id, total_amount, status")
    .eq("id", ids.orderId)
    .maybeSingle();

  if (!order) {
    throw new CheckoutContextError("ORDER_NOT_FOUND", "That order does not exist.");
  }
  if (order.member_id !== ids.memberId) {
    throw new CheckoutContextError(
      "IDS_DO_NOT_MATCH",
      "The order belongs to a different member than the request names.",
    );
  }
  if (order.status !== CHARGEABLE_ORDER_STATUS) {
    // `confirmed` is the one that matters: it means the webhook already processed a payment for
    // this order, and creating a second session would charge the customer twice.
    throw new CheckoutContextError(
      "ORDER_NOT_PENDING",
      `This order is "${order.status}", not awaiting payment. Start a new registration rather ` +
        "than paying it again.",
    );
  }

  // ── the payment row the webhook will complete ────────────────────────────
  const { data: payment } = await db
    .from("payments")
    .select("id, order_id, member_id, subscription_id, status")
    .eq("id", ids.paymentId)
    .maybeSingle();

  if (!payment) {
    throw new CheckoutContextError("PAYMENT_NOT_FOUND", "That payment record does not exist.");
  }
  if (payment.order_id !== ids.orderId || payment.member_id !== ids.memberId) {
    throw new CheckoutContextError(
      "IDS_DO_NOT_MATCH",
      "The payment record does not belong to that order and member.",
    );
  }
  if (payment.status !== "pending") {
    throw new CheckoutContextError(
      "PAYMENT_NOT_PENDING",
      `That payment is already "${payment.status}".`,
    );
  }

  // ── the subscription: the source of WHAT is being sold ───────────────────
  // membershipType and billingFrequency are read from here, never from the request, because
  // they choose the recurring Stripe Price. A request that could name them could pick the
  // cheaper plan and be activated on the dearer one.
  const { data: subscription } = await db
    .from("subscriptions")
    .select("id, member_id, plan_type, billing_frequency, has_pendant, status")
    .eq("id", ids.subscriptionId)
    .maybeSingle();

  if (!subscription) {
    throw new CheckoutContextError(
      "SUBSCRIPTION_NOT_FOUND",
      "That subscription record does not exist.",
    );
  }
  if (subscription.member_id !== ids.memberId) {
    throw new CheckoutContextError(
      "IDS_DO_NOT_MATCH",
      "The subscription belongs to a different member than the request names.",
    );
  }
  if (subscription.status !== "pending") {
    throw new CheckoutContextError(
      "SUBSCRIPTION_NOT_PENDING",
      `That subscription is already "${subscription.status}". A change of plan is not a signup.`,
    );
  }

  // ── the partner, required exactly when the plan is a couple ──────────────
  let partner: CheckoutContext["partner"] = null;
  if (subscription.plan_type === "couple") {
    if (!ids.partnerMemberId || !ids.partnerSubscriptionId) {
      throw new CheckoutContextError(
        "PARTNER_REQUIRED",
        "This is a couple membership but the request names no partner member. Refusing to " +
          "charge for two people and activate one.",
      );
    }

    const { data: partnerSub } = await db
      .from("subscriptions")
      .select("id, member_id, plan_type, billing_frequency, status")
      .eq("id", ids.partnerSubscriptionId)
      .maybeSingle();

    if (!partnerSub) {
      throw new CheckoutContextError(
        "PARTNER_NOT_FOUND",
        "The partner's subscription record does not exist.",
      );
    }
    if (partnerSub.member_id !== ids.partnerMemberId) {
      throw new CheckoutContextError(
        "PARTNER_MISMATCH",
        "The partner's subscription belongs to a different member.",
      );
    }
    if (
      partnerSub.plan_type !== subscription.plan_type ||
      partnerSub.billing_frequency !== subscription.billing_frequency
    ) {
      throw new CheckoutContextError(
        "PARTNER_MISMATCH",
        "The two halves of this couple are on different plans.",
      );
    }
    if (partnerSub.status !== "pending") {
      throw new CheckoutContextError(
        "SUBSCRIPTION_NOT_PENDING",
        `The partner's subscription is already "${partnerSub.status}".`,
      );
    }

    const { data: partnerMember } = await db
      .from("members")
      .select("id")
      .eq("id", ids.partnerMemberId)
      .maybeSingle();
    if (!partnerMember) {
      throw new CheckoutContextError("PARTNER_NOT_FOUND", "The partner member does not exist.");
    }

    partner = { memberId: ids.partnerMemberId, subscriptionId: ids.partnerSubscriptionId };
  } else if (ids.partnerMemberId || ids.partnerSubscriptionId) {
    // A single membership with a partner attached is not a thing we sell, and silently
    // ignoring the extra ids would stamp them into metadata for the webhook to activate.
    throw new CheckoutContextError(
      "PARTNER_MISMATCH",
      "This is a single membership but the request names a partner member.",
    );
  }

  // ── the member: the payer and the receipt address ────────────────────────
  const { data: member } = await db
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("id", ids.memberId)
    .maybeSingle();

  if (!member?.email) {
    // No email means no receipt and no way to reach whoever just paid.
    throw new CheckoutContextError(
      "MEMBER_NOT_FOUND",
      "That member does not exist, or has no email address to send a receipt to.",
    );
  }

  // ── how many pendants were priced ────────────────────────────────────────
  // From `order_items`, which is what the order was costed from. `subscriptions.has_pendant` is
  // a boolean and cannot answer "one or two", so it is used only as a cross-check below.
  const { data: pendantItems } = await db
    .from("order_items")
    .select("quantity")
    .eq("order_id", ids.orderId)
    .eq("item_type", "pendant");

  const pendantCount = (pendantItems ?? []).reduce(
    (sum: number, row: { quantity: number | null }) => sum + (row.quantity ?? 0),
    0,
  );

  if (Boolean(subscription.has_pendant) !== pendantCount > 0) {
    // Two records of the same fact disagree. Charging either way would be charging a figure one
    // of our own screens contradicts.
    throw new CheckoutContextError(
      "IDS_DO_NOT_MATCH",
      `The subscription says has_pendant=${subscription.has_pendant} but the order has ` +
        `${pendantCount} pendant item(s).`,
    );
  }

  return {
    order: {
      id: order.id,
      orderNumber: order.order_number,
      totalAmount: Number(order.total_amount),
    },
    payment: { id: payment.id },
    member: {
      id: member.id,
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email,
    },
    subscription: {
      id: subscription.id,
      membershipType: subscription.plan_type as MembershipType,
      billingFrequency: subscription.billing_frequency as BillingFrequency,
    },
    partner,
    pendantCount,
  };
}

/**
 * The synced Prices must add up to the order the customer was shown.
 *
 * `resolveCheckoutLines` already cross-checks the Prices against `calculateOrder` — today's
 * arithmetic. This checks them against the order row — the arithmetic at the moment the
 * customer read a total off the summary screen. They differ when a price or the registration
 * fee discount is edited in the seconds between the two, and the honest response is to refuse:
 * the alternative is charging a card a number that appears on no screen anybody saw.
 */
export function assertChargeMatchesOrder(chargeCents: number, orderTotalAmount: number): void {
  const orderCents = Math.round(orderTotalAmount * 100);
  if (Math.abs(chargeCents - orderCents) > TOTAL_TOLERANCE_CENTS) {
    throw new CheckoutContextError(
      "ORDER_PRICING_CHANGED",
      `This order was recorded at ${(orderCents / 100).toFixed(2)} € but today's prices come ` +
        `to ${(chargeCents / 100).toFixed(2)} €. Prices changed while you were checking out — ` +
        "please start again so you can see what you are agreeing to.",
    );
  }
}

/**
 * The metadata the webhook reads to decide which rows to activate.
 *
 * Every value is a server-derived id. There is no spread of a request-supplied bag: the webhook
 * treats these keys as authority to flip `members.status` and `subscriptions.status`, so a
 * browser able to add a key is a browser able to activate a stranger.
 *
 * Empty strings rather than omitted keys for the couple fields, because Stripe metadata values
 * must be strings and the webhook distinguishes "no partner" from "partner" by emptiness.
 */
export function checkoutMetadata(context: CheckoutContext): Record<string, string> {
  return {
    member_id: context.member.id,
    order_id: context.order.id,
    payment_id: context.payment.id,
    subscription_id: context.subscription.id,
    partner_member_id: context.partner?.memberId ?? "",
    partner_subscription_id: context.partner?.subscriptionId ?? "",
    order_number: context.order.orderNumber,
    source: "join-wizard",
  };
}
