import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  performSubscriptionAction,
  type SubscriptionAction,
} from "../_shared/billing.ts";

/**
 * admin-subscription-action — admin-only. Drives Stripe for subscription
 * pause/resume/cancel, then mirrors the status to the DB. The Stripe secret key comes
 * from system_settings (never hardcoded, never exposed to the browser). If Stripe fails,
 * the DB is left untouched. If the active gateway is Mollie, the action is refused.
 */
const VALID_ACTIONS: SubscriptionAction[] = ["cancel", "pause", "resume"];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Admin auth (same pattern as partner-admin-create) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData.user) return json(401, { error: "Invalid token" });

    const { data: staffData } = await supabaseAdmin
      .from("staff")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .single();
    if (!staffData || !["admin", "super_admin"].includes(staffData.role)) {
      return json(403, { error: "Admin access required" });
    }

    // --- Input ---
    const { subscriptionId, action } = await req.json().catch(() => ({}));
    if (!subscriptionId || !VALID_ACTIONS.includes(action)) {
      return json(400, { error: "subscriptionId and a valid action (cancel|pause|resume) are required" });
    }

    // --- Active gateway: block Mollie before doing anything ---
    const { data: gatewayRow } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "settings_active_payment_gateway")
      .maybeSingle();
    const gateway = gatewayRow?.value as string | null | undefined;

    // --- Load the subscription (need stripe_subscription_id) ---
    const { data: subscription, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, stripe_subscription_id, status")
      .eq("id", subscriptionId)
      .single();
    if (subErr || !subscription) return json(404, { error: "Subscription not found" });

    // --- Stripe key from system_settings (never hardcoded) ---
    const { data: keyRow } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "settings_stripe_secret_key")
      .maybeSingle();
    if (!keyRow?.value) {
      return json(500, { error: "Stripe secret key not configured in system_settings" });
    }
    const stripe = new Stripe(keyRow.value as string, { apiVersion: "2023-10-16" });

    // --- Stripe first, DB only on success (shared, tested core) ---
    const result = await performSubscriptionAction({
      stripe: stripe as unknown as Parameters<typeof performSubscriptionAction>[0]["stripe"],
      db: supabaseAdmin,
      gateway,
      action,
      subscriptionId: subscription.id,
      stripeSubscriptionId: subscription.stripe_subscription_id,
    });

    return json(result.status, result.ok
      ? { success: true, status: result.dbStatus }
      : { success: false, error: result.reason });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
