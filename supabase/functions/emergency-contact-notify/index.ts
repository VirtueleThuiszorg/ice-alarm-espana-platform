import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

/**
 * Emergency Contact Notification Function (C2)
 *
 * When an SOS, fall, or other critical alert fires, this function notifies
 * the member's emergency contacts via SMS (Twilio) and email.
 *
 * Called from: ev07b-checkin, ev07b-sos-alert
 * Expects: { alert_id, member_id }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { alert_id, member_id } = await req.json();

    if (!alert_id || !member_id) {
      return new Response(
        JSON.stringify({ error: "alert_id and member_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch the alert details
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .select("id, alert_type, message, location_lat, location_lng, location_address")
      .eq("id", alert_id)
      .single();

    if (alertError || !alert) {
      console.error("Alert not found:", alertError);
      return new Response(
        JSON.stringify({ error: "Alert not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch the member
    const { data: member } = await supabase
      .from("members")
      .select("id, first_name, last_name, preferred_language")
      .eq("id", member_id)
      .single();

    if (!member) {
      return new Response(
        JSON.stringify({ error: "Member not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const memberName = `${member.first_name || ""} ${member.last_name || ""}`.trim() || "Unknown";

    // Fetch emergency contacts ordered by priority
    const { data: contacts, error: contactsError } = await supabase
      .from("emergency_contacts")
      .select("id, contact_name, phone, email, speaks_spanish, priority_order, relationship")
      .eq("member_id", member_id)
      .order("priority_order", { ascending: true });

    if (contactsError || !contacts || contacts.length === 0) {
      console.log("No emergency contacts found for member:", member_id);
      return new Response(
        JSON.stringify({ success: true, notified: 0, reason: "no_contacts" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch Twilio credentials
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "settings_twilio_account_sid",
        "settings_twilio_auth_token",
        "settings_twilio_phone_number",
      ]);

    const twilioConfig = (settings || []).reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);

    const hasTwilio = !!(
      twilioConfig.settings_twilio_account_sid &&
      twilioConfig.settings_twilio_auth_token &&
      twilioConfig.settings_twilio_phone_number
    );

    // Alert type labels for messages
    const alertLabels: Record<string, { en: string; es: string }> = {
      sos_button: { en: "SOS Emergency", es: "Emergencia SOS" },
      fall_detected: { en: "Fall Detected", es: "Caída Detectada" },
      geo_fence: { en: "Geofence Alert", es: "Alerta de Geovalla" },
      low_battery: { en: "Low Battery Alert", es: "Alerta de Batería Baja" },
      device_offline: { en: "Device Offline", es: "Dispositivo Sin Conexión" },
    };

    const alertLabel = alertLabels[alert.alert_type] || {
      en: "Emergency Alert",
      es: "Alerta de Emergencia",
    };

    // Location info for messages
    let locationText = "";
    if (alert.location_lat && alert.location_lng) {
      locationText = alert.location_address
        ? `\n${alert.location_address}`
        : `\nhttps://maps.google.com/?q=${alert.location_lat},${alert.location_lng}`;
    }

    const results: Array<{ contact_id: string; sms: boolean; email: boolean }> = [];

    for (const contact of contacts) {
      const useSpanish = contact.speaks_spanish;
      const result = { contact_id: contact.id, sms: false, email: false };

      // Build message (bilingual based on contact preference)
      const smsMessage = useSpanish
        ? `ICE Alarm - ${alertLabel.es}: ${memberName} necesita ayuda. ${alert.message || ""}${locationText}\nLlame al 112 si es necesario.`
        : `ICE Alarm - ${alertLabel.en}: ${memberName} needs help. ${alert.message || ""}${locationText}\nCall 112 if necessary.`;

      // --- Send SMS via Twilio ---
      if (hasTwilio && contact.phone) {
        try {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.settings_twilio_account_sid}/Messages.json`;
          const auth = btoa(
            `${twilioConfig.settings_twilio_account_sid}:${twilioConfig.settings_twilio_auth_token}`
          );

          const smsResponse = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: contact.phone,
              From: twilioConfig.settings_twilio_phone_number,
              Body: smsMessage,
            }),
          });

          const smsData = await smsResponse.json();
          result.sms = smsResponse.ok;

          // Log SMS communication
          await supabase.from("alert_communications").insert({
            alert_id: alert.id,
            communication_type: "sms",
            direction: "outbound",
            recipient_type: "emergency_contact",
            recipient_phone: contact.phone,
            message_content: smsMessage,
            twilio_sid: smsData.sid || null,
          });

          console.log(`SMS sent to ${contact.contact_name}:`, smsResponse.ok);
        } catch (smsErr) {
          console.error(`SMS failed for ${contact.contact_name}:`, smsErr);
        }
      }

      // --- Send email ---
      if (contact.email) {
        try {
          const subject = useSpanish
            ? `ICE Alarm - ${alertLabel.es} para ${memberName}`
            : `ICE Alarm - ${alertLabel.en} for ${memberName}`;

          const mapLink =
            alert.location_lat && alert.location_lng
              ? `https://maps.google.com/?q=${alert.location_lat},${alert.location_lng}`
              : null;

          const emailHtml = useSpanish
            ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#dc2626;">ICE Alarm - ${alertLabel.es}</h2>
                <p><strong>${memberName}</strong> ha activado una alerta de emergencia.</p>
                <p><strong>Tipo:</strong> ${alertLabel.es}</p>
                ${alert.message ? `<p><strong>Mensaje:</strong> ${alert.message}</p>` : ""}
                ${mapLink ? `<p><strong>Ubicación:</strong> <a href="${mapLink}">Ver en mapa</a></p>` : ""}
                ${alert.location_address ? `<p><strong>Dirección:</strong> ${alert.location_address}</p>` : ""}
                <p style="color:#dc2626;font-weight:bold;">Si cree que es una emergencia real, llame al 112 inmediatamente.</p>
                <hr><p style="color:#6b7280;font-size:12px;">Este es un mensaje automático de ICE Alarm España.</p>
              </div>`
            : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#dc2626;">ICE Alarm - ${alertLabel.en}</h2>
                <p><strong>${memberName}</strong> has triggered an emergency alert.</p>
                <p><strong>Type:</strong> ${alertLabel.en}</p>
                ${alert.message ? `<p><strong>Message:</strong> ${alert.message}</p>` : ""}
                ${mapLink ? `<p><strong>Location:</strong> <a href="${mapLink}">View on map</a></p>` : ""}
                ${alert.location_address ? `<p><strong>Address:</strong> ${alert.location_address}</p>` : ""}
                <p style="color:#dc2626;font-weight:bold;">If you believe this is a real emergency, call 112 immediately.</p>
                <hr><p style="color:#6b7280;font-size:12px;">This is an automated message from ICE Alarm España.</p>
              </div>`;

          const emailResult = await sendEmail(contact.email, subject, emailHtml);
          result.email = emailResult.success;

          // Log email communication
          await supabase.from("alert_communications").insert({
            alert_id: alert.id,
            communication_type: "email",
            direction: "outbound",
            recipient_type: "emergency_contact",
            recipient_phone: contact.email,
            message_content: subject,
          });

          console.log(`Email sent to ${contact.contact_name}:`, emailResult.success);
        } catch (emailErr) {
          console.error(`Email failed for ${contact.contact_name}:`, emailErr);
        }
      }

      results.push(result);
    }

    const notified = results.filter((r) => r.sms || r.email).length;
    console.log(`Emergency contacts notified: ${notified}/${contacts.length} for alert ${alert_id}`);

    return new Response(
      JSON.stringify({ success: true, notified, total: contacts.length, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Emergency contact notification error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
