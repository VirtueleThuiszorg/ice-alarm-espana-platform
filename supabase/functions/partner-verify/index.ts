import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the token
    const { data: tokenRecord, error: tokenError } = await supabase
      .from("partner_verification_tokens")
      .select("*, partners(*)")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if already used
    if (tokenRecord.used_at) {
      return new Response(
        JSON.stringify({ error: "This verification link has already been used" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This verification link has expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const partner = tokenRecord.partners;

    // Update partner status to active
    const { error: updateError } = await supabase
      .from("partners")
      .update({ status: "active" })
      .eq("id", tokenRecord.partner_id);

    if (updateError) {
      console.error("Partner update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to activate account" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Confirm the user's email in auth
    if (partner.user_id) {
      await supabase.auth.admin.updateUserById(partner.user_id, {
        email_confirm: true
      });
    }

    // Mark token as used
    await supabase
      .from("partner_verification_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRecord.id);

    // Log activity
    await supabase.from("activity_logs").insert({
      action: "partner_status_changed",
      entity_type: "partner",
      entity_id: tokenRecord.partner_id,
      old_values: { status: "pending" },
      new_values: { status: "active" }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Account verified successfully",
        partner: {
          id: partner.id,
          contact_name: partner.contact_name,
          email: partner.email,
          referral_code: partner.referral_code
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    console.error("Verification error:", error);
    const message = error instanceof Error ? error.message : "Verification failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
