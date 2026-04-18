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

    // Get Twilio credentials from settings
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "settings_twilio_account_sid",
        "settings_twilio_auth_token",
        "settings_twilio_whatsapp_number"
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
      // Handle incoming WhatsApp message
      const formData = await req.formData();
      const rawFrom = (formData.get("From") as string)?.replace("whatsapp:", "");
      const body = formData.get("Body") as string;
      const messageSid = formData.get("MessageSid") as string;

      // Sanitize phone number — strip everything except digits and +
      const from = (rawFrom || "").replace(/[^\d+]/g, "");
      const phoneWithoutPlus = from.replace("+", "");

      console.log("Incoming WhatsApp from:", from, "Body:", body);

      // Find member by phone (sanitized input prevents injection via .or())
      const { data: member } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .or(`phone.eq.${from},phone.eq.${phoneWithoutPlus}`)
        .single();

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
            communication_type: "whatsapp",
            direction: "inbound",
            recipient_type: "member",
            recipient_phone: from,
            message_content: body,
            twilio_sid: messageSid
          });
        }
      }

      // Response message
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Gracias por contactar ICE Alarm por WhatsApp. Un operador le atenderá pronto. / Thank you for contacting ICE Alarm via WhatsApp. An operator will assist you shortly.</Message>
</Response>`;

      return new Response(twiml, {
        headers: { ...corsHeaders, "Content-Type": "application/xml" },
      });
    }

    // Send WhatsApp message (requires auth)
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

    // Send WhatsApp using Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.settings_twilio_account_sid}/Messages.json`;
    const auth = btoa(`${twilioConfig.settings_twilio_account_sid}:${twilioConfig.settings_twilio_auth_token}`);

    const whatsappFrom = twilioConfig.settings_twilio_whatsapp_number || "+34900000000";
    
    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${whatsappFrom}`,
        Body: message,
      }),
    });

    const responseData = await response.json();

    // Log communication
    if (alertId) {
      await supabase.from("alert_communications").insert({
        alert_id: alertId,
        communication_type: "whatsapp",
        direction: "outbound",
        recipient_type: recipientType,
        recipient_phone: to,
        message_content: message,
        twilio_sid: responseData.sid,
        staff_id: claimsData.claims.sub
      });
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Twilio WhatsApp error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
