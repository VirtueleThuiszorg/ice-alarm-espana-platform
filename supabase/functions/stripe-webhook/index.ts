import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { handleSuccessfulPayment } from "../_shared/post-payment.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, "stripe-signature");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get Stripe secret key from settings
    const { data: stripeSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_stripe_secret_key")
      .single();

    if (!stripeSettings?.value) {
      console.error("Stripe secret key not configured");
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get webhook secret from settings
    const { data: webhookSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_stripe_webhook_secret")
      .single();

    if (!webhookSettings?.value) {
      console.error("Stripe webhook secret not configured in system_settings");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook signature
    const stripe = new Stripe(stripeSettings.value, { apiVersion: "2023-10-16" });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSettings.value);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown verification error";
      console.error("Webhook signature verification failed:", message);
      return new Response(
        JSON.stringify({ error: `Webhook signature verification failed: ${message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Stripe webhook verified:", event.type);

    // Idempotency guard: skip if this event was already processed
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      console.log("Duplicate webhook event, skipping:", event.id);
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record this event as processed
    await supabase.from("webhook_events").insert({
      event_id: event.id,
      provider: "stripe",
      event_type: event.type,
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        console.log("Checkout completed:", session.id);

        const orderId = session.metadata?.order_id;
        const paymentId = session.metadata?.payment_id;
        const memberId = session.metadata?.member_id;

        // Stripe-specific: update subscriptions with Stripe IDs
        if (session.subscription && memberId) {
          await supabase
            .from("subscriptions")
            .update({
              stripe_subscription_id: session.subscription,
              stripe_customer_id: session.customer,
              status: "active",
            })
            .eq("member_id", memberId);

          if (session.metadata?.partner_subscription_id) {
            await supabase
              .from("subscriptions")
              .update({
                stripe_subscription_id: session.subscription,
                stripe_customer_id: session.customer,
                status: "active",
              })
              .eq("id", session.metadata.partner_subscription_id);
            console.log("Partner subscription activated:", session.metadata.partner_subscription_id);
          }
        }

        // Shared post-payment processing (order, payment, member activation, device allocation, events, email)
        if (orderId && paymentId && memberId) {
          await handleSuccessfulPayment(supabase, {
            orderId,
            paymentId,
            memberId,
            subscriptionId: session.metadata?.subscription_id,
            partnerMemberId: session.metadata?.partner_member_id,
            partnerSubscriptionId: session.metadata?.partner_subscription_id,
            amountPaid: session.amount_total ? session.amount_total / 100 : 0,
            gatewayPaymentId: session.payment_intent,
            gateway: "stripe",
          });
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as any;
        console.log("Payment succeeded:", paymentIntent.id);

        await supabase
          .from("payments")
          .update({
            status: "completed",
            paid_at: new Date().toISOString(),
          })
          .eq("stripe_payment_id", paymentIntent.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as any;
        console.log("Payment failed:", paymentIntent.id);

        await supabase
          .from("payments")
          .update({
            status: "failed",
            notes: paymentIntent.last_payment_error?.message,
          })
          .eq("stripe_payment_id", paymentIntent.id);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as any;
        console.log("Subscription updated:", subscription.id);

        const statusMap: Record<string, string> = {
          active: "active",
          past_due: "past_due",
          canceled: "cancelled",
          unpaid: "suspended",
        };

        await supabase
          .from("subscriptions")
          .update({
            status: statusMap[subscription.status] || subscription.status,
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;
        console.log("Subscription deleted:", subscription.id);

        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as any;
        console.log("Invoice paid:", invoice.id);

        if (invoice.subscription) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("id, member_id")
            .eq("stripe_subscription_id", invoice.subscription)
            .single();

          if (sub) {
            await supabase.from("payments").insert({
              member_id: sub.member_id,
              subscription_id: sub.id,
              amount: invoice.amount_paid / 100,
              payment_type: "subscription",
              payment_method: "stripe",
              status: "completed",
              stripe_payment_id: invoice.payment_intent,
              invoice_number: invoice.number,
              paid_at: new Date().toISOString(),
            });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        console.log("Invoice payment failed:", invoice.id);

        if (invoice.subscription) {
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", invoice.subscription);
        }
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
