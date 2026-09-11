import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

import { getCorsHeaders } from "../_shared/cors.ts";
import { handleSuccessfulPayment } from "../_shared/post-payment.ts";
import { notifyAdmins } from "../_shared/staff-bell.ts";
import {
  failureStage,
  memberFailureSms,
  staffFailureMessage,
} from "../_shared/payment-retry.ts";
import {
  checkAmount,
  isFirstInvoice,
  isSessionPaid,
  mapSubscriptionStatus,
  missingEventFields,
  renewalDateFrom,
} from "../_shared/stripe-events.ts";

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

    const outcome = await handleEvent(supabase, stripe, event);

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

/**
 * Everything that depends on the event body. Separated from transport and idempotency so the
 * one thing that matters — did the money arrive, and what did we do about it — reads in one
 * piece, and so a throw from here cannot be mistaken for a signature problem.
 */
async function handleEvent(
  supabase: ReturnType<typeof createClient>,
  _stripe: Stripe,
  event: Stripe.Event,
): Promise<Json> {
  const object = event.data.object as unknown as Record<string, unknown>;

  // ── the API-version contract ─────────────────────────────────────────────
  const missing = missingEventFields(event.type, object);
  if (missing.length > 0) {
    // Loud, and bell: this is either a bumped destination API version or an event created by
    // something that did not stamp our metadata. Both need a person, and neither is fixed by
    // a retry, so it is recorded as handled rather than left to retry for three days.
    console.error(
      `REFUSED ${event.type} (${event.id}): missing required field(s) ${missing.join(", ")}. ` +
        "The webhook destination must be pinned at Stripe API 2024-06-20.",
    );
    const bell = await notifyAdmins(supabase, {
      eventType: "system",
      message:
        `A Stripe ${event.type} event was refused: it is missing ${missing.join(", ")}. ` +
        "Check the webhook destination is on API version 2024-06-20.",
      entityType: "order",
    });
    return { refused: "MISSING_FIELDS", missing, adminsNotified: bell.notified };
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return await onCheckoutSession(supabase, event, object as unknown as Stripe.Checkout.Session);

    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
      return await onPaymentIntent(supabase, event, object as unknown as Stripe.PaymentIntent);

    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return await onSubscriptionChange(supabase, event, object as unknown as Stripe.Subscription);

    case "invoice.paid":
      return await onInvoicePaid(supabase, object as unknown as Stripe.Invoice);

    case "invoice.payment_failed":
      return await onInvoiceFailed(supabase, object as unknown as Stripe.Invoice);

    default:
      console.log("Unhandled event type:", event.type);
      return { handled: false };
  }
}

/**
 * The signup charge: the one place a member is activated.
 */
