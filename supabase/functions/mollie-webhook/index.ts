import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { handleSuccessfulPayment } from "../_shared/post-payment.ts";

const MOLLIE_API = "https://api.mollie.com/v2";

async function mollieGet(apiKey: string, path: string) {
  const response = await fetch(`${MOLLIE_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.detail || data.title || `Mollie API error: ${response.status}`
    );
  }
  return data;
}

async function molliePost(apiKey: string, path: string, body: unknown) {
  const response = await fetch(`${MOLLIE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.detail || data.title || `Mollie API error: ${response.status}`
    );
  }
  return data;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get Mollie API key
    const { data: mollieSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_mollie_api_key")
      .single();

    if (!mollieSettings?.value) {
      console.error("Mollie API key not configured");
      return new Response(
        JSON.stringify({ error: "Mollie not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = mollieSettings.value;

    // Mollie sends POST with application/x-www-form-urlencoded body: id=tr_xxx
    const formBody = await req.text();
    const params = new URLSearchParams(formBody);
    const molliePaymentId = params.get("id");

    if (!molliePaymentId) {
      return new Response(
        JSON.stringify({ error: "Missing payment ID" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Mollie webhook received for payment:", molliePaymentId);

    // Idempotency guard: skip if this payment was already processed
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_id", molliePaymentId)
      .maybeSingle();

    if (existingEvent) {
      console.log("Duplicate Mollie webhook, skipping:", molliePaymentId);
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record this event as processed
    await supabase.from("webhook_events").insert({
      event_id: molliePaymentId,
      provider: "mollie",
      event_type: "payment",
    });

    // Fetch payment details from Mollie
    const payment = await mollieGet(apiKey, `/payments/${molliePaymentId}`);
    console.log(
      "Mollie payment status:",
      payment.status,
      "sequenceType:",
      payment.sequenceType
    );

    if (payment.status === "paid") {
      const metadata = payment.metadata || {};

      if (metadata.order_id) {
        // First payment from checkout — full post-payment processing
        console.log("Processing first payment for order:", metadata.order_id);

        // Create Mollie subscription for recurring billing
        if (payment.customerId && payment.sequenceType === "first") {
          try {
            const billingFrequency =
              metadata.billing_frequency || "monthly";
            const subscriptionAmount = metadata.subscription_amount || "0";
            const interval =
              billingFrequency === "annual" ? "12 months" : "1 month";

            const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
            const webhookUrl = `${SUPABASE_URL}/functions/v1/mollie-webhook`;

            const mollieSub = await molliePost(
              apiKey,
              `/customers/${payment.customerId}/subscriptions`,
              {
                amount: {
                  currency: "EUR",
                  value: parseFloat(subscriptionAmount).toFixed(2),
                },
                interval,
                description: "ICE Alarm membership",
                webhookUrl,
              }
            );

            console.log("Mollie subscription created:", mollieSub.id);

            // Update subscription record with Mollie IDs
            if (metadata.subscription_id) {
              await supabase
                .from("subscriptions")
                .update({
                  mollie_customer_id: payment.customerId,
                  mollie_subscription_id: mollieSub.id,
                  status: "active",
                })
                .eq("id", metadata.subscription_id);
            }

            // Also activate partner subscription if applicable
            if (metadata.partner_subscription_id) {
              await supabase
                .from("subscriptions")
                .update({
                  mollie_customer_id: payment.customerId,
                  mollie_subscription_id: mollieSub.id,
                  status: "active",
                })
                .eq("id", metadata.partner_subscription_id);
              console.log(
                "Partner subscription activated:",
                metadata.partner_subscription_id
              );
            }
          } catch (subError) {
            console.error("Error creating Mollie subscription:", subError);
            // Don't fail the webhook — the payment was still successful
          }
        }

        // Shared post-payment processing
        await handleSuccessfulPayment(supabase, {
          orderId: metadata.order_id,
          paymentId: metadata.payment_id,
          memberId: metadata.member_id,
          subscriptionId: metadata.subscription_id,
          partnerMemberId: metadata.partner_member_id,
          partnerSubscriptionId: metadata.partner_subscription_id,
          amountPaid: parseFloat(payment.amount.value),
          gatewayPaymentId: molliePaymentId,
          gateway: "mollie",
        });
      } else if (payment.subscriptionId) {
        // Recurring payment from Mollie subscription
        console.log(
          "Processing recurring payment for subscription:",
          payment.subscriptionId
        );

        const { data: sub } = await supabase
          .from("subscriptions")
          .select("id, member_id")
          .eq("mollie_subscription_id", payment.subscriptionId)
          .single();

        if (sub) {
          await supabase.from("payments").insert({
            member_id: sub.member_id,
            subscription_id: sub.id,
            amount: parseFloat(payment.amount.value),
            payment_type: "subscription",
            payment_method: "mollie",
            status: "completed",
            mollie_payment_id: molliePaymentId,
            paid_at: new Date().toISOString(),
          });
          console.log("Recurring payment recorded for member:", sub.member_id);
        }
      }
    } else if (
      payment.status === "failed" ||
      payment.status === "canceled" ||
      payment.status === "expired"
    ) {
      console.log("Payment not successful:", payment.status);

      // Update first-payment record if applicable
      if (payment.metadata?.payment_id) {
        await supabase
          .from("payments")
          .update({
            status: payment.status === "canceled" ? "cancelled" : "failed",
            notes: `Mollie payment ${payment.status}`,
          })
          .eq("id", payment.metadata.payment_id);
      }

      // If this was a subscription payment that failed
      if (payment.subscriptionId) {
        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("mollie_subscription_id", payment.subscriptionId);
      }
    }

    // Mollie expects a 200 response
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Mollie webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
