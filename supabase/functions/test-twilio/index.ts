import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



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

    // Get Twilio credentials (with settings_ prefix)
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "settings_twilio_account_sid",
        "settings_twilio_auth_token"
      ]);

    const config: Record<string, string> = {};
    settings?.forEach((s) => {
      config[s.key] = s.value;
    });

    const accountSid = config.settings_twilio_account_sid;
    const authToken = config.settings_twilio_auth_token;

    if (!accountSid) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Account SID not configured" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!authToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Auth Token not configured" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test credentials by fetching account info
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
    const auth = btoa(`${accountSid}:${authToken}`);

    const response = await fetch(twilioUrl, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${auth}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `✓ Connected to Twilio account "${data.friendly_name}"`,
          account_name: data.friendly_name,
          account_status: data.status
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Parse Twilio error
      const errorMessage = data.message || data.detail || "Authentication failed";
      const errorCode = data.code || response.status;
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Twilio error ${errorCode}: ${errorMessage}` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("test-twilio error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
