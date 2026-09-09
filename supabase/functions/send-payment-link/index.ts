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

    const { data: userData, error: authError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !userData.user) return json(401, { error: "Invalid token" });

    const { data: staff } = await admin
      .from("staff")
      .select("id, role, first_name, last_name")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staff || !STAFF_ROLES.includes(staff.role)) {
      return json(403, { error: "Staff access required" });
    }

    // ── what they asked for (no amounts, by schema) ──────────────────────────
    const raw = await req.json().catch(() => null);
    const validated = validateRequest(sendPaymentLinkSchema, raw, corsHeaders);
    if (validated.error) return validated.error;
    const body = validated.data;

    // ── the member ───────────────────────────────────────────────────────────
    const { data: member, error: memberError } = await admin
      .from("members")
      .select("id, first_name, last_name, email, phone, preferred_language, status")
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

    const selection = {
      membershipType: body.membershipType,
      billingFrequency: body.billingFrequency,
      pendantCount: body.pendantCount,
      includeShipping: body.pendantCount > 0,
      registrationFeeEnabled: pricing.registrationFeeEnabled,
      registrationFeeDiscount: pricing.registrationFeeDiscount,
    };

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

    if (body.payer.mode === "other") {
      const { data: existing } = await admin
        .from("payers")
        .select("id, full_name, email, phone")
        .eq("email", body.payer.email)
        .maybeSingle();

      if (existing) {
        payerId = existing.id;
      } else {
        const { data: created, error: payerError } = await admin
          .from("payers")
          .insert({
            full_name: body.payer.fullName,
            email: body.payer.email,
            phone: body.payer.phone ?? null,
            relationship: body.payer.relationship ?? null,
            created_by: staff.id,
          })
          .select("id")
          .single();
        if (payerError || !created) {
          return json(500, { error: `Could not record the payer: ${payerError?.message}` });
        }
        payerId = created.id;
      }
      payerName = body.payer.fullName;
      payerFirstName = body.payer.fullName.split(" ")[0] || body.payer.fullName;
      payerEmail = body.payer.email;
      payerPhone = body.payer.phone ?? null;
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
        createdByStaffId: staff.id,
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
      sent_by_staff_id: staff.id,
      source: "send-payment-link",
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
    const { methods: paymentMethodTypes } = await loadCheckoutPaymentMethods(supabase);

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
      // 72 hours: long enough for a family to talk it over, short enough that a stale link
      // cannot be paid weeks later against a price that has since changed.
      expires_at: Math.floor(Date.now() / 1000) + 72 * 60 * 60,
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

    // ── delivery: attempt what is switched on, ALWAYS return the link ────────
    const label = planLabel(selection.membershipType, selection.billingFrequency, selection.pendantCount);
    const language = (["en", "es", "nl"].includes(member.preferred_language ?? "")
      ? member.preferred_language
      : "en") as "en" | "es" | "nl";

    const message = {
      payerFirstName,
      memberFullName: `${member.first_name} ${member.last_name}`,
      payerIsSomeoneElse: body.payer.mode === "other",
      planLabel: label,
      totalEuros: resolved.totalCents / 100,
      url: session.url,
      language,
    };

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
            body: { to: decision.to, message: paymentLinkSms(message), recipientType: "member" },
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

      const mail = paymentLinkEmail(message);
      const result = await sendEmail(decision.to!, mail.subject, mail.html);
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
      staff_id: staff.id,
      action: "payment_link_sent",
      entity_type: "order",
      entity_id: ids.orderId,
      new_values: {
        order_number: ids.orderNumber,
        member_id: member.id,
        payer_id: payerId,
        stripe_session_id: session.id,
        total: resolved.totalCents / 100,
        plan: label,
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
