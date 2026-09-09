/**
 * The decisions `stripe-webhook` makes, as pure functions.
 *
 * WHY THEY LIVE OUTSIDE THE FUNCTION. The webhook body runs inside `serve()`, so nothing in it
 * can be driven by a test; the whole of golden rule 4 ("a member is activated by the payment
 * webhook, never by client-side code") therefore rested on code no test could reach. Everything
 * below is a decision — is this paid, does the money match, what does this Stripe status mean,
 * when does this subscription renew — and each one is a defect the platform has actually had.
 *
 * PINNED AT STRIPE API 2024-06-20. That is the webhook DESTINATION's version, set in the Stripe
 * dashboard, and it decides the SHAPE of every event body — not the SDK version this function
 * happens to be built with. Two fields we depend on were moved in later versions:
 *
 *   invoice.subscription       top-level until 2025-03-31 ("basil"), where it became
 *                              invoice.parent.subscription_details.subscription
 *   subscription.current_period_end   moved onto the subscription's items in the same release
 *
 * If the destination is ever bumped, those reads become `undefined` and every one of them fails
 * SILENTLY — a renewal that never advances, a subscription row that never matches. So the
 * fields are declared here and checked at runtime (`missingEventFields`), and a missing one is
 * a loud refusal with a staff bell rather than a no-op.
 */

/** Stripe subscription statuses we have a `subscription_status` enum value for. */
const SUBSCRIPTION_STATUS_MAP: Record<string, string> = {
  active: "active",
  past_due: "past_due",
  canceled: "cancelled",
  unpaid: "suspended",
  paused: "paused",
};

/**
 * Our status for a Stripe status, or null when we have no equivalent.
 *
 * NULL IS THE POINT. The previous code was `statusMap[s] || s`, which wrote Stripe's own string
 * into a Postgres enum column. `incomplete`, `incomplete_expired` and `trialing` are all real
 * Stripe statuses and none of them is a `subscription_status` value, so the UPDATE failed — and
 * because its error was never checked, the webhook returned 200 and the row kept whatever it
 * had. Returning null lets the caller skip the write and say so.
 */
export function mapSubscriptionStatus(stripeStatus: string): string | null {
  return SUBSCRIPTION_STATUS_MAP[stripeStatus] ?? null;
}

/**
 * Whether a completed Checkout Session has actually been paid.
 *
 * `checkout.session.completed` DOES NOT MEAN PAID. For any asynchronous payment method — SEPA
 * Direct Debit above all, which is half of what this business sells on — the session completes
 * with `payment_status: "unpaid"` and the money arrives days later (or does not).
 * `checkout.session.async_payment_succeeded` is the event that means paid.
 *
 * The old handler activated the member on `completed` regardless, so a SEPA customer became an
 * active member of a life-safety service before their bank had moved a cent, and a later
 * failure left them active.
 */
export function isSessionPaid(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === "paid";
}

/** Cents difference tolerated between Stripe's total and our own. Money is exact; this is not a
 * rounding allowance for us, it is protection against a currency-unit mistake reading as equal. */
export const AMOUNT_TOLERANCE_CENTS = 0;

export interface AmountCheck {
  agrees: boolean;
  chargedCents: number;
  expectedCents: number;
}

/**
 * Did Stripe charge what we recorded as due?
 *
 * REVIEW_JOIN_PATH.md F9. Nothing ever compared the two, which is what turned F7 (the browser
 * naming its own price) from a bad shape into a live hole: a session created for one cent
 * completed, and the webhook activated a full member because money had genuinely arrived. The
 * comparison is only meaningful because `create-checkout` writes `payments.amount` server-side
 * from the synced Prices — comparing Stripe against a figure the browser supplied would compare
 * a lie to itself.
 *
 * `expectedAmount` is euros (a `decimal` column); `amountTotal` is cents, as Stripe sends it.
 */
