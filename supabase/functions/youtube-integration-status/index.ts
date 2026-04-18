import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



const EXPECTED_CHANNEL_ID = "UCT9_R7Czan0lPFvq5XyV5kg";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is authenticated
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

    // Get integration status
    const { data: integration, error } = await supabase
      .from("system_integrations")
      .select("*")
      .eq("integration_type", "youtube")
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (!integration) {
      return new Response(JSON.stringify({
        connected: false,
        channel_id: null,
        channel_name: null,
        last_used_at: null,
        channel_mismatch: false,
        expected_channel_id: EXPECTED_CHANNEL_ID,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if token is expired
    const isExpired = integration.expires_at && new Date(integration.expires_at) < new Date();

    return new Response(JSON.stringify({
      connected: integration.status === "connected" && !isExpired,
      channel_id: integration.channel_id,
      channel_name: integration.channel_name,
      last_used_at: integration.last_used_at,
      connected_at: integration.connected_at,
      thumbnail_url: integration.metadata?.thumbnail_url,
      channel_mismatch: integration.channel_id !== EXPECTED_CHANNEL_ID,
      expected_channel_id: EXPECTED_CHANNEL_ID,
      status: isExpired ? "expired" : integration.status,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("YouTube integration status error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
