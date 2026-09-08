import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { twilioParams, verifyTwilioSignature } from "../_shared/twilio-signature.ts";
import { inboundReply, recordInboundMessage, type InboundDb } from "../_shared/inbound-message.ts";



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
      /*
        SIGNATURE FIRST, AND IT REFUSES — see `_shared/twilio-signature.ts`. This handler writes
        into a member's conversation now; an unsigned POST would let anybody put words in a
        member's mouth in their own thread.
      */
      const form = await req.formData();
      const params = twilioParams(form);
      const verdict = await verifyTwilioSignature({
        authToken: twilioConfig.settings_twilio_auth_token,
        url: req.url,
        params,
        signature: req.headers.get("x-twilio-signature"),
      });
      if (!verdict.valid) {
        console.warn(`twilio-whatsapp: refusing unsigned inbound (${verdict.reason})`);
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      const from = (params.From ?? "").replace("whatsapp:", "");
      const body = params.Body ?? "";
      const messageSid = params.MessageSid ?? "";

      const outcome = await recordInboundMessage(supabase as unknown as InboundDb, {
        from,
        body,
        providerSid: messageSid,
        channel: "whatsapp",
      });

      // UNCHANGED: during an open alert the same message also belongs on the alert record.
      if (outcome.status === "stored" || outcome.status === "duplicate") {
        const phoneClean = from.replace(/[^\d+]/g, "");
        const { data: member } = await supabase
          .from("members")
          .select("id")
          .eq("phone", phoneClean)
          .maybeSingle();
        if (member) {
          const { data: activeAlert } = await supabase
            .from("alerts")
            .select("id")
            .eq("member_id", member.id)
            .in("status", ["incoming", "in_progress"])
            .order("received_at", { ascending: false })
            .limit(1)
            .maybeSingle();

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
      }

      const reply = inboundReply(outcome);
      return new Response(reply.xml, {
        status: reply.httpStatus,
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

    /*
      NO CONFIGURED NUMBER MEANS NO SEND. This read `|| "+34900000000"` — a number this company
      does not own — so with the setting unset every WhatsApp message was addressed FROM a
      stranger's number, rejected by Twilio, and reported back to the caller as an ordinary
      Twilio API response. It looked configured and delivered nothing. Same rule as the emergency
      phone (`noFakeEmergencyNumber.test.ts`): a wrong number is worse than no number.
    */
    const whatsappFrom = twilioConfig.settings_twilio_whatsapp_number;
    if (!whatsappFrom) {
      return new Response(
        JSON.stringify({ error: "WhatsApp sender number is not configured (settings_twilio_whatsapp_number)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    
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
