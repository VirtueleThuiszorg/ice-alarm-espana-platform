/**
 * SOS Inbound Router — handles emergency contact callbacks.
 *
 * When an emergency contact calls back:
 * - Initial: checks if their phone matches an emergency_contact with an active alert
 * - If match: offers press-1-to-join the conference
 * - respond: routes them into the conference
 *
 * Called from voice-handler when incoming caller matches an emergency_contact.
 * Uses TwiML (POST with query params, Twilio sends form data).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "sos-inbound-router";

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
    const memberName = decodeURIComponent(url.searchParams.get("member_name") || "member");
    const relationship = decodeURIComponent(url.searchParams.get("relationship") || "contact");
    const conferenceName = decodeURIComponent(url.searchParams.get("conference_name") || "");
    const ecId = url.searchParams.get("ec_id") || "";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const baseUrl = Deno.env.get("SUPABASE_URL")!;

    // ── INITIAL: announce and offer to join ──────────────────
    if (action === "initial") {
      const respondUrl = `${baseUrl}/functions/v1/${FN}?action=respond` +
        `&alert_id=${encodeURIComponent(alertId)}` +
        `&member_name=${encodeURIComponent(memberName)}` +
        `&conference_name=${encodeURIComponent(conferenceName)}` +
        `&ec_id=${encodeURIComponent(ecId)}`;

      console.log(`[${FN}] Emergency contact callback for alert ${alertId}, relationship: ${relationship}`);

      return twiml(
        `<Say language="en-GB" voice="Polly.Amy">` +
          `Your ${esc(relationship)}, ${esc(memberName)}, has an active emergency alert with ICE Alarm. Press 1 to join the call.` +
        `</Say>` +
        `<Say language="es-ES" voice="Polly.Lucia">` +
          `Su ${esc(relationship)}, ${esc(memberName)}, tiene una alerta de emergencia activa con ICE Alarm. Pulse 1 para unirse a la llamada.` +
        `</Say>` +
        `<Gather numDigits="1" action="${esc(respondUrl)}" method="POST" timeout="15">` +
          `<Say language="en-GB" voice="Polly.Amy">Press 1 now.</Say>` +
        `</Gather>` +
        `<Say language="en-GB" voice="Polly.Amy">No response received. Goodbye.</Say>` +
        `<Hangup/>`,
      );
    }

    // ── RESPOND: contact pressed a key ──────────────────────
    if (action === "respond") {
      const fd = await req.formData();
      const digits = (fd.get("Digits") as string) || "";
      const callSid = (fd.get("CallSid") as string) || "";
      const from = (fd.get("From") as string) || "";

      console.log(`[${FN}] Response: digits=${digits} alert=${alertId} from=${from}`);

      if (digits !== "1") {
        return twiml(
          `<Say language="en-GB" voice="Polly.Amy">Goodbye.</Say><Hangup/>`,
        );
      }

      // Insert conference participant
      if (conferenceName && alertId) {
        const { data: conference } = await sb
          .from("conference_rooms")
          .select("id")
          .eq("alert_id", alertId)
          .eq("status", "active")
          .maybeSingle();

        if (conference) {
          await sb.from("conference_participants").insert({
            conference_id: conference.id,
            participant_type: "emergency_contact",
            participant_name: `${relationship} (callback)`,
            phone_number: from,
            twilio_call_sid: callSid,
            emergency_contact_id: ecId || null,
            join_method: "callback_routed",
          });
        }
      }

      // Route into the conference
      if (conferenceName) {
        const statusUrl = `${baseUrl}/functions/v1/sos-conference-status`;
        return twiml(
          `<Say language="en-GB" voice="Polly.Amy">Connecting you now.</Say>` +
          `<Dial>` +
            `<Conference statusCallback="${esc(statusUrl)}" ` +
              `statusCallbackEvent="start end join leave mute" ` +
              `record="record-from-start">` +
              `${esc(conferenceName)}` +
            `</Conference>` +
          `</Dial>`,
        );
      }

      return twiml(
        `<Say language="en-GB" voice="Polly.Amy">No active conference found. Please call back later.</Say><Hangup/>`,
      );
    }

    return twiml(`<Say>Unknown action.</Say><Hangup/>`);
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return twiml(`<Say>Technical error. Please try again.</Say><Hangup/>`);
  }
});