async function onCheckoutSession(
  supabase: ReturnType<typeof createClient>,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<Json> {
  const metadata = session.metadata ?? {};
  const orderId = metadata.order_id!;
  const paymentId = metadata.payment_id!;
  const memberId = metadata.member_id!;
  const subscriptionId = metadata.subscription_id!;
  const partnerMemberId = metadata.partner_member_id || undefined;
  const partnerSubscriptionId = metadata.partner_subscription_id || undefined;

  // ── has it actually been paid? ───────────────────────────────────────────
  if (!isSessionPaid(session.payment_status)) {
    // Not an error and not a refusal: an asynchronous method (SEPA) completes the session
    // first and pays later. `checkout.session.async_payment_succeeded` brings us back here.
    console.log(
      `${event.type} ${session.id} is payment_status="${session.payment_status}" — waiting for ` +
        "the money before activating anything.",
    );
    return { activated: false, awaitingPayment: true, paymentStatus: session.payment_status };
  }

  // ── does the money match what we recorded as due? ────────────────────────
  const { data: payment } = await supabase
    .from("payments")
    .select("id, amount")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    console.error(`REFUSED ${event.type} (${session.id}): payment row ${paymentId} not found.`);
    const bell = await notifyAdmins(supabase, {
      eventType: "system",
      message:
        `Stripe reported a paid checkout for order ${metadata.order_number ?? orderId} but the ` +
        "payment record it names does not exist. Nobody has been activated.",
      entityType: "order",
      entityId: orderId,
    });
    return { activated: false, refused: "PAYMENT_ROW_MISSING", adminsNotified: bell.notified };
  }

  const amounts = checkAmount(session.amount_total, payment.amount as number);
  if (!amounts.agrees) {
    console.error(
      `REFUSED ${event.type} (${session.id}): Stripe charged ${amounts.chargedCents} cents but ` +
        `payments.amount says ${amounts.expectedCents}. NOT activating.`,
    );
    const bell = await notifyAdmins(supabase, {
      eventType: "system",
      message:
        `Payment mismatch on order ${metadata.order_number ?? orderId}: Stripe took ` +
        `${(amounts.chargedCents / 100).toFixed(2)} € but the order says ` +
        `${(amounts.expectedCents / 100).toFixed(2)} €. The member has NOT been activated — ` +
        "check the order before refunding or activating by hand.",
      entityType: "order",
      entityId: orderId,
    });
    // Recorded as handled: a retry would reach the same conclusion, and Stripe retrying for
    // three days would not tell anybody anything the bell has not already said.
    return {
      activated: false,
      refused: "AMOUNT_MISMATCH",
      chargedCents: amounts.chargedCents,
      expectedCents: amounts.expectedCents,
      adminsNotified: bell.notified,
    };
  }

  // ── activate the subscription row(s) BY ID ───────────────────────────────
  const stripeFields = {
    stripe_subscription_id: session.subscription as string | null,
    stripe_customer_id: session.customer as string | null,
    status: "active",
    // The registration fee is part of this first charge, so it is paid the moment this is.
    registration_fee_paid: true,
  };

  // A couple is ONE household subscription in Stripe: both rows carry the same
  // `stripe_subscription_id`, because one subscription is what was actually created.
  const subscriptionIds = [subscriptionId, ...(partnerSubscriptionId ? [partnerSubscriptionId] : [])];
  const activatedSubscriptions: string[] = [];

  for (const id of subscriptionIds) {
    const { data: updated, error } = await supabase
      .from("subscriptions")
      .update(stripeFields)
      .eq("id", id)
      .select("id");

    if (error) {
      // Checked, unlike before. Money has arrived, so we do not abort — but a subscription
      // that failed to activate is exactly the thing nobody notices for a month.
      console.error(`Failed to activate subscription ${id}:`, error.message);
    } else if (!updated || updated.length === 0) {
      console.error(`Subscription ${id} matched no row — it was not activated.`);
    } else {
      activatedSubscriptions.push(id);
    }
  }

  if (activatedSubscriptions.length !== subscriptionIds.length) {
    await notifyAdmins(supabase, {
      eventType: "system",
      message:
        `Order ${metadata.order_number ?? orderId} was paid but ` +
        `${subscriptionIds.length - activatedSubscriptions.length} of ${subscriptionIds.length} ` +
        "subscription record(s) did not activate. Check the member's subscription before the " +
        "next renewal.",
      entityType: "subscription",
      entityId: subscriptionId,
    });
  }

  // ── the rest: order, payment, member(s), fulfilment, devices, welcome ────
  await handleSuccessfulPayment(supabase, {
    orderId,
    paymentId,
    memberId,
    subscriptionId,
    partnerMemberId,
    partnerSubscriptionId,
    amountPaid: amounts.chargedCents / 100,
    gatewayPaymentId: (session.payment_intent as string | null) ?? session.id,
    gateway: "stripe",
  });

  return {
    activated: true,
    activatedSubscriptions,
    amountPaidCents: amounts.chargedCents,
  };
}

/**
 * PaymentIntent events, looked up by the id we actually store.
 *
 * `create-checkout` writes the SESSION id into `payments.stripe_payment_id`, and
 * `handleSuccessfulPayment` later overwrites it with the PaymentIntent id. So a PaymentIntent
 * event can legitimately match nothing yet, and the old code's blind update said the same thing
 * whether it updated a row or none at all. Now the match is counted, and a FAILURE that matched
 * nothing is reported — money failing with no row to record it against is worse than either.
 */
async function onPaymentIntent(
  supabase: ReturnType<typeof createClient>,
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent,
): Promise<Json> {
  const failed = event.type === "payment_intent.payment_failed";

  const { data: matched, error } = await supabase
    .from("payments")
    .update(
      failed
        ? { status: "failed", notes: paymentIntent.last_payment_error?.message ?? "Payment failed" }
        : { status: "completed", paid_at: new Date().toISOString() },
    )
    .eq("stripe_payment_id", paymentIntent.id)
    .select("id");

  if (error) {
    console.error(`Failed to record ${event.type} for ${paymentIntent.id}:`, error.message);
    return { handled: false, error: error.message };
  }

  const count = matched?.length ?? 0;
  if (count === 0) {
    if (failed) {
      console.error(
        `${event.type} ${paymentIntent.id} matched no payment row — a failed payment with ` +
          "nothing to record it against.",
      );
      const bell = await notifyAdmins(supabase, {
        eventType: "system",
        message:
          "A Stripe payment failed but no payment record matched it. Check Stripe for " +
          `payment intent ${paymentIntent.id}.`,
        entityType: "order",
      });
      return { handled: true, matched: 0, adminsNotified: bell.notified };
    }
    // A success that matches nothing is ordinary: the session-completed handler owns the
    // signup charge and has already recorded it.
    console.log(`${event.type} ${paymentIntent.id} matched no payment row (already recorded).`);
  }

  return { handled: true, matched: count };
}