export function checkAmount(
  amountTotal: number | null | undefined,
  expectedAmount: number | null | undefined,
): AmountCheck {
  const chargedCents = Math.round(Number(amountTotal ?? 0));
  const expectedCents = Math.round(Number(expectedAmount ?? 0) * 100);
  return {
    agrees:
      expectedCents > 0 && Math.abs(chargedCents - expectedCents) <= AMOUNT_TOLERANCE_CENTS,
    chargedCents,
    expectedCents,
  };
}

/**
 * The fields each event kind must carry at API 2024-06-20, as dotted paths.
 *
 * Only fields whose ABSENCE WOULD BE SILENT are listed. `metadata.partner_member_id` is not
 * here, for instance: a single membership legitimately has none, and the couple case is already
 * refused at `create-checkout`.
 */
export const REQUIRED_EVENT_FIELDS: Record<string, string[]> = {
  "checkout.session.completed": [
    "id",
    "payment_status",
    "amount_total",
    "metadata.order_id",
    "metadata.payment_id",
    "metadata.member_id",
    "metadata.subscription_id",
  ],
  "checkout.session.async_payment_succeeded": [
    "id",
    "payment_status",
    "amount_total",
    "metadata.order_id",
    "metadata.payment_id",
    "metadata.member_id",
    "metadata.subscription_id",
  ],
  // `subscription` and `payment_intent` are the two that move in later API versions.
  "invoice.paid": ["id", "subscription", "amount_paid"],
  "invoice.payment_failed": ["id", "subscription"],
  "customer.subscription.updated": ["id", "status"],
  "customer.subscription.deleted": ["id"],
  "payment_intent.succeeded": ["id"],
  "payment_intent.payment_failed": ["id"],
};

function atPath(object: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined,
      object,
    );
}

/**
 * Which required fields this event body is missing.
 *
 * An empty string counts as missing: Stripe metadata values are strings, and
 * `checkoutMetadata()` writes "" for "no partner", so a blank `order_id` is a real absence
 * rather than a value.
 */
export function missingEventFields(eventType: string, object: unknown): string[] {
  const required = REQUIRED_EVENT_FIELDS[eventType];
  if (!required) return [];
  return required.filter((path) => {
    const value = atPath(object, path);
    return value === undefined || value === null || value === "";
  });
}

/**
 * When the subscription this invoice paid for renews next.
 *
 * PREFERRED SOURCE is the invoice line's own period end — Stripe's answer, and the one the
 * customer's next charge will actually follow. Present in every API version, on the line rather
 * than the invoice, which is why it is read from there and not from
 * `subscription.current_period_end` (moved in 2025-03-31).
 *
 * THE FALLBACK IS NOT A CONVENIENCE. A `renewal_date` left at the old value makes a paying
 * member read as overdue on every screen that compares it to today — the Membership page, the
 * attention queue, the arrears list. Doing nothing is therefore worse than computing it from
 * the billing frequency, so if Stripe's period end is missing we compute one and the caller
 * records which source was used.
 */
export function renewalDateFrom(
  invoice: unknown,
  billingFrequency: "monthly" | "annual",
  now: Date = new Date(),
): { date: string; source: "stripe_period_end" | "computed" } {
  const periodEnd = atPath(invoice, "lines.data.0.period.end");
  if (typeof periodEnd === "number" && Number.isFinite(periodEnd) && periodEnd > 0) {
    return { date: new Date(periodEnd * 1000).toISOString().slice(0, 10), source: "stripe_period_end" };
  }

  const next = new Date(now.getTime());
  if (billingFrequency === "annual") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return { date: next.toISOString().slice(0, 10), source: "computed" };
}

/**
 * Whether this invoice is the FIRST one of a new subscription.
 *
 * `invoice.paid` fires for it, moments after `checkout.session.completed` has already recorded
 * that payment through `handleSuccessfulPayment`. Treating it as a renewal inserts a SECOND
 * completed `payments` row for one charge, which double-counts every signup in revenue and in
 * the sales pill.
 */
export function isFirstInvoice(billingReason: string | null | undefined): boolean {
  return billingReason === "subscription_create";
}
