import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
import { secondStageLink } from "../_shared/second-stage.ts";

/**
 * join-order-status — what the confirmation screen polls while the webhook catches up.
 *
 * WHY IT EXISTS. `/join?success=true` is reached the instant Stripe redirects, which is BEFORE
 * `stripe-webhook` has processed the event. The screen therefore said "registration complete"
 * on nothing but the presence of a query parameter, and it went on saying it if the webhook
 * never ran at all. It also promised "add your contacts once you sign in" while the
 * second-stage link that actually collects them existed nowhere the member could see
 * (ONBOARDING_SPLIT.md §6-A, REVIEW_JOIN_PATH.md F6). This lets the screen wait for the truth
 * and then show the link.
 *
 * KEYED ON THE STRIPE SESSION ID, NOT THE ORDER NUMBER, and that is the whole security design.
 * Order numbers are SEQUENTIAL — `ICE-20260909-00007` — so anyone could count upwards, and an
 * endpoint that handed out second-stage tokens by order number would hand out other people's
 * links to their medical and emergency-contact forms. A Checkout Session id is unguessable and
 * only the browser that paid has it, because Stripe substitutes it into the success URL.
 *
 * THE SESSION ID IS FOUND IN `payments.notes`, deliberately. `create-checkout` writes it there
 * as well as into `stripe_payment_id`, and `handleSuccessfulPayment` later OVERWRITES
 * `stripe_payment_id` with the PaymentIntent id — so the column that looks like the right one
 * stops matching at exactly the moment this endpoint starts being useful. `notes` is not
 * rewritten by the payment path, so it is the durable one.
 *
 * TOKENS ARE RETURNED ONLY ONCE THE ORDER IS CONFIRMED. Before that there is nothing to give
 * out, and after a failure there should not be.
 */

type Json = Record<string, unknown>;

/** Stripe Checkout Session ids. Validated before it reaches a query. */
const SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/;

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

  // This is polled, so the limit is generous but finite: it is also the surface somebody would
  // use to test session ids in bulk.
  const { allowed } = checkRateLimit(getClientIp(req), 60, 60_000);
  if (!allowed) return json(429, { error: "Too many requests" });

  try {
    const body = await req.json().catch(() => null);
    const sessionId = (body as { sessionId?: unknown } | null)?.sessionId;

    if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
      return json(400, {
        error: "A Stripe checkout session id is required",
        code: "BAD_SESSION_ID",
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // `_` is a LIKE wildcard and session ids contain it, so the pattern can match more than the
    // literal. Harmless on a long random id, but the exact check below makes it exact.
    const { data: payments } = await supabase
      .from("payments")
      .select("id, order_id, member_id, status, notes")
      .like("notes", `%${sessionId}%`)
      .limit(5);

    const payment = (payments ?? []).find(
      (p: { notes: string | null }) => p.notes?.includes(sessionId),
    );

    if (!payment) {
      // Not an error: the payment row exists from the moment the session is created, so this
      // is either a stale link or a session that was never ours. Same answer either way —
      // nothing to show.
      return json(200, { status: "unknown", confirmed: false });
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, status, fulfilment_state")
      .eq("id", payment.order_id)
      .maybeSingle();

    // `awaiting_stock` counts as confirmed: the money arrived and the member is activated —
    // what is missing is a pendant in a box, which does not change what this screen owes them.
    const confirmed = order?.status === "confirmed" || order?.status === "awaiting_stock";

    if (!confirmed) {
      return json(200, {
        status: payment.status === "failed" ? "failed" : "pending",
        confirmed: false,
        orderNumber: order?.order_number ?? null,
      });
    }

    // ── confirmed: hand over the second-stage links and the number ───────────
    const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://icealarm.es").replace(/\/+$/, "");

    const memberIds: string[] = [payment.member_id];

    // THE PARTNER, AND WHY THIS QUERY STANDS ALONE. Nothing in the schema links a couple's
    // second member to their order — no `orders.partner_member_id`, no `subscriptions.order_id`
    // — which is the same gap `_shared/checkout-order.ts` refuses around.
    // `orders.partner_member_id` is in the held schema PR; until that migration is applied this
    // SELECT fails, and it is kept in its own query so that failure costs the partner's link
    // and not the primary's. The screen then shows one link instead of two, which is a visible
    // shortfall rather than a broken page.
    const { data: withPartner, error: partnerError } = await supabase
      .from("orders")
      .select("partner_member_id")
      .eq("id", payment.order_id)
      .maybeSingle();

    if (partnerError) {
      console.log(
        "orders.partner_member_id is not available yet — showing the primary member's link " +
          "only. Apply the held schema migration to include the partner's.",
      );
    } else if (withPartner?.partner_member_id) {
      memberIds.push(withPartner.partner_member_id);
    }

    // ONE SCREEN, TWO LINKS, LABELLED BY NAME. That is option B's mitigation for a couple
    // (ONBOARDING_SPLIT.md): two data subjects need two tokens, but two separate messages look
    // like a mistake or a phish, so both appear together with whose is whose.
    const { data: tokens } = await supabase
      .from("member_update_tokens")
      .select("member_id, token, expires_at, used_at, issued_via, members(first_name)")
      .in("member_id", memberIds)
      .eq("issued_via", "post_payment")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    const secondStage: Array<{ firstName: string | null; link: string; expiresAt: string }> = [];

    for (const row of (tokens ?? []) as Array<{
      token: string;
      expires_at: string;
      members: { first_name: string | null } | null;
    }>) {
      secondStage.push({
        firstName: row.members?.first_name ?? null,
        link: secondStageLink(siteUrl, row.token),
        expiresAt: row.expires_at,
      });
    }

    const { data: phoneRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_emergency_phone")
      .maybeSingle();

    return json(200, {
      status: "confirmed",
      confirmed: true,
      orderNumber: order?.order_number ?? null,
      fulfilmentState: order?.fulfilment_state ?? null,
      secondStage,
      // Null when unset (PENDING_FOR_LEE.md S6). The screen must not render a number we do not
      // have; it offers only the routes that work.
      emergencyPhone: phoneRow?.value ?? null,
    });
  } catch (error) {
    console.error("join-order-status error:", error);
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
