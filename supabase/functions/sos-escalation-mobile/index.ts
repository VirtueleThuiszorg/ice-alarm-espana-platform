/**
 * SOS Escalation Mobile — TwiML handler for escalation calls to staff mobiles.
 *
 * When called by Twilio (outbound), says the alert info and offers press-1-to-join.
 * If staff presses 1: update escalation to responded, route into conference.
 * action=respond handles the keypress callback.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "sos-escalation-mobile";

function esc(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(body: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return twiml(`<Say>Invalid request.</Say><Hangup/>`);
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "initial";
    const alertId = url.searchParams.get("alert_id") || "";
    const memberName = decodeURIComponent(url.searchParams.get("member_name") || "a member");
    const alertType = decodeURIComponent(url.searchParams.get("alert_type") || "sos").replace("_", " ");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const baseUrl = Deno.env.get("SUPABASE_URL")!;

    // ── INITIAL: announce and gather ────────────────────────────
    if (action === "initial") {
      const respondUrl = `${baseUrl}/functions/v1/${FN}?action=respond&alert_id=${encodeURIComponent(alertId)}&member_name=${encodeURIComponent(memberName)}`;

      console.log(`[${FN}] Escalation call for alert ${alertId} (${alertType}, ${memberName})`);

      return twiml(
        `<Say language="en-GB" voice="Polly.Amy">` +
          `You have an unaccepted emergency alert for ${esc(memberName)}. Alert type: ${esc(alertType)}. Press 1 to join the call now.` +
          `</Say>` +
          `<Say language="es-ES" voice="Polly.Lucia">` +
          `Tiene una alerta de emergencia sin aceptar para ${esc(memberName)}. Tipo de alerta: ${esc(alertType)}. Pulse 1 para unirse a la llamada.` +
          `</Say>` +
          `<Gather numDigits="1" action="${esc(respondUrl)}" method="POST" timeout="15">` +
            `<Say language="en-GB" voice="Polly.Amy">Press 1 now.</Say>` +
          `</Gather>` +
          `<Say language="en-GB" voice="Polly.Amy">No response received. Goodbye.</Say>` +
          `<Hangup/>`,
      );
    }

    // ── RESPOND: staff pressed a key ────────────────────────────
    if (action === "respond") {
      const fd = await req.formData();
      const digits = (fd.get("Digits") as string) || "";
      const callSid = (fd.get("CallSid") as string) || "";
      const from = (fd.get("From") as string) || "";

      console.log(`[${FN}] Response: digits=${digits} alert=${alertId}`);

      if (digits !== "1") {
        return twiml(
          `<Say language="en-GB" voice="Polly.Amy">Goodbye.</Say><Hangup/>`,
        );
      }

      // Find the staff member by phone
      const normalizedPhone = from.replace("+", "");
      const { data: staff } = await sb
        .from("staff")
        .select("id")
        .or(`personal_mobile.eq.${from},personal_mobile.eq.${normalizedPhone}`)
        .maybeSingle();

      // Update escalation record
      await sb
        .from("alert_escalations")
        .update({
          responded: true,
          responded_at: new Date().toISOString(),
          response_method: "mobile_keypress",
        })
        .eq("alert_id", alertId)
        .eq("target_phone", from)
        .eq("responded", false);

      // Accept the alert
      const updateData: Record<string, unknown> = {
        status: "in_progress",
        accepted_at: new Date().toISOString(),
      };
      if (staff?.id) updateData.accepted_by_staff_id = staff.id;

      await sb
        .from("alerts")
        .update(updateData)
        .eq("id", alertId)
        .is("accepted_by_staff_id", null); // Guard: only if not already accepted

      // Add as conference participant
      const { data: conference } = await sb
        .from("conference_rooms")
        .select("id, conference_name")
        .eq("alert_id", alertId)
        .eq("status", "active")
        .maybeSingle();

      if (conference) {
        await sb.from("conference_participants").insert({
          conference_id: conference.id,
          participant_type: "staff",
          participant_name: "Mobile Staff",
          phone_number: from,
          twilio_call_sid: callSid,
          staff_id: staff?.id || null,
          join_method: "added_by_staff",
        });

        // Route into the conference
        const statusUrl = `${baseUrl}/functions/v1/sos-conference-status`;
        return twiml(
          `<Say language="en-GB" voice="Polly.Amy">Connecting you to the conference now.</Say>` +
            `<Dial>` +
              `<Conference statusCallback="${esc(statusUrl)}" ` +
                `statusCallbackEvent="start end join leave mute" ` +
                `record="record-from-start">` +
                `${esc(conference.conference_name)}` +
              `</Conference>` +
            `</Dial>`,
        );
      }

      return twiml(
        `<Say language="en-GB" voice="Polly.Amy">Alert accepted. No conference available. Please open the dashboard.</Say><Hangup/>`,
      );
    }

    return twiml(`<Say>Unknown action.</Say><Hangup/>`);
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return twiml(`<Say>Technical error. Please try again.</Say><Hangup/>`);
  }
});
