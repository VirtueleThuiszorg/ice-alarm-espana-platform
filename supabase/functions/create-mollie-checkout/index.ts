import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";

interface LineItem {
  name: string;
  amount: number;
  quantity: number;
}

interface MollieCheckoutRequest {
  memberId: string;
  orderId: string;
  paymentId: string;
  subscriptionId: string;
  lineItems: LineItem[];
  customerEmail: string;
  customerName: string;
  successUrl: string;
  cancelUrl: string;
  billingFrequency: "monthly" | "annual";
  subscriptionAmount: number;
  metadata?: Record<string, string>;
}

const MOLLIE_API = "https://api.mollie.com/v2";

async function mollieRequest(
  apiKey: string,
  path: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${MOLLIE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
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

  const { allowed } = checkRateLimit(getClientIp(req), 10, 60_000);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get Mollie API key from settings
    const { data: mollieSettings, error: settingsError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "settings_mollie_api_key")
      .single();

    if (settingsError || !mollieSettings?.value) {
      console.error("Mollie API key not configured:", settingsError);
      return new Response(
        JSON.stringify({
          error: "Mollie is not configured. Please contact support.",
          code: "MOLLIE_NOT_CONFIGURED",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = mollieSettings.value;
    const body: MollieCheckoutRequest = await req.json();
    console.log("Creating Mollie checkout for:", body.customerEmail);

    // Calculate total amount from line items
    const totalAmount = body.lineItems.reduce(
      (sum, item) => sum + item.amount * item.quantity,
      0
    );

    // 1. Create Mollie customer
    const customer = await mollieRequest(apiKey, "/customers", {
      method: "POST",
      body: JSON.stringify({
        name: body.customerName,
        email: body.customerEmail,
      }),
    });
    console.log("Mollie customer created:", customer.id);

    // Store Mollie customer ID on the subscription
    await supabase
      .from("subscriptions")
      .update({ mollie_customer_id: customer.id })
      .eq("id", body.subscriptionId);

    // 2. Create first payment with sequenceType: "first" (establishes mandate for recurring)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/mollie-webhook`;

    const molliePayment = await mollieRequest(apiKey, "/payments", {
      method: "POST",
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value: totalAmount.toFixed(2),
        },
        description: `ICE Alarm - Order ${body.orderId}`,
        redirectUrl: body.successUrl,
        webhookUrl,
        metadata: {
          order_id: body.orderId,
          payment_id: body.paymentId,
          member_id: body.memberId,
          subscription_id: body.subscriptionId,
          billing_frequency: body.billingFrequency,
          subscription_amount: body.subscriptionAmount.toString(),
          ...(body.metadata || {}),
        },
        customerId: customer.id,
        sequenceType: "first",
      }),
    });

    console.log("Mollie payment created:", molliePayment.id);

    // Update payment record with Mollie payment ID
    await supabase
      .from("payments")
      .update({
        mollie_payment_id: molliePayment.id,
        notes: `Mollie Payment: ${molliePayment.id}`,
      })
      .eq("id", body.paymentId);

    return new Response(
      JSON.stringify({
        paymentId: molliePayment.id,
        url: molliePayment._links.checkout.href,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Mollie checkout error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
