import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTwilioNumbers, warnIfSmsNumberCannotSendSms } from "../_shared/twilio-numbers.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";
import {
  NOTIFY_OUTCOME_STATUS,
  resultForAttempted,
  resultForNoContacts,
  resultForUnreadable,
  type NotifyResult,
} from "../_shared/contact-notify-outcome.ts";

/**
 * Emergency Contact Notification Function (C2)
 *
 * When an SOS, fall, or other critical alert fires, this function notifies
 * the member's emergency contacts via SMS (Twilio) and email.
 *
 * Called from: ev07b-checkin, ev07b-sos-alert
 * Expects: { alert_id, member_id }
 *
 * Returns a discriminated union on `outcome` — notified / all_failed / no_contacts /
 * contacts_unreadable — with a non-2xx status on every outcome that is not `notified`.
 * `success: true` means contacts were actually reached and nothing else. See
 * _shared/contact-notify-outcome.ts for why, and READINESS_MODEL.md §5 for the outcome table.
 */
/** One place that maps an outcome to its status code, so no branch can drift back to 200. */
function respond(result: NotifyResult, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ...result, ...extra }), {
    status: NOTIFY_OUTCOME_STATUS[result.outcome],
    headers: { "Content-Type": "application/json" },
  });
}

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

    // A failed READ and an empty table are OPPOSITE facts and must not share a response:
    // "I read the table and it was empty" vs "I could not read the table, and there may well
    // be contacts I have just failed to call". They were folded into one branch, which meant
    // an outage in this read was indistinguishable from a member who was never set up.
    if (contactsError) {
      console.error(
        JSON.stringify({
          fn: "emergency-contact-notify",
          event: "contacts_unreadable",
          alert_id,
          member_id,
          error: contactsError.message,
        })
      );
      return respond(resultForUnreadable());
    }

    if (!contacts || contacts.length === 0) {
      // NOT a success. Nobody can be called for this member. The caller fires the loud admin
      // alert; the escalation ladder treats its terminal tier as a failure to escalate.
      console.error(
        JSON.stringify({
          fn: "emergency-contact-notify",
          event: "no_emergency_contacts",
          alert_id,
          member_id,
        })
      );
      return respond(resultForNoContacts());
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

    // Which number the SMS goes out FROM is now its own setting: this alert is
    // the reason the split exists. See _shared/twilio-numbers.ts.
    const twilioNumbers = await loadTwilioNumbers(supabase);
    warnIfSmsNumberCannotSendSms(twilioNumbers, "emergency-contact-notify");

    const twilioConfig = (settings || []).reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);

    const hasTwilio = !!(
      twilioConfig.settings_twilio_account_sid &&
      twilioConfig.settings_twilio_auth_token &&
      twilioNumbers.sms
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
        ? `ICE Alarm España - ${alertLabel.es}: ${memberName} necesita ayuda. ${alert.message || ""}${locationText}\nLlame al 112 si es necesario.`
        : `ICE Alarm España - ${alertLabel.en}: ${memberName} needs help. ${alert.message || ""}${locationText}\nCall 112 if necessary.`;

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
              From: twilioNumbers.sms,
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
            ? `ICE Alarm España - ${alertLabel.es} para ${memberName}`
            : `ICE Alarm España - ${alertLabel.en} for ${memberName}`;

          const mapLink =
            alert.location_lat && alert.location_lng
              ? `https://maps.google.com/?q=${alert.location_lat},${alert.location_lng}`
              : null;

          const emailHtml = useSpanish
            ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#C8102E;">ICE Alarm España - ${alertLabel.es}</h2>
                <p><strong>${memberName}</strong> ha activado una alerta de emergencia.</p>
                <p><strong>Tipo:</strong> ${alertLabel.es}</p>
                ${alert.message ? `<p><strong>Mensaje:</strong> ${alert.message}</p>` : ""}
                ${mapLink ? `<p><strong>Ubicación:</strong> <a href="${mapLink}">Ver en mapa</a></p>` : ""}
                ${alert.location_address ? `<p><strong>Dirección:</strong> ${alert.location_address}</p>` : ""}
                <p style="color:#C8102E;font-weight:bold;">Si cree que es una emergencia real, llame al 112 inmediatamente.</p>
                <hr><p style="color:#6b7280;font-size:12px;">Este es un mensaje automático de ICE Alarm España.</p>
              </div>`
            : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#C8102E;">ICE Alarm España - ${alertLabel.en}</h2>
                <p><strong>${memberName}</strong> has triggered an emergency alert.</p>
                <p><strong>Type:</strong> ${alertLabel.en}</p>
                ${alert.message ? `<p><strong>Message:</strong> ${alert.message}</p>` : ""}
                ${mapLink ? `<p><strong>Location:</strong> <a href="${mapLink}">View on map</a></p>` : ""}
                ${alert.location_address ? `<p><strong>Address:</strong> ${alert.location_address}</p>` : ""}
                <p style="color:#C8102E;font-weight:bold;">If you believe this is a real emergency, call 112 immediately.</p>
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
    const result = resultForAttempted(notified, contacts.length);
    console.log(
      JSON.stringify({
        fn: "emergency-contact-notify",
        event: "notify_complete",
        outcome: result.outcome,
        alert_id,
        notified,
        total: contacts.length,
      })
    );

    // `all_failed` (contacts existed, every channel failed for every one) is also not a
    // success and also carries a non-2xx status.
    return respond(result, { results });
  } catch (error) {
    console.error("Emergency contact notification error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
