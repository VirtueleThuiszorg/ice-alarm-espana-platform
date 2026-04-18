import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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

    // Get Twilio credentials from settings
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "settings_twilio_account_sid",
        "settings_twilio_auth_token",
        "settings_twilio_phone_number"
      ]);

    const twilioConfig = settings?.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>) || {};

    if (!twilioConfig.settings_twilio_account_sid || !twilioConfig.settings_twilio_auth_token) {
      return new Response(
        JSON.stringify({ error: "Twilio not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "incoming") {
      // Handle incoming SMS
      const formData = await req.formData();
      const from = formData.get("From") as string;
      const body = formData.get("Body") as string;
      const messageSid = formData.get("MessageSid") as string;

      console.log("Incoming SMS from:", from, "Body:", body);

      // Sanitize phone to only digits and +
      const phoneClean = from.replace(/[^0-9+]/g, "");
      const phoneWithoutPlus = phoneClean.replace("+", "");

      // Validate phone format (E.164)
      if (!/^\+?[1-9]\d{1,14}$/.test(phoneClean)) {
        console.warn(`Invalid phone format from Twilio: ${from}`);
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
          headers: { ...corsHeaders, "Content-Type": "application/xml" },
        });
      }

      // Find member by phone using separate queries to avoid SQL injection
      let member = null;
      const { data: memberByExact } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("phone", phoneClean)
        .maybeSingle();
      
      if (memberByExact) {
        member = memberByExact;
      } else {
        const { data: memberByNormalized } = await supabase
          .from("members")
          .select("id, first_name, last_name")
          .eq("phone", phoneWithoutPlus)
          .maybeSingle();
        member = memberByNormalized;
      }

      // Log the incoming message
      if (member) {
        // Check for active alert
        const { data: activeAlert } = await supabase
          .from("alerts")
          .select("id")
          .eq("member_id", member.id)
          .in("status", ["incoming", "in_progress"])
          .order("received_at", { ascending: false })
          .limit(1)
          .single();

        if (activeAlert) {
          await supabase.from("alert_communications").insert({
            alert_id: activeAlert.id,
            communication_type: "sms",
            direction: "inbound",
            recipient_type: "member",
            recipient_phone: from,
            message_content: body,
            twilio_sid: messageSid
          });
        }
      }

      // TwiML response
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Gracias por contactar ICE Alarm. Un operador revisará su mensaje. / Thank you for contacting ICE Alarm. An operator will review your message.</Message>
</Response>`;

      return new Response(twiml, {
        headers: { ...corsHeaders, "Content-Type": "application/xml" },
      });
    }

    // Send SMS (requires auth)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, message, alertId, recipientType = "member" } = await req.json();

    // Send SMS using Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.settings_twilio_account_sid}/Messages.json`;
    const auth = btoa(`${twilioConfig.settings_twilio_account_sid}:${twilioConfig.settings_twilio_auth_token}`);

    const smsResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: twilioConfig.settings_twilio_phone_number || "+34900000000",
        Body: message,
      }),
    });

    const smsData = await smsResponse.json();

    // Log communication
    if (alertId) {
      await supabase.from("alert_communications").insert({
        alert_id: alertId,
        communication_type: "sms",
        direction: "outbound",
        recipient_type: recipientType,
        recipient_phone: to,
        message_content: message,
        twilio_sid: smsData.sid,
        staff_id: claimsData.claims.sub
      });
    }

    return new Response(
      JSON.stringify(smsData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Twilio SMS error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
