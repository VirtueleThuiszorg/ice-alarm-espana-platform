import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate admin caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the caller is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: staffData } = await supabaseAdmin
      .from("staff")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .single();

    if (!staffData || !["admin", "super_admin"].includes(staffData.role)) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { partner_id } = await req.json();

    if (!partner_id) {
      return new Response(
        JSON.stringify({ error: "Partner ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Deleting partner:", partner_id);

    // Get the partner record to find user_id
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .select("id, user_id, email, contact_name")
      .eq("id", partner_id)
      .single();

    if (partnerError || !partner) {
      return new Response(
        JSON.stringify({ error: "Partner not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUserId = partner.user_id;
    console.log("Partner auth user_id:", authUserId);

    // Delete related data in order
    // 1. Partner invites
    const { error: invitesError } = await supabaseAdmin
      .from("partner_invites")
      .delete()
      .eq("partner_id", partner_id);
    
    if (invitesError) {
      console.error("Error deleting invites:", invitesError);
    }

    // 2. Partner commissions
    const { error: commissionsError } = await supabaseAdmin
      .from("partner_commissions")
      .delete()
      .eq("partner_id", partner_id);
    
    if (commissionsError) {
      console.error("Error deleting commissions:", commissionsError);
    }

    // 3. Partner attributions
    const { error: attributionsError } = await supabaseAdmin
      .from("partner_attributions")
      .delete()
      .eq("partner_id", partner_id);
    
    if (attributionsError) {
      console.error("Error deleting attributions:", attributionsError);
    }

    // 4. Partner agreements
    const { error: agreementsError } = await supabaseAdmin
      .from("partner_agreements")
      .delete()
      .eq("partner_id", partner_id);
    
    if (agreementsError) {
      console.error("Error deleting agreements:", agreementsError);
    }

    // 5. Delete the partner record
    const { error: deletePartnerError } = await supabaseAdmin
      .from("partners")
      .delete()
      .eq("id", partner_id);

    if (deletePartnerError) {
      console.error("Error deleting partner:", deletePartnerError);
      return new Response(
        JSON.stringify({ error: deletePartnerError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Delete the auth user (CRITICAL - this frees up the email)
    if (authUserId) {
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      
      if (deleteAuthError) {
        console.error("Error deleting auth user:", deleteAuthError);
        // Don't fail the whole operation, just log it
        // The partner record is already deleted
      } else {
        console.log("Auth user deleted:", authUserId);
      }
    }

    // Log activity
    await supabaseAdmin.from("activity_logs").insert({
      action: "partner_deleted_by_admin",
      entity_type: "partner",
      entity_id: partner_id,
      staff_id: userData.user.id,
      old_values: {
        email: partner.email,
        contact_name: partner.contact_name,
        user_id: authUserId,
      },
    });

    console.log("Partner fully deleted:", partner_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Partner and associated auth user deleted successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Partner deletion error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