/** Subscription lifecycle. Only statuses we have an enum value for are written. */
async function onSubscriptionChange(
  supabase: ReturnType<typeof createClient>,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
): Promise<Json> {
  const status =
    event.type === "customer.subscription.deleted"
      ? "cancelled"
      : mapSubscriptionStatus(subscription.status);

  if (!status) {
    // `incomplete`, `incomplete_expired`, `trialing` — real Stripe statuses with no
    // `subscription_status` equivalent. Writing them failed and the error was thrown away.
    console.log(
      `Ignoring customer.subscription.updated for ${subscription.id}: Stripe status ` +
        `"${subscription.status}" has no subscription_status equivalent.`,
    );
    return { handled: false, stripeStatus: subscription.status };
  }

  const { data: matched, error } = await supabase
    .from("subscriptions")
    .update({ status })
    .eq("stripe_subscription_id", subscription.id)
    .select("id");

  if (error) {
    console.error(`Failed to set subscription ${subscription.id} to ${status}:`, error.message);
    return { handled: false, error: error.message };
  }

  const count = matched?.length ?? 0;
  if (count === 0) {
    console.error(
      `${event.type} for ${subscription.id} matched no subscription row — our records do not ` +
        "know about this Stripe subscription.",
    );
  }

  // ── somebody cancelled: tell a human ────────────────────────────────────
  //
  // WIRING_REGISTER's absence row A3: "`stripe-webhook` sets `status = 'cancelled'` and
  // returns. Nothing is written anywhere a human is required to look." A cancellation is the
  // single most important number in this business, `isabella_settings` has a
  // `cancellation_alert` switch that promised exactly this, and the only surface it reached was
  // a status badge on a page somebody would have to already be looking at.
  //
  // Only on `deleted`, not on every `updated`: Stripe sends `customer.subscription.updated` for
  // routine things — a price change, a payment-method swap, a period rolling over — and an
  // admin who gets a bell for each stops reading them.
  if (event.type === "customer.subscription.deleted") {
    const bell = await notifyAdmins(supabase, {
      eventType: "system",
      message:
        "A membership was cancelled at Stripe. The subscription is now marked cancelled — " +
        "check whether the member meant to leave, and whether their device needs collecting.",
      entityType: "subscription",
      entityId: matched?.[0]?.id,
    });
    return { handled: true, status, matched: count, adminsNotified: bell.notified };
  }

  return { handled: true, status, matched: count };
}

/**
 * A renewal was paid: record it and move the renewal date.
 *
 * Skips the signup invoice. `invoice.paid` fires for it moments after
 * `checkout.session.completed` has recorded that same charge, and treating it as a renewal
 * inserts a SECOND completed payment for one payment — double-counting every signup in revenue
 * and in the admin sales pill.
 */
