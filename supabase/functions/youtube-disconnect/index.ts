import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: staff } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!staff || !["admin", "super_admin"].includes(staff.role)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current integration to revoke token
    const { data: integration } = await supabase
      .from("system_integrations")
      .select("access_token_encrypted, refresh_token_encrypted")
      .eq("integration_type", "youtube")
      .single();

    if (integration) {
      // Revoke Google token — prefer refresh_token (doesn't expire) over access_token
      // Note: column names say "encrypted" but tokens are stored in plain text
      const tokenToRevoke = integration.refresh_token_encrypted || integration.access_token_encrypted;
      if (tokenToRevoke) {
        try {
          const revokeResp = await fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
            { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
          );
          if (!revokeResp.ok) {
            console.warn("Token revocation returned:", revokeResp.status);
          }
        } catch (e) {
          console.warn("Token revocation failed (may already be invalid):", e);
        }
      }
    }

    // Delete integration record
    const { error: deleteError } = await supabase
      .from("system_integrations")
      .delete()
      .eq("integration_type", "youtube");

    if (deleteError) {
      throw deleteError;
    }

    // Clear YouTube default settings
    await supabase
      .from("system_settings")
      .delete()
      .like("key", "settings_youtube_%");

    return new Response(JSON.stringify({ success: true, message: "YouTube disconnected" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("YouTube disconnect error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
