// Twilio Outbound Call Handler - staff-initiated outbound calls
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { to, alertId } = await req.json();

    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["settings_twilio_account_sid", "settings_twilio_auth_token", "settings_twilio_phone_number"]);

    const twilioConfig = settings?.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {} as Record<string, string>) || {};

    if (!twilioConfig.settings_twilio_account_sid || !twilioConfig.settings_twilio_auth_token) {
      return new Response(JSON.stringify({ error: "Twilio not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = Deno.env.get("SUPABASE_URL");
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.settings_twilio_account_sid}/Calls.json`;
    const auth = btoa(`${twilioConfig.settings_twilio_account_sid}:${twilioConfig.settings_twilio_auth_token}`);

    const callResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        To: to,
        From: twilioConfig.settings_twilio_phone_number || "+34900000000",
        Record: "true",
        StatusCallback: `${baseUrl}/functions/v1/twilio-voice?action=status`,
        RecordingStatusCallback: `${baseUrl}/functions/v1/twilio-voice?action=recording`,
        Url: `${baseUrl}/functions/v1/twilio-voice?action=incoming`,
      }),
    });

    const callData = await callResponse.json();

    if (alertId) {
      await supabase.from("alert_communications").insert({
        alert_id: alertId,
        communication_type: "voice",
        direction: "outbound",
        recipient_type: "member",
        recipient_phone: to,
        twilio_sid: callData.sid,
        staff_id: user.id
      });
    }

    return new Response(JSON.stringify(callData), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Twilio outbound error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
