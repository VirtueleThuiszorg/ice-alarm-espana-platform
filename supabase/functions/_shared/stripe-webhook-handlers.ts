/**
 * WHAT THE WEBHOOK DOES WITH AN EVENT — every decision, none of the transport.
 *
 * ── WHY THIS IS A MODULE AND NOT PART OF `stripe-webhook/index.ts` ────────────
 *
 * It was part of it, and that meant NONE OF IT HAD EVER BEEN RUN. `index.ts` calls `serve()` at
 * import time and its handlers were file-private, so every test about them was a source scan:
 * `expect(WEBHOOK).toMatch(/renewal_date: firstRenewalAfterPayment/)`. That proves the line is
 * written. It does not prove the member ends up `stripe`, that the switch columns are cleared,
 * that a SEPA session completing `unpaid` activates nobody, or that a bounced debit puts them
 * back — which is the whole of "PROVE" on the billing migration, and the half of it that is
 * OURS rather than Stripe's.
 *
 * The codebase already knew the answer: `_shared/stripe-events.ts` exists because "the decisions
 * were extracted ... precisely so they could be driven here rather than described in a comment".
 * This is the same move, one level up — the decisions were extracted, and then the HANDLERS that
 * act on them were left behind.
 *
 * So `index.ts` now holds exactly what needs Deno and a request: the signature check, the
 * `webhook_events` claim-and-stamp, and `serve()`. Everything below runs in a test.
 *
 * NOTHING ABOUT THE BEHAVIOUR CHANGED. This is a move, not a rewrite: the same handlers, the
 * same order, the same returns. The one addition is `deps` — see below.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

import { firstRenewalAfterPayment } from "./legacy-billing-schedule.ts";
/*
  THE SHAPE, NOT THE MODULE, and that is load-bearing. `post-payment.ts` reaches `email.ts`,
  which imports `npm:nodemailer` — a specifier Deno resolves and no test runner can. Importing
  it, even for a type, drags that whole chain into the program and makes this module unloadable
  from a test, which is the precise thing it was extracted to fix. `index.ts` passes the real
  function in; nothing here imports it.
*/
import type { PostPayment } from "./post-payment-params.ts";
import { notifyAdmins } from "./staff-bell.ts";
import {
  failureStage,
  memberFailureSms,
  staffFailureMessage,
} from "./payment-retry.ts";
import {
  checkAmount,
  isFirstInvoice,
  isSessionPaid,
  mapSubscriptionStatus,
  missingEventFields,
  renewalDateFrom,
} from "./stripe-events.ts";

type Json = Record<string, unknown>;

/**
 * THE ONE SEAM, and it is deliberately one.
 *
 * `handleSuccessfulPayment` is the rest of a successful payment — devices, the welcome email, the
 * member's auth user, the second-stage token. Driving all of that to assert "the member became
 * `stripe`" would be testing five other features to reach one line, and a test that needs the
 * world stubbed is a test nobody keeps working.
 *
 * So it is injected — REQUIRED, not defaulted. A default would mean a value import of
 * `post-payment.ts`, and that module reaches `email.ts` and `npm:nodemailer`, which vitest
 * cannot resolve; the module would be unloadable from a test, which is the precise thing this
 * extraction exists to fix. `index.ts` passes the real function; a test passes a recorder and
 * asserts what the handler asked for. Same pattern as `notify-staff`'s `transports` and `store`.
 */
export interface WebhookDeps {
  postPayment: PostPayment;
}

/**
 * Everything that depends on the event body. Separated from transport and idempotency so the
 * one thing that matters — did the money arrive, and what did we do about it — reads in one
 * piece, and so a throw from here cannot be mistaken for a signature problem.
 */