async function onInvoicePaid(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice,
): Promise<Json> {
  if (isFirstInvoice(invoice.billing_reason)) {
    console.log(`invoice.paid ${invoice.id} is the signup invoice — already recorded.`);
    return { handled: true, skipped: "subscription_create" };
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, member_id, billing_frequency, status")
    .eq("stripe_subscription_id", invoice.subscription as string)
    .maybeSingle();

  if (!sub) {
    console.error(
      `invoice.paid ${invoice.id}: no subscription matches ${invoice.subscription}. The renewal ` +
        "is not recorded.",
    );
    const bell = await notifyAdmins(supabase, {
      eventType: "system",
      message:
        "A Stripe renewal was paid but no subscription record matches it. Check Stripe " +
        `subscription ${invoice.subscription}.`,
      entityType: "subscription",
    });
    return { handled: false, refused: "SUBSCRIPTION_NOT_FOUND", adminsNotified: bell.notified };
  }

  const { error: paymentError } = await supabase.from("payments").insert({
    member_id: sub.member_id,
    subscription_id: sub.id,
    amount: (invoice.amount_paid ?? 0) / 100,
    payment_type: "subscription",
    payment_method: "stripe",
    status: "completed",
    stripe_payment_id: (invoice.payment_intent as string | null) ?? invoice.id,
    invoice_number: invoice.number,
    paid_at: new Date().toISOString(),
  });
  if (paymentError) console.error(`Failed to record renewal payment:`, paymentError.message);

  const renewal = renewalDateFrom(invoice, sub.billing_frequency as "monthly" | "annual");

  // A paid invoice cures `past_due`: the member is up to date again, and leaving the row
  // past_due would keep them on the attention queue for a bill they have paid.
  const { error: subError } = await supabase
    .from("subscriptions")
    .update({ renewal_date: renewal.date, status: "active" })
    .eq("id", sub.id);
  if (subError) console.error(`Failed to advance renewal_date:`, subError.message);

  console.log(
    `Renewal recorded for subscription ${sub.id}; renewal_date → ${renewal.date} ` +
      `(${renewal.source}).`,
  );

  return {
    handled: true,
    subscriptionId: sub.id,
    renewalDate: renewal.date,
    renewalSource: renewal.source,
    paymentRecorded: !paymentError,
  };
}

/**
 * A renewal failed.
 *
 * MONITORING CONTINUES (P4). This marks the subscription `past_due` and tells an admin. It does
 * NOT touch `members.status`, and it must never learn to: somebody whose card expired is still
 * somebody who may press an SOS button tonight, and this is a life-safety product. Chasing the
 * money is a person's job, and item 8 puts these rows on the admin attention queue.
 */
async function onInvoiceFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice,
): Promise<Json> {
  /*
    PAST_DUE ON THE FIRST FAILURE, AND THE SERVICE STAYS UP. P4 settled this: a member whose
    payment bounced is still a member, and an operator still answers their alarm. Nothing below
    suspends anything.
  */
  const { data: matched, error } = await supabase
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", invoice.subscription as string)
    .select("id, member_id");

  if (error) {
    console.error(`Failed to mark subscription past_due for ${invoice.subscription}:`, error.message);
    return { handled: false, error: error.message };
  }

  if (!matched || matched.length === 0) {
    console.error(
      `invoice.payment_failed ${invoice.id}: no subscription matches ${invoice.subscription}.`,
    );
  }

  /*
    WHICH FAILURE THIS IS. `invoice.payment_failed` fires on EVERY attempt; Stripe's smart
    retries then try again over the following days, and most direct-debit failures clear on
    their own — a balance short on the 15th is not short on the 18th.

      retrying   Stripe will try again. Say nothing to the member.
      exhausted  Stripe has stopped. This is the first moment the failure is real.

    Texting on the first failure would mean texting several hundred elderly people about a
    problem that fixes itself, in a message that arrives from the company holding their
    emergency button.
  */
  const stage = failureStage({
    next_payment_attempt: invoice.next_payment_attempt,
    attempt_count: invoice.attempt_count,
    number: invoice.number,
    amount_due: invoice.amount_due,
  });

  const memberId = matched?.[0]?.member_id as string | undefined;
  const { data: member } = memberId
    ? await supabase
        .from("members")
        .select("first_name, last_name, phone, preferred_language")
        .eq("id", memberId)
        .maybeSingle()
    : { data: null };

  const memberName = member ? `${member.first_name} ${member.last_name}` : "A member";

  /*
    THE BELL: on the FIRST failure and at exhaustion, and silent for the attempts in between.
    One bell per retry, over 431 members, is a bell nobody reads — and a staff surface nobody
    reads is the failure mode this platform keeps finding. The first tells them it happened; the
    last tells them to pick up the phone.
  */
  const firstAttempt = (invoice.attempt_count ?? 1) <= 1;
  let notified = 0;
  if (stage === "exhausted" || firstAttempt) {
    const bell = await notifyAdmins(supabase, {
      eventType: "system",
      message: staffFailureMessage(
        memberName,
        { next_payment_attempt: invoice.next_payment_attempt, number: invoice.number },
        stage,
      ),
      entityType: "subscription",
      entityId: matched?.[0]?.id,
    });
    notified = bell.notified;
  }

  // ── the member's text, and only once Stripe has given up ──────────────────
  let smsSent = false;
  if (stage === "exhausted" && member?.phone) {
    const { data: phoneRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_emergency_phone")
      .maybeSingle();

    // No number, no text. A message telling somebody to ring a number we did not have would
    // send them looking for one — the same reasoning as the placeholder emergency number.
    if (phoneRow?.value) {
      const language = (["en", "es", "nl"].includes(member.preferred_language ?? "")
        ? member.preferred_language
        : "en") as "en" | "es" | "nl";

      const { error: smsError } = await supabase.functions.invoke("twilio-sms", {
        body: {
          to: member.phone,
          message: memberFailureSms(member.first_name as string, language, phoneRow.value as string),
          recipientType: "member",
        },
      });
      smsSent = !smsError;
      if (smsError) {
        console.error(`Could not text ${memberId} about a failed payment:`, smsError.message);
      }
    }
  }

  return {
    handled: true,
    pastDue: matched?.length ?? 0,
    stage,
    adminsNotified: notified,
    memberTexted: smsSent,
  };
}
