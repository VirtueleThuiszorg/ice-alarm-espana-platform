import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * Notify Staff WhatsApp
 *
 * Sends WhatsApp messages directly to individual staff members
 * for shift-related alerts (no-show reminders, disconnection notices).
 */

interface StaffNotifyPayload {
  staff_id: string;
  message_type: "no_show" | "disconnected";
  staff_name: string;
  phone_number: string;
  shift_type: string;
}

const SHIFT_LABELS: Record<string, string> = {
  morning: "Morning (07:00-15:00)",
  afternoon: "Afternoon (15:00-23:00)",
  night: "Night (23:00-07:00)",
};

function formatMessage(payload: StaffNotifyPayload): string {
  const shiftLabel = SHIFT_LABELS[payload.shift_type] || payload.shift_type;

  switch (payload.message_type) {
    case "no_show":
      return `Hi ${payload.staff_name}, you're scheduled for the ${shiftLabel} shift but haven't signed in yet. Please log in to the call centre now or contact your supervisor.`;

    case "disconnected":
      return `Hi ${payload.staff_name}, your connection to the call centre was lost while you were on duty. Please check your internet connection and log back in as soon as possible.`;

    default:
      return `Hi ${payload.staff_name}, please check your shift status in the call centre dashboard.`;
  }
}

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

    const body: StaffNotifyPayload = await req.json();
    const { staff_id, message_type, staff_name, phone_number, shift_type } = body;

    console.log(`notify-staff-whatsapp: ${message_type} to ${staff_name} (${phone_number})`);

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: "No phone number provided", sent: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Twilio credentials
    const { data: twilioSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "settings_twilio_account_sid",
        "settings_twilio_auth_token",
        "settings_twilio_api_key_sid",
        "settings_twilio_api_key_secret",
        "settings_twilio_whatsapp_number",
      ]);

    const twilioConfig: Record<string, string> = {};
    twilioSettings?.forEach((s) => {
      twilioConfig[s.key] = s.value;
    });

    const authUsername = twilioConfig.settings_twilio_api_key_sid || twilioConfig.settings_twilio_account_sid;
    const authPassword = twilioConfig.settings_twilio_api_key_secret || twilioConfig.settings_twilio_auth_token;

    if (!twilioConfig.settings_twilio_account_sid || !authPassword || !twilioConfig.settings_twilio_whatsapp_number) {
      console.error("Twilio not fully configured for staff notifications");
      return new Response(
        JSON.stringify({ error: "Twilio not configured", sent: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = formatMessage(body);

    // Send WhatsApp via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.settings_twilio_account_sid}/Messages.json`;
    const authHeader = btoa(`${authUsername}:${authPassword}`);

    const formData = new URLSearchParams();
    formData.append("From", `whatsapp:${twilioConfig.settings_twilio_whatsapp_number}`);
    formData.append("To", `whatsapp:${phone_number}`);
    formData.append("Body", message);

    let status = "pending";
    let providerMessageId = null;
    let error = null;

    try {
      const twilioResponse = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const twilioResult = await twilioResponse.json();

      if (twilioResponse.ok) {
        status = "sent";
        providerMessageId = twilioResult.sid;
        console.log(`Staff WhatsApp sent: ${twilioResult.sid}`);
      } else {
        status = "failed";
        error = twilioResult.message || "Twilio error";
        console.error("Twilio error:", twilioResult);
      }
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : "Unknown error";
      console.error("WhatsApp send error:", e);
    }

    // Log to notification_log
    await supabase.from("notification_log").insert({
      admin_user_id: staff_id, // Using staff_id as the recipient identifier
      event_type: `shift.${message_type}`,
      entity_type: "staff",
      entity_id: staff_id,
      message,
      status,
      provider_message_id: providerMessageId,
      error,
    });

    return new Response(
      JSON.stringify({ success: status === "sent", status, provider_message_id: providerMessageId, error }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("notify-staff-whatsapp error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