export async function handleEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
  deps: WebhookDeps,
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
      return await onCheckoutSession(supabase, event, object as unknown as Stripe.Checkout.Session, deps);

    case "checkout.session.async_payment_failed":
      return await onAsyncPaymentFailed(supabase, object as unknown as Stripe.Checkout.Session);

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
  supabase: SupabaseClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  deps: WebhookDeps,
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

  /*
    THE DAY THEY PAID IS THE DAY THEY PAY — recorded HERE, because this is the first moment the
    platform knows it.

    `renewal_date` was written when the ORDER was created: the day the link was sent, or the day
    the join wizard was submitted. The member pays later — a switch link stands up to 24 hours,
    and a SEPA debit settles days after the mandate is signed — so the date on the record was the
    anniversary of a day nothing happened on, and nothing corrected it until their SECOND invoice.

    Lee's rule is explicit: "the setup day becomes their billing day". There is no trial and no
    `billing_cycle_anchor` on any session this platform creates, so Stripe's own cycle starts at
    this payment too, and the two agree.

    THROUGH `firstRenewalAfterPayment`, not a local `setUTCMonth(+1)`: a member who pays on 31
    January is next billed on 28 February, and the naive version produces 3 March.

    `new Date()` rather than a timestamp off the event, because there is none: a Checkout Session
    carries when it was CREATED, and for SEPA the money moves days later. The webhook is the
    moment we learn of the payment, so it is the closest thing to the payment's own day. The one
    way they diverge is a retry after a handler that died part-way through — `webhook_events`
    skips an event already stamped `processed_at`, so a re-delivery of a COMPLETED run writes
    nothing — and the cost there is a renewal date one day late, not a month.
  */
  const { data: existingSubs } = await supabase
    .from("subscriptions")
    .select("id, billing_frequency")
    .in("id", subscriptionIds);

  const paidOn = new Date();
  const frequencyById = new Map(
    (existingSubs ?? []).map((row) => [row.id as string, row.billing_frequency as string | null]),
  );

  for (const id of subscriptionIds) {
    const frequency = frequencyById.get(id);
    // Only when the row says which cycle it is on. A guess here would put a renewal a year out
    // for somebody who pays monthly, and the order-time date is wrong by days rather than months.
    const renewalDate =
      frequency === "monthly" || frequency === "annual"
        ? { renewal_date: firstRenewalAfterPayment(paidOn, frequency) }
        : {};

    const { data: updated, error } = await supabase
      .from("subscriptions")
      .update({ ...stripeFields, ...renewalDate })
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
  await deps.postPayment(supabase, {
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
  supabase: SupabaseClient,
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

/**
 * A DIRECT DEBIT THAT BOUNCED — the other way a switch ends without money.
 *
 * SEPA completes a Checkout Session `unpaid`: the member signs the mandate on Stripe's page, the
 * session says "completed", and Stripe presents the debit days later. When it clears,
 * `checkout.session.async_payment_succeeded` activates them. When it does not, THIS event fires,
 * and until now nothing handled it.
 *
 * WHAT THAT COST. `switch_pending` takes a member OUT of the Santander export — that is what
 * stops them being collected from twice in the month they move. A bounce left them there:
 * no Stripe subscription, no Santander collection, for up to the fourteen days until the lapse
 * sweep found them. Lee's rule says it plainly: "if not completed within 14 days, OR THE FIRST
 * DEBIT BOUNCES, they return to legacy with a staff bell so the missed payment is collected the
 * old way."
 *
 * AND THE MEMBER BELIEVES THEY HAVE MOVED, which is why the bell says so and why nobody is left
 * to work it out from a log line. Their monitoring is untouched throughout — they are `active`
 * before this and `active` after it.
 *
 * NOT A SECOND IMPLEMENTATION of "return them to legacy": `abandon_legacy_switch` is the same
 * function the 14-day sweep calls, and it writes nothing for a member who is not
 * `switch_pending`, so a Stripe retry of this event and the sweep cannot both announce it.
 */
async function onAsyncPaymentFailed(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<Json> {
  const metadata = session.metadata ?? {};
  const memberId = metadata.member_id!;
  const paymentId = metadata.payment_id!;

  // The payment row first: it is what the member's record shows, and a bounced debit that still
  // reads `pending` is a charge somebody will go looking for in Stripe.
  const { error: paymentError } = await supabase
    .from("payments")
    .update({
      status: "failed",
      notes: `SEPA debit failed — Stripe session ${session.id}`,
    })
    .eq("id", paymentId);
  if (paymentError) console.error("Failed to mark payment failed:", paymentError.message);

  const { data: returned, error: abandonError } = await supabase.rpc("abandon_legacy_switch", {
    p_member_id: memberId,
    p_reason: "debit_bounced",
  });

  if (abandonError) {
    /*
      THROWN, NOT SWALLOWED. Every other failure in this file is logged and stepped over because
      the money has already arrived and the record is merely behind. Here the opposite is true:
      the money did NOT arrive, and a member left in `switch_pending` is in NEITHER collection.
      Throwing leaves `processed_at` null, so Stripe retries the event — which is exactly what
      should happen.
    */
    throw new Error(`abandon_legacy_switch failed for ${memberId}: ${abandonError.message}`);
  }

  console.log(
    `checkout.session.async_payment_failed ${session.id}: member ${memberId} ` +
      (returned ? "returned to legacy billing." : "was not mid-switch — nothing to return."),
  );

  return {
    handled: true,
    returnedToLegacy: returned === true,
    paymentRecorded: !paymentError,
  };
}

/** Subscription lifecycle. Only statuses we have an enum value for are written. */
async function onSubscriptionChange(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
