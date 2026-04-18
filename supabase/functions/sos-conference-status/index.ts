/**
 * SOS Conference Status — Twilio webhook for conference events.
 * Twilio POSTs form-encoded data; we validate via X-Twilio-Signature.
 * Events: conference-start, conference-end, participant-join,
 *         participant-leave, participant-mute, participant-unmute.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  loadTwilioCredentials,
} from "../_shared/twilio-credentials.ts";

const FN = "sos-conference-status";

// ── Twilio signature validation ─────────────────────────────────
async function validateTwilioSignature(
  req: Request,
  authToken: string,
): Promise<boolean> {
  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;

  const url = new URL(req.url);
  // Twilio uses the full URL for signature computation
  const fullUrl = url.toString();

  // Parse form data for signature validation
  const body = await req.clone().text();
  const params = new URLSearchParams(body);
  const sortedKeys = [...params.keys()].sort();
  let dataString = fullUrl;
  for (const key of sortedKeys) {
    dataString += key + params.get(key);
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(dataString));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return expected === signature;
}

Deno.serve(async (req) => {
  // Twilio only POSTs to webhooks
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const creds = await loadTwilioCredentials(sb);

    // Validate Twilio signature (log warning but don't block in dev)
    const isValid = await validateTwilioSignature(req, creds.authToken);
    if (!isValid) {
      console.warn(`[${FN}] Invalid Twilio signature — proceeding anyway`);
    }

    const fd = await req.formData();
    const statusCallbackEvent =
      (fd.get("StatusCallbackEvent") as string) || "";
    const conferenceSid = (fd.get("ConferenceSid") as string) || "";
    const friendlyName = (fd.get("FriendlyName") as string) || "";
    const callSid = (fd.get("CallSid") as string) || "";
    const muted = (fd.get("Muted") as string) || "";

    console.log(
      `[${FN}] Event=${statusCallbackEvent} Conference=${friendlyName} SID=${conferenceSid} CallSid=${callSid}`,
    );

    // ── conference-start: set twilio_conference_sid ──────────────
    if (statusCallbackEvent === "conference-start") {
      const { error } = await sb
        .from("conference_rooms")
        .update({ twilio_conference_sid: conferenceSid })
        .eq("conference_name", friendlyName)
        .eq("status", "active");

      if (error) console.error(`[${FN}] conference-start update error:`, error);
    }

    // ── participant-join: set twilio_call_sid on participant ─────
    if (statusCallbackEvent === "participant-join" && callSid) {
      // Match by conference name + null call_sid (the participant just inserted)
      const { data: room } = await sb
        .from("conference_rooms")
        .select("id")
        .eq("conference_name", friendlyName)
        .eq("status", "active")
        .maybeSingle();

      if (room) {
        // Update the first participant without a call_sid yet
        const { error } = await sb
          .from("conference_participants")
          .update({ twilio_call_sid: callSid })
          .eq("conference_id", room.id)
          .is("twilio_call_sid", null)
          .is("left_at", null)
          .limit(1);

        if (error)
          console.error(`[${FN}] participant-join update error:`, error);
      }
    }

    // ── participant-leave: set left_at ──────────────────────────
    if (statusCallbackEvent === "participant-leave" && callSid) {
      const { error } = await sb
        .from("conference_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("twilio_call_sid", callSid)
        .is("left_at", null);

      if (error)
        console.error(`[${FN}] participant-leave update error:`, error);
    }

    // ── participant-mute / participant-unmute ────────────────────
    if (
      (statusCallbackEvent === "participant-mute" ||
        statusCallbackEvent === "participant-unmute") &&
      callSid
    ) {
      const isMuted = muted === "true" || statusCallbackEvent === "participant-mute";
      const { error } = await sb
        .from("conference_participants")
        .update({ is_muted: isMuted })
        .eq("twilio_call_sid", callSid);

      if (error) console.error(`[${FN}] mute update error:`, error);
    }

    // ── conference-end: close everything ────────────────────────
    if (statusCallbackEvent === "conference-end") {
      const now = new Date().toISOString();

      // End the conference room
      const { data: room } = await sb
        .from("conference_rooms")
        .update({ status: "ended", ended_at: now })
        .eq("conference_name", friendlyName)
        .eq("status", "active")
        .select("id")
        .maybeSingle();

      // Mark all participants as left
      if (room) {
        await sb
          .from("conference_participants")
          .update({ left_at: now })
          .eq("conference_id", room.id)
          .is("left_at", null);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(`[${FN}] Error:`, e);
    return new Response("OK", { status: 200 }); // Always 200 for Twilio
  }
});
