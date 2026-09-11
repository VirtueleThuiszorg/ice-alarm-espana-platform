import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { loadCheckoutPaymentMethods } from "../_shared/checkout-payment-methods.ts";
import { loadPricingInputs, PricingNotConfiguredError } from "../_shared/checkout-pricing.ts";
import { sendPaymentLinkSchema, validateRequest } from "../_shared/validation.ts";
import {
  PriceResolutionError,
  resolveCheckoutLines,
  toOrderAmounts,
  toStripeLineItems,
} from "../_shared/checkout-lines.ts";
import {
  paymentLinkEmail,
  paymentLinkSms,
  planDelivery,
  planLabel,
  type DeliveryOutcome,
} from "../_shared/payment-link.ts";
import {
  LEGACY_SWITCH_EXPIRY_DAYS,
  legacySwitchPaymentMethods,
  legacySwitchSelection,
  switchNoticeEmail,
  switchNoticeSms,
} from "../_shared/legacy-switch.ts";

/**
 * send-payment-link — staff ask Stripe for a Checkout Session and hand the member (or whoever
 * pays for them) the link. It replaces a "Create Subscription" button that had no handler at
 * all (Lee's dashboard notes, 9 Sep, item 4).
 *
 * GOLDEN RULE 4 IS THE SHAPE OF THIS FUNCTION. It creates PENDING rows and a Stripe session and
 * stops. Nothing here sets `members.status`, `subscriptions.status = 'active'`, or any Stripe
 * id on a row — `stripe-webhook` does all of that when the money actually arrives, from the
 * metadata this function stamps into the session. The database now refuses the alternative
 * anyway: `create_payment_link_order` cannot be called from the browser, and staff can no
 * longer type a member into `active` without a paid subscription (20260909110000).
 *
 * THE BROWSER SENDS NO AMOUNTS. It sends a plan, a billing frequency, a pendant count and who
 * pays. Every figure comes from `pricing_plans` / `pricing_settings` through
 * `_shared/pricing-calc.ts`, and every line item names a Stripe Price id created from those same
 * tables by `stripe-sync-prices` (`_shared/checkout-lines.ts`). REVIEW_JOIN_PATH.md F7 — the
 * browser naming its own price — has no equivalent here, by construction.
 *
 * WHAT IT REFUSES rather than guessing: a stale or missing synced Price (the customer would pay
 * a figure no screen is showing), a member who already has a live subscription (that is a plan
 * change, not a second signup), and any caller who is not active staff.
 *
 * SHARED WITH `create-checkout` as of item 5. This function was written first and deliberately
 * left the join path alone; `create-checkout` now loads its pricing through the same
 * `_shared/checkout-pricing.ts` and builds its lines through the same
 * `_shared/checkout-lines.ts`, so there is one price-id implementation on the platform rather
 * than a staff one and a customer one that drift apart.
 */

type Json = Record<string, unknown>;

const STAFF_ROLES = ["call_centre", "call_centre_supervisor", "admin", "super_admin"];

/**
 * Stripe's own ceiling: a Checkout Session may expire between 30 minutes and 24 hours after it
 * is created, and a request outside that range is a 400. Named rather than inlined so the next
 * person to want "just a bit longer" finds the reason instead of the number.
 */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** Redirects are built HERE, never taken from the request — an open redirect on a payment page. */
