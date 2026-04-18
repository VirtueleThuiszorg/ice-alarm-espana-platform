import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { referralCode } = await req.json();

    if (!referralCode) {
      return new Response(
        JSON.stringify({ error: "Referral code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for updating
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the partner by referral code
    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("referral_code", referralCode)
      .single();

    if (partnerError || !partner) {
      // Silent failure - don't expose that the code doesn't exist
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the most recent "sent" invite for this partner and update it
    // Only update if status is "sent" (don't override "registered" or "converted")
    const { data: invite, error: inviteError } = await supabase
      .from("partner_invites")
      .select("id, status, view_count")
      .eq("partner_id", partner.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    if (inviteError || !invite) {
      // No matching invite found - this is fine, just return success
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the invite with viewed status
    const currentViewCount = invite.view_count || 0;
    const { error: updateError } = await supabase
      .from("partner_invites")
      .update({
        status: "viewed",
        viewed_at: new Date().toISOString(),
        view_count: currentViewCount + 1,
      })
      .eq("id", invite.id);

    if (updateError) {
      console.error("Failed to update invite:", updateError);
      // Still return success - tracking failures shouldn't block user experience
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Track invite view error:", error);
    // Always return success to not block user experience
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
