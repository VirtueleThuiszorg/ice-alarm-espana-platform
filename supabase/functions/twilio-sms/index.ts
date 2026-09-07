import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTwilioNumbers, warnIfSmsNumberCannotSendSms } from "../_shared/twilio-numbers.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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
      /*
        SIGNATURE FIRST, AND IT REFUSES. This handler now WRITES INTO A MEMBER'S CONVERSATION,
        so an unsigned POST with `From=<a member's phone>` would put words in that member's
        mouth in their own thread. `_shared/twilio-signature.ts` says why "log and proceed" is
        not an option here.
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
        console.warn(`twilio-sms: refusing unsigned inbound (${verdict.reason})`);
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      const from = params.From ?? "";
      const body = params.Body ?? "";
      const messageSid = params.MessageSid ?? "";

      const outcome = await recordInboundMessage(supabase as unknown as InboundDb, {
        from,
        body,
        providerSid: messageSid,
        channel: "sms",
      });

      // UNCHANGED, and deliberately still here: during an open alert the same text also belongs
      // on the alert record. Removing it to avoid "writing twice" would delete evidence from the
      // SOS path, where the two records answer different questions.
      if (outcome.status === "stored" || outcome.status === "duplicate") {
        const phoneClean = from.replace(/[^0-9+]/g, "");
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
              communication_type: "sms",
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

    const twilioNumbers = await loadTwilioNumbers(supabase);
    warnIfSmsNumberCannotSendSms(twilioNumbers, "twilio-sms");
    const smsFrom = twilioNumbers.sms;

    const smsResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: smsFrom,
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