const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://icealarm.es").replace(/\/+$/, "");

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, payload: Json) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── who is asking ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const bearer = authHeader.replace("Bearer ", "");

    /*
      THE DAILY RUNNER IS NOT A PERSON, and it must not need one.

      `billing-migration-run` paces the legacy→Stripe migration over months and calls this
      function for each member due today. It holds the service role key and nothing else — there
      is no staff session behind a cron job, and inventing one (a service account with a staff
      row) would be a login that can send payment links and that nobody would ever rotate.

      SO THE BRANCH IS AS NARROW AS IT CAN BE. Only an exact match on the service role key, and
      even then only for `legacy_switch` — the mode that takes no plan, no amount and no payer
      from the request, so there is nothing for a caller to choose. An ordinary payment link
      still requires a real, active staff member with a role on the list, unchanged.

      The audit row and `start_legacy_switch` both take a NULL staff id for these, which is
      honest: nobody pressed anything. The activity_logs row says what happened and when, and
      `source: legacy-switch` in the Stripe metadata says which path created it.
    */
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isRunner = serviceKey.length > 0 && bearer === serviceKey;

    let staff: { id: string; role: string } | null = null;

    if (!isRunner) {
      const { data: userData, error: authError } = await admin.auth.getUser(bearer);
      if (authError || !userData.user) return json(401, { error: "Invalid token" });

      const { data: staffRow } = await admin
        .from("staff")
        .select("id, role, first_name, last_name")
        .eq("user_id", userData.user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!staffRow || !STAFF_ROLES.includes(staffRow.role)) {
        return json(403, { error: "Staff access required" });
      }
      staff = staffRow;
    }

    // ── what they asked for (no amounts, by schema) ──────────────────────────
    const raw = await req.json().catch(() => null);
    const validated = validateRequest(sendPaymentLinkSchema, raw, corsHeaders);
    if (validated.error) return validated.error;
    const body = validated.data;

    // The service role may ONLY take the switch path. Anything else from a keyholder with no
    // person behind it is refused here rather than being quietly allowed by the branch above.
    if (isRunner && body.mode !== "legacy_switch") {
      return json(403, {
        error: "The service role may only create legacy-switch links.",
        code: "RUNNER_SCOPE",
      });
    }

    // ── the member ───────────────────────────────────────────────────────────
    const { data: member, error: memberError } = await admin
      .from("members")
      .select("id, first_name, last_name, email, phone, preferred_language, status, billing_source, switch_session_expires_at")
      .eq("id", body.memberId)
      .maybeSingle();
    if (memberError || !member) return json(404, { error: "Member not found" });

    // ── the money, from our tables only ──────────────────────────────────────
    // The fetch itself lives in `_shared/checkout-pricing.ts` because `create-checkout` now
    // needs exactly the same rows read in exactly the same way — one implementation, not two.
    let pricing;
    try {
      pricing = await loadPricingInputs(admin);
    } catch (e) {
      // It throws rather than falling back to literals, deliberately: a charge computed from
      // baked-in numbers is a charge nobody can reconcile.
      if (e instanceof PricingNotConfiguredError) {
        return json(503, { error: e.message, code: e.code });
      }
      throw e;
    }
    const setting = pricing.setting;

    /*
      TWO MODES, ONE BUILDER.

      `legacy_switch` is an ordinary payment link with the registration fee and the pendant
      taken off, and the plan read from the member's own record rather than from the request.
      Everything downstream — the synced Stripe Prices, the stale-price refusal, the pending
      order rows, the delivery decisions, the audit row — is the same code, which is the point:
      a second edge function for the migration would drift from this one inside a month and the
      drift would be about money.
    */
    const isSwitch = body.mode === "legacy_switch";

    let selection;
    if (body.mode === "legacy_switch") {
      // Only somebody Santander is actually collecting from. `start_legacy_switch` refuses the
      // rest too; refusing here means no Stripe session is created for a member who cannot use
      // one, and no orphan pending order is left behind.
      /*
        A RE-ISSUE IS ALLOWED ONCE STRIPE HAS EXPIRED THE PREVIOUS SESSION, and the annual ladder
        depends on it: the notice at 14 days puts the member into `switch_pending`, and Stripe
        kills that Checkout Session after 24 HOURS — its own ceiling — so the reminder at 7 days
        has nothing payable to point at unless it can issue a fresh one.

        What is refused is two LIVE sessions at once, which is how somebody gets charged twice.
        An expired one is not live. `start_legacy_switch` applies the same rule in the database,
        so this check is the friendly message and not the guarantee.
      */
      // An UNKNOWN expiry counts as live: "I cannot tell whether their link still works" must
      // not resolve to "issue another one". The 14-day sweep unsticks them either way.
      const sessionStillLive =
        member.billing_source === "switch_pending" &&
        (member.switch_session_expires_at === null ||
          new Date(member.switch_session_expires_at as string).getTime() > Date.now());

      const canSwitch =
        member.billing_source === "legacy" ||
        (member.billing_source === "switch_pending" && !sessionStillLive);

      if (!canSwitch) {
        return json(409, {
          error: sessionStillLive
            ? `${member.first_name} ${member.last_name} already has a switch link that has not ` +
              "expired yet. Sending a second one would give them two ways to pay for the same month."
            : `${member.first_name} ${member.last_name} is not on legacy billing ` +
              `(billing_source = ${member.billing_source}), so there is nothing to switch.`,
          code: sessionStillLive ? "SWITCH_ALREADY_LIVE" : "NOT_LEGACY",
        });
      }

      /*
        THE PLAN COMES FROM THE MEMBER'S OWN RECORD. The CRM import wrote a `pending`
        subscription row carrying what Karma billed — plan type and billing frequency. Reading
        it here is what stops a switch link quietly moving somebody from couple to single, or
        annual to monthly, at whatever price that implies.
      */
      const { data: existing } = await admin
        .from("subscriptions")
        .select("plan_type, billing_frequency")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existing?.plan_type || !existing?.billing_frequency) {
        return json(409, {
          error:
            "This member has no recorded plan, so there is nothing to charge. Add their plan " +
            "to the record first, or send an ordinary payment link naming it.",
          code: "NO_LEGACY_PLAN",
        });
      }

      selection = legacySwitchSelection({
        membershipType: existing.plan_type as "single" | "couple",
        billingFrequency: existing.billing_frequency as "monthly" | "annual",
      });
    } else {
      selection = {
        membershipType: body.membershipType,
        billingFrequency: body.billingFrequency,
        pendantCount: body.pendantCount,
        includeShipping: body.pendantCount > 0,
        registrationFeeEnabled: pricing.registrationFeeEnabled,
        registrationFeeDiscount: pricing.registrationFeeDiscount,
      };
    }

    let resolved;
    try {
      resolved = resolveCheckoutLines(selection, pricing.prices, pricing.config);
    } catch (e) {
      if (e instanceof PriceResolutionError) {
        return json(409, { error: e.message, code: e.code, priceKeys: e.priceKeys });
      }
      throw e;
    }

    // ── the payer (PAYER_MODEL.md): the member, or somebody else ──────────────
    let payerId: string | null = null;
    let payerName = `${member.first_name} ${member.last_name}`;
    let payerFirstName = member.first_name;
    let payerEmail: string | null = member.email;
    let payerPhone: string | null = member.phone;

    /*
      A switch link is always paid by the member. They have been paying Santander themselves for
      years; if somebody else is to pay, that is a deliberate payment link with a payer chosen on
      it, not a side effect of a bulk migration. Narrowed into one value so the rest of this
      function does not have to keep asking which mode it is in.
    */
    const payerChoice: { mode: "member" } | Extract<typeof body, { payer: unknown }>["payer"] =
      body.mode === "legacy_switch" ? { mode: "member" } : body.payer;

    if (payerChoice.mode === "other") {
      const { data: existing } = await admin
        .from("payers")
        .select("id, full_name, email, phone")
        .eq("email", payerChoice.email)
        .maybeSingle();

      if (existing) {
        payerId = existing.id;
      } else {
        const { data: created, error: payerError } = await admin
          .from("payers")
          .insert({
            full_name: payerChoice.fullName,
            email: payerChoice.email,
            phone: payerChoice.phone ?? null,
            relationship: payerChoice.relationship ?? null,
            created_by: staff?.id ?? null,
          })
          .select("id")
          .single();
        if (payerError || !created) {
          return json(500, { error: `Could not record the payer: ${payerError?.message}` });
        }
        payerId = created.id;
      }
      payerName = payerChoice.fullName;
      payerFirstName = payerChoice.fullName.split(" ")[0] || payerChoice.fullName;
      payerEmail = payerChoice.email;
      payerPhone = payerChoice.phone ?? null;
    }

    // ── the pending rows, in one transaction ─────────────────────────────────
    const amounts = toOrderAmounts(resolved);
    const { data: created, error: rowsError } = await admin.rpc("create_payment_link_order", {
      payload: {
        memberId: member.id,
        membershipType: selection.membershipType,
        billingFrequency: selection.billingFrequency,
        pendantCount: selection.pendantCount,
        payerId,
        paymentMethod: "stripe",
        createdByStaffId: staff?.id ?? null,
        amounts,
      },
    });
    if (rowsError || !created) {
      // The function raises with a sentence; pass it through rather than a generic 500, because
      // "member already has a live subscription" is something the staff member can act on.
      return json(409, {
        error: rowsError?.message ?? "Could not record the order",
        code: "ORDER_NOT_RECORDED",
      });
    }
    const ids = created as { orderId: string; orderNumber: string; paymentId: string; subscriptionId: string };

    // ── Stripe ───────────────────────────────────────────────────────────────
    const { data: keyRow } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "settings_stripe_secret_key")
      .maybeSingle();
    if (!keyRow?.value) {
      return json(503, { error: "Stripe is not configured", code: "STRIPE_NOT_CONFIGURED" });
    }

    const stripe = new Stripe(keyRow.value, { apiVersion: "2023-10-16" });

    // `mode: "subscription"` with one-off items on the first invoice — P1, decided and closed:
    // the membership renews, the pendant, shipping and the registration fee do not.
    const metadata = {
      member_id: member.id,
      order_id: ids.orderId,
      payment_id: ids.paymentId,
      subscription_id: ids.subscriptionId,
      order_number: ids.orderNumber,
      payer_id: payerId ?? "",
      sent_by_staff_id: staff?.id ?? "",
      // The webhook reads this to decide whether a paid session also ENDS a legacy billing
      // arrangement. `post-payment.ts` flips billing_source to `stripe` on it, which is the one
      // write of that value anywhere — golden rule 4 applied to who bills, not just to who is
      // active.
      source: isSwitch ? "legacy-switch" : "send-payment-link",
    };

    /*
      WHICH METHODS THE CUSTOMER IS OFFERED — from `system_settings`, defaulting to card.

      Setting this at all is the point: with `payment_method_types` absent, STRIPE'S DASHBOARD
      DEFAULTS decide, and in the EEA that means SEPA Direct Debit appears next to the card. A
      SEPA checkout completes with `payment_status: "unpaid"` and only activates on
      `checkout.session.async_payment_succeeded` — so unless that event is enabled on the webhook
      destination, the customer pays and is never activated, silently. Card only until an admin
      confirms the destination is listening (Admin → Settings → Payments).
    */
    const { methods: configuredMethods, asyncEventsConfirmed } =
      await loadCheckoutPaymentMethods(admin);

    /*
      A SWITCH LINK ASKS FOR SEPA, and gets it only if the destination is listening.

      These people have paid by direct debit for a decade; offering only a card asks a 79-year-old
      to find one. But a SEPA checkout completes `unpaid` and activates on
      `checkout.session.async_payment_succeeded` — and a member who signs the mandate while
      nothing is listening has ALSO left the Santander run (switch_pending), so they would be
      billed by nobody at all. `legacySwitchPaymentMethods` puts that decision through the same
      acknowledgement the settings screen uses, and the response says which it got.
    */
    const paymentMethodTypes = isSwitch
      ? legacySwitchPaymentMethods(asyncEventsConfirmed)
      : configuredMethods;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: paymentMethodTypes as never,
      line_items: toStripeLineItems(resolved.lines) as never,
      customer_email: payerEmail ?? undefined,
      success_url: `${SITE_URL}/payment-success?order=${encodeURIComponent(ids.orderNumber)}`,
      cancel_url: `${SITE_URL}/payment-cancelled?order=${encodeURIComponent(ids.orderNumber)}`,
      billing_address_collection: "required",
      metadata,
      // The subscription Stripe creates carries the same ids, so `customer.subscription.*`
      // events are attributable without a lookup.
      subscription_data: { metadata },
      /*
        24 HOURS, BECAUSE STRIPE ALLOWS NOTHING LONGER — this said 72 and Stripe rejects it.

        From the SDK this function imports (stripe@14.21.0,
        types/Checkout/SessionsResource.d.ts): "The Epoch time in seconds at which the Checkout
        Session will expire. It can be anywhere from 30 minutes to 24 hours after Checkout
        Session creation."

        So the old value was not a generous choice, it was a 400 on every call — the session was
        never created, after the pending order rows had already been written. The reasoning
        behind it (a family needs time to talk over a link that arrived by email) is real and
        simply is not available: past 24 hours, staff send another link.
      */
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      /*
        NOTHING ELSE, AND THAT IS THE DESIGN FOR A SWITCH LINK. No `trial_period_days`, no
        `billing_cycle_anchor`, no `proration_behavior` — Lee's rule is "a member pays the
        month's fee the moment they set up and again exactly one month later; the setup day
        becomes their billing day. No €0 setups, no future anchors, no proration."

        The temptation is an anchor set to their Santander date so the cycles line up. It would
        be wrong twice: it produces a €0 or prorated first invoice, and a €0 invoice does not
        pay a session — so the webhook never activates them while switch_pending has already
        taken them out of the Santander run. Nobody would be collecting at all.
      */
    });

    if (!session.url) {
      return json(502, { error: "Stripe returned a session with no URL", code: "NO_SESSION_URL" });
    }

    // The session id goes on the PENDING payment row, exactly as create-checkout does, so the
    // webhook's payment can be reconciled with the session that produced it.
    await admin
      .from("payments")
      .update({
        stripe_payment_id: session.id,
        notes: `Stripe Checkout Session (payment link sent by staff): ${session.id}`,
      })
      .eq("id", ids.paymentId);

    /*
      SWITCH_PENDING IS RECORDED THE MOMENT A SESSION EXISTS, and not one step later.

      From here the member is out of the Santander export. That ordering is the whole safety
      argument: if this write failed and the member paid Stripe anyway, the next Santander run
      would still include them and they would be charged twice in one month. Excluding somebody
      who then never pays costs one month and is recoverable; charging an 80-year-old twice is a
      phone call, a refund and a lost trust.

      So a failure here is a REFUSAL, not a warning: the link is not handed out. The Stripe
      session simply expires unused, and the pending order rows are the same ones an unpaid
      ordinary link leaves behind.
    */
    let switchExpiresAt: string | null = null;
    if (isSwitch) {
      switchExpiresAt = new Date(
        Date.now() + LEGACY_SWITCH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { error: switchError } = await admin.rpc("start_legacy_switch", {
        _member_id: member.id,
        _session_id: session.id,
        _expires_at: switchExpiresAt,
        _staff_id: staff?.id ?? null,
        // THE URL IS STORED so the member's own portal can show it. A Checkout URL is not a
        // credential — it pays one order and Stripe expires it — and the alternative is telling
        // an 82-year-old to go and find the text message we sent them.
        _checkout_url: session.url,
        // NOT the same as the switch expiry. Stripe caps a session at 24 hours; the switch
        // window is 14 days. The portal needs both so it can say "your link has expired, ring
        // us" instead of showing a dead one.
        _session_expires_at: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
      });

      if (switchError) {
        console.error("start_legacy_switch failed:", switchError.message);
        return json(409, {
          error:
            "The Stripe link was created but this member could not be marked as switching, so " +
            "it has NOT been sent — they would have stayed in the Santander run and been " +
            `charged twice. ${switchError.message}`,
          code: "SWITCH_NOT_RECORDED",
        });
      }
    }

    // ── delivery: attempt what is switched on, ALWAYS return the link ────────
    const label = planLabel(selection.membershipType, selection.billingFrequency, selection.pendantCount);
    const language = (["en", "es", "nl"].includes(member.preferred_language ?? "")
      ? member.preferred_language
      : "en") as "en" | "es" | "nl";

    const message = {
      payerFirstName,
      memberFullName: `${member.first_name} ${member.last_name}`,
      payerIsSomeoneElse: payerChoice.mode === "other",
      planLabel: label,
      totalEuros: resolved.totalCents / 100,
      url: session.url,
      language,
    };

    /*
      A SWITCH SAYS SOMETHING DIFFERENT, and the difference is not cosmetic.

      The ordinary link says "here is the link to complete your subscription" — which, sent to
      somebody who has been a member since 2014 and pays every month, reads as though their
      membership has lapsed. Worse, a message about money from the company that holds their
      emergency button reads as a threat to the button unless the first sentence says otherwise.
      `switchNoticeEmail` leads with "your alarm does not change".
    */
    const notice = {
      memberFirstName: member.first_name,
      amountEuros: resolved.totalCents / 100,
      billingFrequency: selection.billingFrequency,
      url: session.url,
      language,
    };
    const smsText = isSwitch ? switchNoticeSms(notice) : paymentLinkSms(message);
    const mailText = isSwitch ? switchNoticeEmail(notice) : paymentLinkEmail(message);

    const emailConfigured = Boolean(
      (
        await admin
          .from("system_settings")
          .select("value")
          .eq("key", "settings_email_provider")
          .maybeSingle()
      ).data?.value,
    );

    const decisions = planDelivery({
      smsChannelOn: setting("notify_channel_sms") === "true",
      emailConfigured,
      payerPhone,
      payerEmail,
    });

    const delivery: Array<{ channel: string; to: string | null; outcome: DeliveryOutcome; detail?: string }> = [];

    for (const decision of decisions) {
      if (!decision.attempt) {
        delivery.push({ channel: decision.channel, to: decision.to, outcome: decision.outcome! });
        continue;
      }

      if (decision.channel === "sms") {
        try {
          const { error } = await admin.functions.invoke("twilio-sms", {
            body: { to: decision.to, message: smsText, recipientType: "member" },
            headers: { Authorization: authHeader },
          });
          delivery.push({
            channel: "sms",
            to: decision.to,
            outcome: error ? "failed" : "sent",
            detail: error?.message,
          });
        } catch (e) {
          delivery.push({
            channel: "sms",
            to: decision.to,
            outcome: "failed",
            detail: e instanceof Error ? e.message : "unknown",
          });
        }
        continue;
      }

      const result = await sendEmail(decision.to!, mailText.subject, mailText.html);
      delivery.push({
        channel: "email",
        to: decision.to,
        outcome: result.success ? "sent" : "failed",
        detail: result.error,
      });
    }

    // What was actually sent, appended to the audit row the SQL function already wrote. A row
    // saying "a link was created" without saying whether it reached anybody is the shape of
    // failure this whole item is about.
    await admin.from("activity_logs").insert({
      staff_id: staff?.id ?? null,
      action: isSwitch ? "legacy_switch_link_sent" : "payment_link_sent",
      entity_type: "order",
      entity_id: ids.orderId,
      new_values: {
        order_number: ids.orderNumber,
        member_id: member.id,
        payer_id: payerId,
        stripe_session_id: session.id,
        total: resolved.totalCents / 100,
        plan: label,
        mode: isSwitch ? "legacy_switch" : "signup",
        switch_expires_at: switchExpiresAt,
        payment_method_types: paymentMethodTypes,
        delivery,
      },
      reason: `payment link sent for ${ids.orderNumber} (${label})`,
    });

    return json(200, {
      url: session.url,
      sessionId: session.id,
      expiresAt: session.expires_at,
      orderNumber: ids.orderNumber,
      orderId: ids.orderId,
      paymentId: ids.paymentId,
      subscriptionId: ids.subscriptionId,
      payerId,
      totalEuros: resolved.totalCents / 100,
      planLabel: label,
      mode: isSwitch ? "legacy_switch" : "signup",
      switchExpiresAt,
      // So the screen can say "card only — SEPA is off until the webhook destination is
      // confirmed" rather than leaving staff to wonder why a direct debit was not offered.
      paymentMethodTypes,
      delivery,
      lines: resolved.lines.map((l) => ({
        priceKey: l.priceKey,
        quantity: l.quantity,
        unitAmountCents: l.unitAmountCents,
        source: l.source,
      })),
    });
  } catch (error) {
    console.error("send-payment-link error:", error);
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
