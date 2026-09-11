import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

import { getCorsHeaders } from "../_shared/cors.ts";
/*
  EVERY DECISION IS IN `_shared/stripe-webhook-handlers.ts`, and that is not tidying.

  This file calls `serve()` at import time and its handlers were file-private, so nothing about
  them could be RUN — every test was a source scan asserting that a line was written. "Proven,
  not claimed" (CLAUDE.md §16) was not achievable for the one path that decides whether an
  elderly member is billed by us, by their bank, or by nobody.

  What is left here is exactly what needs Deno and an HTTP request: the Stripe signature check,
  the `webhook_events` claim-and-stamp that makes a retry safe, and `serve()`.
*/
import { handleEvent } from "../_shared/stripe-webhook-handlers.ts";
/* Passed INTO the handlers rather than imported by them: `post-payment.ts` reaches
   `npm:nodemailer`, which no test runner can resolve. See WebhookDeps. */
import { handleSuccessfulPayment } from "../_shared/post-payment.ts";

/**
 * stripe-webhook — the only thing on this platform allowed to activate a member (golden rule 4).
 *
 * FIVE DEFECTS IT USED TO HAVE, each of which failed silently:
 *
 * 1. THE EVENT WAS RECORDED BEFORE IT WAS PROCESSED. The idempotency row went in immediately,
 *    then processing ran. If anything threw — a device lookup, an email, a bad enum — the
 *    function 500ed, Stripe retried, and the retry saw the row and returned "duplicate,
 *    skipping". The money had arrived and the member was never activated, and the retry that
 *    existed to fix exactly that was the thing that guaranteed it could not. The row is now
 *    written with `processed_at: null` and stamped only after the handler returns, and only a
 *    row that HAS been stamped counts as a duplicate.
 *
 * 2. `checkout.session.completed` WAS TREATED AS "PAID". It is not: for SEPA Direct Debit —
 *    half of what this business sells on — the session completes `unpaid` and the money moves
 *    days later, or fails. Members became active on a life-safety service before their bank
 *    had moved a cent. `payment_status === "paid"` is now required, and
 *    `checkout.session.async_payment_succeeded` is handled as the event that means paid.
 *
 *    AND ITS TWIN, `checkout.session.async_payment_failed`, is handled as the event that means
 *    the debit BOUNCED — which it was not, until a legacy member's switch could hang on it. A
 *    member mid-switch is out of the Santander export; a bounce that nothing handled left them
 *    billed by nobody until the 14-day lapse sweep found them.
 *
 * 3. NOTHING COMPARED THE MONEY (REVIEW_JOIN_PATH.md F9). Whatever Stripe said had been paid
 *    was accepted, which is what made F7 — the browser naming its own price — a live hole
 *    rather than merely a bad shape: a session for one cent completed and a full member was
 *    activated. `amount_total` is now compared to `payments.amount`, written server-side by
 *    `create-checkout` from synced Prices, and a mismatch REFUSES activation, logs loudly and
 *    bells the admins.
 *
 * 4. SUBSCRIPTIONS WERE ACTIVATED BY MEMBER, NOT BY ID: `.eq("member_id", memberId)`. Every
 *    subscription row that member had ever had was set `active` and given this Stripe id —
 *    including a cancelled one, resurrected. Activation is now by primary key.
 *
 * 5. NO WRITE'S ERROR WAS EVER CHECKED, and `statusMap[s] || s` wrote Stripe's own strings into
 *    a Postgres enum. `incomplete`, `incomplete_expired` and `trialing` are all real Stripe
 *    statuses and none is a `subscription_status`, so those updates failed, the error was
 *    discarded, and the webhook answered 200.
 *
 * PINNED AT STRIPE API 2024-06-20 (the destination's version, set in the Stripe dashboard).
 * Fields whose absence would be silent are declared in `_shared/stripe-events.ts` and checked
 * on arrival; `invoice.subscription` and `subscription.current_period_end` both move in later
 * versions, so a bumped destination is a loud refusal here rather than a renewal that quietly
 * stops advancing.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never touches `members.status` on a payment FAILURE.
 * A failed renewal makes a subscription `past_due` and bells an admin; monitoring continues
 * (P4). Someone whose card expired is still someone who may press an SOS button tonight.
 */

type Json = Record<string, unknown>;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, "stripe-signature");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, payload: Json) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: stripeSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_stripe_secret_key")
      .maybeSingle();

    if (!stripeSettings?.value) {
      console.error("Stripe secret key not configured");
      return json(500, { error: "Stripe not configured" });
    }

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    if (!signature) {
      return json(400, { error: "Missing stripe-signature header" });
    }

    const { data: webhookSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_stripe_webhook_secret")
      .maybeSingle();

    if (!webhookSettings?.value) {
      console.error("Stripe webhook secret not configured in system_settings");
      return json(500, { error: "Webhook secret not configured" });
    }

    const stripe = new Stripe(stripeSettings.value, { apiVersion: "2023-10-16" });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSettings.value);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown verification error";
      console.error("Webhook signature verification failed:", message);
      return json(400, { error: `Webhook signature verification failed: ${message}` });
    }

    console.log("Stripe webhook verified:", event.type, event.id);

    // ── idempotency: claimed on arrival, stamped only on success ─────────────
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id, processed_at")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent?.processed_at) {
      console.log("Duplicate webhook event, already processed:", event.id);
      return json(200, { received: true, duplicate: true });
    }

    if (!existingEvent) {
      // Explicit null: the column DEFAULTS to now(), which is what made the old code record
      // an event as processed the moment it was received.
      const { error: claimError } = await supabase.from("webhook_events").insert({
        event_id: event.id,
        provider: "stripe",
        event_type: event.type,
        processed_at: null,
      });
      // A unique-violation here means a concurrent delivery of the same event claimed it first.
      // Letting this one continue is safe — every handler below is idempotent in its own right
      // (activation by id to a fixed state, `isFirstInvoice` skipping the signup invoice) — and
      // is strictly better than dropping an event because two deliveries raced.
      if (claimError) console.warn("webhook_events claim failed (continuing):", claimError.message);
    } else {
      // A row with no `processed_at` is a previous attempt that died part-way through. Stripe
      // is retrying it; that is exactly what should happen, so fall through and reprocess.
      console.log("Re-processing a previously unfinished event:", event.id);
    }

    const outcome = await handleEvent(supabase, event, { postPayment: handleSuccessfulPayment });

    // Stamped only now. If `handleEvent` threw, we never get here, the row keeps a null
    // `processed_at`, and Stripe's next retry is allowed to try again.
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);

    return json(200, { received: true, ...outcome });
  } catch (error) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    // 500 on purpose: it leaves `processed_at` null so Stripe retries.
    return json(500, { error: message });
  }
});
