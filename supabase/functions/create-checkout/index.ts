import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
import { checkoutSchema, validateRequest } from "../_shared/validation.ts";
import {
  PriceResolutionError,
  resolveCheckoutLines,
  toStripeLineItems,
} from "../_shared/checkout-lines.ts";
import { loadPricingInputs, PricingNotConfiguredError } from "../_shared/checkout-pricing.ts";
import {
  assertChargeMatchesOrder,
  checkoutMetadata,
  CheckoutContextError,
  loadCheckoutContext,
} from "../_shared/checkout-order.ts";

/**
 * create-checkout — the join wizard's Pay button, rebuilt so the customer is charged what our
 * own tables say the order costs.
 *
 * WHAT IT USED TO DO (REVIEW_JOIN_PATH.md F7 + F9). It read `lineItems` out of the request
 * body, multiplied each `amount` by 100, and handed the result to Stripe as `price_data`. The
 * browser named the price; nothing server-side ever compared it to the order being paid. One
 * edited number bought a membership for a cent, and `stripe-webhook` then activated the member
 * because money had genuinely arrived. It also took `successUrl` and `cancelUrl` from the
 * request (an open redirect on a payment page) and spread a request-supplied `metadata` bag
 * into the session — the same metadata the webhook trusts to choose which rows to activate.
 *
 * WHAT IT DOES NOW. The request carries FOUR ids and, for a couple, two more. Everything else
 * is read back out of the database:
 *
 *   what is being sold   `subscriptions.plan_type` / `billing_frequency` — not a request field,
 *                        because a request that could name the plan could buy the cheap one and
 *                        be activated on the dear one.
 *   how many pendants    `order_items` — the quantity the order was actually costed from.
 *   what it costs        synced Stripe Price ids from `stripe_prices`, via
 *                        `_shared/checkout-lines.ts` — the SAME module `send-payment-link`
 *                        uses. One implementation, not two.
 *   who is charged       the member row's email.
 *   where they land      `PUBLIC_SITE_URL`, built here.
 *   metadata             `checkoutMetadata()`, from the verified context.
 *
 * `mode: "subscription"`, not `mode: "payment"` (P1). The membership renews; the pendant,
 * shipping and the registration fee are one-off items added to the first invoice. A
 * `mode: "payment"` session took the first month's money and then nothing ever again —
 * `subscriptions.stripe_subscription_id` had no subscription to hold, so no renewal existed to
 * fail. This is also why there is no `payment_intent_data` block: Stripe rejects it in
 * subscription mode, and the webhook reads its ids from the session and subscription metadata
 * stamped below.
 *
 * A COUPLE IS ONE HOUSEHOLD SUBSCRIPTION. One recurring line, one Stripe subscription, pendant
 * quantity 2, shipping charged once. The two `subscriptions` rows the SQL function creates are
 * both activated by the webhook against that one Stripe id; whether the schema should collapse
 * them to a single household row is a data-model decision recorded in REVIEW_JOIN_PATH.md, not
 * one taken here.
 *
 * GOLDEN RULE 4 HOLDS. Nothing here activates anything. It creates a Stripe session against
 * rows that are already `pending` and stops.
 */

/** Redirects are built HERE, never taken from the request. */
const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://icealarm.es").replace(/\/+$/, "");

/**
 * 24 hours. The join wizard sends the customer straight to Stripe, so a session that outlives
 * the prices it was built from is a charge nobody can reconcile; `send-payment-link` allows 72
 * because a family needs time to talk over a link that arrived by email.
 */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const { allowed } = checkRateLimit(getClientIp(req), 10, 60_000);
  if (!allowed) return json(429, { error: "Too many requests" });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rawBody = await req.json().catch(() => null);
    const validated = validateRequest(checkoutSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;
    const body = validated.data;

    // ── the rows this checkout is allowed to charge for ──────────────────────
    let context;
    try {
      context = await loadCheckoutContext(supabase, body);
    } catch (e) {
      if (e instanceof CheckoutContextError) {
        // 409, not 400: the request is well-formed, the state it describes is not chargeable.
        return json(409, { error: e.message, code: e.code });
      }
      throw e;
    }

    // ── the money, from our tables only ──────────────────────────────────────
    let pricing;
    try {
      pricing = await loadPricingInputs(supabase);
    } catch (e) {
      if (e instanceof PricingNotConfiguredError) {
        return json(503, { error: e.message, code: e.code });
      }
      throw e;
    }

    let resolved;
    try {
      resolved = resolveCheckoutLines(
        {
          membershipType: context.subscription.membershipType,
          billingFrequency: context.subscription.billingFrequency,
          pendantCount: context.pendantCount,
          // Shipping is charged ONCE per order, however many pendants (P3).
          includeShipping: context.pendantCount > 0,
          registrationFeeEnabled: pricing.registrationFeeEnabled,
          registrationFeeDiscount: pricing.registrationFeeDiscount,
        },
        pricing.prices,
        pricing.config,
      );
    } catch (e) {
      if (e instanceof PriceResolutionError) {
        return json(409, { error: e.message, code: e.code, priceKeys: e.priceKeys });
      }
      throw e;
    }

    // The Prices must also agree with the total this customer read off the summary screen.
    try {
      assertChargeMatchesOrder(resolved.totalCents, context.order.totalAmount);
    } catch (e) {
      if (e instanceof CheckoutContextError) {
        return json(409, { error: e.message, code: e.code });
      }
      throw e;
    }

    // ── Stripe ───────────────────────────────────────────────────────────────
    const { data: keyRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_stripe_secret_key")
      .maybeSingle();

    if (!keyRow?.value) {
      return json(503, {
        error: "Stripe is not configured. Please contact support.",
        code: "STRIPE_NOT_CONFIGURED",
      });
    }

    const stripe = new Stripe(keyRow.value, { apiVersion: "2023-10-16" });

    const metadata = checkoutMetadata(context);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: toStripeLineItems(resolved.lines) as never,
      customer_email: context.member.email,
      success_url:
        `${SITE_URL}/join?success=true&order=${encodeURIComponent(context.order.orderNumber)}`,
      cancel_url: `${SITE_URL}/join?cancelled=true`,
      billing_address_collection: "required",
      metadata,
      // The subscription Stripe creates carries the same ids, so `customer.subscription.*` and
      // `invoice.*` events are attributable without a lookup.
      subscription_data: { metadata },
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    });

    if (!session.url) {
      return json(502, { error: "Stripe returned a session with no URL", code: "NO_SESSION_URL" });
    }

    // ── what the webhook will check the arriving money against ───────────────
    // `payments.amount` is written HERE, server-side, from the resolved Prices. The webhook
    // compares Stripe's `amount_total` to it and refuses to activate on a mismatch, which is
    // only worth anything because this number never passed through a browser.
    await supabase
      .from("payments")
      .update({
        amount: Number((resolved.totalCents / 100).toFixed(2)),
        stripe_payment_id: session.id,
        notes: `Stripe Checkout Session: ${session.id}`,
      })
      .eq("id", context.payment.id);

    // Order number, not the customer's email: no PII in logs (CLAUDE.md).
    console.log(`Checkout session ${session.id} created for order ${context.order.orderNumber}`);

    return json(200, {
      sessionId: session.id,
      url: session.url,
      expiresAt: session.expires_at,
      orderNumber: context.order.orderNumber,
      totalEuros: resolved.totalCents / 100,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
