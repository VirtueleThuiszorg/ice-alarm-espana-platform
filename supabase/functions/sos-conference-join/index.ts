/**
 * SOS Conference Join — adds a participant to an active SOS conference.
 *
 * POST { conference_id, participant_type, participant_name,
 *        phone_number?, staff_id?, emergency_contact_id?, join_method }
 *
 * For phone participants: places Twilio outbound call into the conference.
 * For browser staff: generates a Twilio Access Token JWT (via jose).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  loadTwilioCredentials,
  twilioAuth,
} from "../_shared/twilio-credentials.ts";
import { SignJWT } from "npm:jose@5";

const FN = "sos-conference-join";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jh },
    );
  }

  try {
    // Verify authenticated staff
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: jh },
      );
    }

    // Service role client for DB operations
    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      conference_id,
      participant_type,
      participant_name,
      phone_number,
      staff_id,
      emergency_contact_id,
      join_method,
    } = await req.json();

    if (!conference_id || !participant_type || !participant_name) {
      return new Response(
        JSON.stringify({
          error: "conference_id, participant_type, and participant_name are required",
        }),
        { status: 400, headers: jh },
      );
    }

    // Get conference details
    const { data: conference } = await sbAdmin
      .from("conference_rooms")
      .select("id, conference_name, status")
      .eq("id", conference_id)
      .eq("status", "active")
      .single();

    if (!conference) {
      return new Response(
        JSON.stringify({ error: "Conference not found or not active" }),
        { status: 404, headers: jh },
      );
    }

    const creds = await loadTwilioCredentials(sbAdmin);
    const baseUrl = Deno.env.get("SUPABASE_URL")!;

    // Insert participant record
    const participantRecord: Record<string, unknown> = {
      conference_id,
      participant_type,
      participant_name,
      phone_number: phone_number || null,
      staff_id: staff_id || null,
      emergency_contact_id: emergency_contact_id || null,
      join_method: join_method || "added_by_staff",
    };

    const { data: participant, error: insertError } = await sbAdmin
      .from("conference_participants")
      .insert(participantRecord)
      .select("id")
      .single();

    if (insertError) {
      console.error(`[${FN}] Insert participant error:`, insertError);
      return new Response(
        JSON.stringify({ error: "Failed to add participant" }),
        { status: 500, headers: jh },
      );
    }

    // ── Phone participant: Twilio outbound call ─────────────────
    if (phone_number && participant_type !== "staff") {
      const voiceUrl =
        `${baseUrl}/functions/v1/voice-handler?action=conference-join&conference_name=${encodeURIComponent(conference.conference_name)}`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls.json`;
      const callRes = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${twilioAuth(creds.accountSid, creds.authToken)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone_number,
          From: creds.sosNumber,
          Url: voiceUrl,
          Method: "POST",
          StatusCallback: `${baseUrl}/functions/v1/sos-conference-status`,
          StatusCallbackMethod: "POST",
          StatusCallbackEvent: "initiated ringing answered completed",
        }),
      });

      if (!callRes.ok) {
        const errText = await callRes.text();
        console.error(`[${FN}] Twilio call error:`, callRes.status, errText);
        return new Response(
          JSON.stringify({
            error: "Failed to place outbound call",
            participant: participant,
          }),
          { status: 502, headers: jh },
        );
      }

      const callData = await callRes.json();
      // Update participant with call SID
      await sbAdmin
        .from("conference_participants")
        .update({ twilio_call_sid: callData.sid })
        .eq("id", participant.id);

      console.log(
        `[${FN}] Outbound call ${callData.sid} to ${phone_number} for conference ${conference_id}`,
      );

      return new Response(
        JSON.stringify({
          participant,
          conference_name: conference.conference_name,
        }),
        { headers: jh },
      );
    }

    // ── Browser staff: generate Twilio Access Token JWT ─────────
    if (participant_type === "staff" && staff_id) {
      if (!creds.apiKeySid || !creds.apiKeySecret || !creds.twimlAppSid) {
        return new Response(
          JSON.stringify({
            error: "Twilio API key credentials not configured for browser calling",
          }),
          { status: 503, headers: jh },
        );
      }

      const identity = `staff-${staff_id}`;
      const now = Math.floor(Date.now() / 1000);
      const ttl = 3600;

      const jwt = await new SignJWT({
        jti: `${creds.apiKeySid}-${now}`,
        iss: creds.apiKeySid,
        sub: creds.accountSid,
        nbf: now,
        exp: now + ttl,
        grants: {
          identity,
          voice: {
            incoming: { allow: true },
            outgoing: { application_sid: creds.twimlAppSid },
          },
        },
      })
        .setProtectedHeader({
          typ: "JWT",
          alg: "HS256",
          cty: "twilio-fpa;v=1",
        })
        .sign(new TextEncoder().encode(creds.apiKeySecret));

      console.log(
        `[${FN}] Browser token generated for ${identity} in conference ${conference_id}`,
      );

      return new Response(
        JSON.stringify({
          participant,
          token: jwt,
          identity,
          conference_name: conference.conference_name,
        }),
        { headers: jh },
      );
    }

    // Default: participant added but no call/token needed (e.g., AI)
    return new Response(
      JSON.stringify({
        participant,
        conference_name: conference.conference_name,
      }),
      { headers: jh },
    );
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: jh },
    );
  }
});
