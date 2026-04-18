import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is super_admin
    const userId = claimsData.claims.sub;
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (staffError || staffData?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden - Super admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { service, keys } = await req.json();

    // Store the keys in Supabase secrets table (we'll create this)
    // For now, we'll store in a settings table
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Upsert settings - avoid double prefix if key already starts with service_
    for (const [key, value] of Object.entries(keys)) {
      const finalKey = key.startsWith(`${service}_`) ? key : `${service}_${key}`;
      await adminClient
        .from("system_settings")
        .upsert(
          { 
            key: finalKey, 
            value: value as string,
            updated_by: userId,
            updated_at: new Date().toISOString()
          },
          { onConflict: "key" }
        );
    }

    return new Response(
      JSON.stringify({ success: true, message: `${service} keys saved successfully` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error saving API keys:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
