import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const MOLLIE_API = "https://api.mollie.com/v2";

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
      return new Response(
        JSON.stringify({ error: "Mollie not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { subscriptionId } = await req.json();

    if (!subscriptionId) {
      return new Response(
        JSON.stringify({ error: "subscriptionId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the subscription record from DB
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, mollie_customer_id, mollie_subscription_id, status")
      .eq("id", subscriptionId)
      .single();

    if (subError || !sub) {
      return new Response(
        JSON.stringify({ error: "Subscription not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!sub.mollie_customer_id || !sub.mollie_subscription_id) {
      return new Response(
        JSON.stringify({ error: "No Mollie subscription linked" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Cancel on Mollie
    const response = await fetch(
      `${MOLLIE_API}/customers/${sub.mollie_customer_id}/subscriptions/${sub.mollie_subscription_id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${mollieSettings.value}` },
      }
    );

    if (!response.ok && response.status !== 404) {
      const errorData = await response.json();
      throw new Error(
        errorData.detail ||
          `Mollie cancellation failed: ${response.status}`
      );
    }

    // Update subscription status in DB
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", subscriptionId);

    console.log("Mollie subscription cancelled:", sub.mollie_subscription_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cancel Mollie subscription error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
