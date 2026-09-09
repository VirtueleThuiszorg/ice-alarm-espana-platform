/**
 * WHICH PAYMENT METHODS A CHECKOUT OFFERS — one setting, read in one place, used by both
 * functions that create a Stripe session.
 *
 * THE DEFECT. Neither `create-checkout` nor `send-payment-link` set `payment_method_types`, so
 * Stripe's DASHBOARD defaults decide — and those default to "whatever we think converts", which
 * in the EEA means SEPA Direct Debit is offered next to the card.
 *
 * SEPA IS ASYNCHRONOUS, AND THAT IS THE WHOLE PROBLEM. A SEPA checkout completes with
 * `checkout.session.completed` carrying `payment_status: "unpaid"` — the mandate is signed, the
 * money is days away, and it may never arrive. `stripe-webhook` is right to refuse to activate
 * on that (`isSessionPaid`), and activation then depends on
 * `checkout.session.async_payment_succeeded`, which has to be enabled on the webhook
 * destination. Lee could not find that event in the destination's picker.
 *
 * So today the platform can offer a payment method whose success event nobody is listening for:
 * THE CUSTOMER PAYS AND IS NEVER ACTIVATED, with no error anywhere — the webhook logs "waiting
 * for payment" and stops. Card only, until an admin confirms the destination is listening.
 *
 * A SETTING RATHER THAN A CONSTANT, because the fix on Lee's side is a checkbox in the Stripe
 * dashboard, and the moment he ticks it he should not need a deploy to turn SEPA on.
 */

/**
 * What Stripe accepts here, limited to what this business would plausibly offer.
 *
 * Not an open list: `payment_method_types` is passed straight to Stripe, and a typo produces a
 * 400 at checkout — the one moment where an error costs a sale. Anything not on this list is
 * dropped rather than forwarded.
 */
export const SUPPORTED_PAYMENT_METHODS = ["card", "sepa_debit", "bancontact", "ideal"] as const;
export type CheckoutPaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number];

/**
 * The methods that DO NOT settle at checkout time.
 *
 * Each one produces `payment_status: "unpaid"` on `checkout.session.completed` and needs
 * `checkout.session.async_payment_succeeded` to activate. Bancontact and iDEAL are usually
 * immediate, but both can fall back to a delayed flow, and "usually immediate" is not a
 * property to bet an activation on.
 */
export const ASYNC_PAYMENT_METHODS: readonly CheckoutPaymentMethod[] = [
  "sepa_debit",
  "bancontact",
  "ideal",
];

export const CHECKOUT_PAYMENT_METHODS_KEY = "checkout_payment_methods";
/**
 * The admin's acknowledgement that the webhook destination listens for the async events.
 *
 * Stored, not inferred: there is no API that tells us which events a destination subscribes to
 * without the dashboard's own credentials, so the honest thing is to ask, record who said yes,
 * and let the async methods be selectable only after that.
 */
export const ASYNC_EVENTS_CONFIRMED_KEY = "checkout_async_events_confirmed";

/** Card is always offered, and cannot be removed. A checkout with no methods is not a checkout. */
export const ALWAYS_OFFERED: CheckoutPaymentMethod = "card";

export function isSupportedPaymentMethod(value: string): value is CheckoutPaymentMethod {
  return (SUPPORTED_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isAsyncPaymentMethod(method: CheckoutPaymentMethod): boolean {
  return ASYNC_PAYMENT_METHODS.includes(method);
}

/**
 * Turn the stored setting into the array Stripe is given.
 *
 * DEFAULTS TO CARD, and falls back to card for anything it cannot read: an unset row, an empty
 * string, junk, or a list of names Stripe does not know. The failure mode being defended
 * against is a checkout that offers a method nobody is listening for, so every uncertain input
 * resolves to the one method that settles synchronously.
 *
 * `card` is always present and always first — Stripe renders them in order, and the method that
 * definitely works should not be second.
 */
export function parseCheckoutPaymentMethods(raw: string | null | undefined): CheckoutPaymentMethod[] {
  const requested = (raw ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .filter(isSupportedPaymentMethod);

  const methods = [ALWAYS_OFFERED, ...requested.filter((m) => m !== ALWAYS_OFFERED)];
  // De-duplicated: "card,card,sepa_debit" is a 400 from Stripe, and a saved setting can contain
  // anything a previous version of this screen wrote.
  return [...new Set(methods)];
}

/**
 * The gate the SETTINGS SCREEN applies, and the reason it shows.
 *
 * Kept here rather than in the component so the rule and the words are the same thing: a method
 * greyed out with no reason is a control somebody assumes is broken.
 */
export const ASYNC_BLOCKED_REASON =
  "webhook destination must listen to checkout.session.async_payment_succeeded/failed";

export function isMethodSelectable(
  method: CheckoutPaymentMethod,
  asyncEventsConfirmed: boolean,
): { selectable: boolean; reason?: string } {
  if (method === ALWAYS_OFFERED) return { selectable: true };
  if (!isAsyncPaymentMethod(method)) return { selectable: true };
  return asyncEventsConfirmed
    ? { selectable: true }
    : { selectable: false, reason: ASYNC_BLOCKED_REASON };
}

/**
 * What actually gets stored when somebody saves the checkboxes.
 *
 * The acknowledgement is applied HERE, not only in the UI: a stale browser tab, a replayed
 * request or a future caller must not be able to enable SEPA while the destination is deaf.
 * Anything unselectable is dropped, silently and safely, because the alternative is a customer
 * who pays and is never activated.
 */
export function normaliseSelection(
  selected: readonly string[],
  asyncEventsConfirmed: boolean,
): CheckoutPaymentMethod[] {
  const allowed = selected
    .filter(isSupportedPaymentMethod)
    .filter((method) => isMethodSelectable(method, asyncEventsConfirmed).selectable);
  return parseCheckoutPaymentMethods(allowed.join(","));
}

/** The minimal read. Structural so the loader is testable without a Supabase client. */
export interface SettingsReader {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: string[]): Promise<{ data: Array<{ key: string; value: string | null }> | null; error: unknown }>;
    };
  };
}

export interface CheckoutPaymentMethodSettings {
  methods: CheckoutPaymentMethod[];
  asyncEventsConfirmed: boolean;
}

/**
 * Read the setting, from the one place both functions call.
 *
 * A FAILED READ IS CARD, not a throw and not the stored value: this runs while somebody is
 * trying to pay, and the safe answer to "I cannot tell which methods are allowed" is the one
 * that settles synchronously and always activates.
 */
export async function loadCheckoutPaymentMethods(
  db: SettingsReader,
): Promise<CheckoutPaymentMethodSettings> {
  const { data, error } = await db
    .from("system_settings")
    .select("key, value")
    .in("key", [CHECKOUT_PAYMENT_METHODS_KEY, ASYNC_EVENTS_CONFIRMED_KEY]);

  if (error || !data) return { methods: [ALWAYS_OFFERED], asyncEventsConfirmed: false };

  const value = (key: string) => data.find((row) => row.key === key)?.value ?? null;
  const asyncEventsConfirmed = value(ASYNC_EVENTS_CONFIRMED_KEY) === "true";

  // The acknowledgement is re-applied on READ as well as on write. A row that says
  // "card,sepa_debit" while the confirmation has since been turned off must not keep offering
  // SEPA — the destination may have been changed in the Stripe dashboard since.
  return {
    methods: normaliseSelection(parseCheckoutPaymentMethods(value(CHECKOUT_PAYMENT_METHODS_KEY)), asyncEventsConfirmed),
    asyncEventsConfirmed,
  };
}
