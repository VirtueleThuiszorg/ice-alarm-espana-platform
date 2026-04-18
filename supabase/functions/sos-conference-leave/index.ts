/**
 * SOS Conference Leave — leave/mute/unmute a conference participant.
 *
 * POST { conference_id, participant_id, action: 'leave'|'mute'|'unmute' }
 * Auth: Bearer token (authenticated staff)
 *
 * Leave: Twilio Conference Participants API (Status=completed), set left_at
 * Mute/unmute: Twilio API (Muted=true/false), update is_muted
 * Handles null twilio_conference_sid gracefully (DB-only updates).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  loadTwilioCredentials,
  twilioAuth,
} from "../_shared/twilio-credentials.ts";

const FN = "sos-conference-leave";

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

    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { conference_id, participant_id, action } = await req.json();

    if (!conference_id || !participant_id || !action) {
      return new Response(
        JSON.stringify({
          error: "conference_id, participant_id, and action are required",
        }),
        { status: 400, headers: jh },
      );
    }

    if (!["leave", "mute", "unmute"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "action must be leave, mute, or unmute" }),
        { status: 400, headers: jh },
      );
    }

    // Get participant + conference details
    const { data: participant } = await sbAdmin
      .from("conference_participants")
      .select("id, twilio_call_sid, conference_id")
      .eq("id", participant_id)
      .eq("conference_id", conference_id)
      .single();

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "Participant not found" }),
        { status: 404, headers: jh },
      );
    }

    const { data: conference } = await sbAdmin
      .from("conference_rooms")
      .select("id, twilio_conference_sid")
      .eq("id", conference_id)
      .single();

    if (!conference) {
      return new Response(
        JSON.stringify({ error: "Conference not found" }),
        { status: 404, headers: jh },
      );
    }

    const creds = await loadTwilioCredentials(sbAdmin);
    const auth = twilioAuth(creds.accountSid, creds.authToken);
    const hasTwilio =
      conference.twilio_conference_sid && participant.twilio_call_sid;

    // ── LEAVE ───────────────────────────────────────────────────
    if (action === "leave") {
      // Twilio API: remove participant from conference
      if (hasTwilio) {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Conferences/${conference.twilio_conference_sid}/Participants/${participant.twilio_call_sid}.json`;
        const res = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ Status: "completed" }),
        });

        if (!res.ok) {
          console.warn(
            `[${FN}] Twilio leave error: ${res.status} ${await res.text()}`,
          );
        }
      }

      // DB update
      await sbAdmin
        .from("conference_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("id", participant_id);

      console.log(`[${FN}] Participant ${participant_id} left conference ${conference_id}`);

      return new Response(
        JSON.stringify({ success: true, action: "leave" }),
        { headers: jh },
      );
    }

    // ── MUTE / UNMUTE ───────────────────────────────────────────
    const isMute = action === "mute";

    if (hasTwilio) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Conferences/${conference.twilio_conference_sid}/Participants/${participant.twilio_call_sid}.json`;
      const res = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Muted: isMute ? "true" : "false" }),
      });

      if (!res.ok) {
        console.warn(
          `[${FN}] Twilio mute error: ${res.status} ${await res.text()}`,
        );
      }
    }

    await sbAdmin
      .from("conference_participants")
      .update({ is_muted: isMute })
      .eq("id", participant_id);

    console.log(
      `[${FN}] Participant ${participant_id} ${action}d in conference ${conference_id}`,
    );

    return new Response(
      JSON.stringify({ success: true, action }),
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
