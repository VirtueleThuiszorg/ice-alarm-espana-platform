/**
 * SOS Conference Create — creates a Twilio conference room for an SOS alert.
 * Internal-only: called by voice-handler or other edge functions with service_role_key.
 *
 * POST { alert_id, member_phone, member_name }
 * → Creates conference_rooms record, updates alerts.conference_id,
 *   inserts 2 conference_participants (member + Isabella AI).
 * Idempotent: returns existing active conference if one already exists.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "sos-conference-create";

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
    // Verify internal auth (service_role_key)
    const authHeader = req.headers.get("authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!authHeader.includes(serviceKey)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: jh },
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    const { alert_id, member_phone, member_name } = await req.json();

    if (!alert_id) {
      return new Response(
        JSON.stringify({ error: "alert_id is required" }),
        { status: 400, headers: jh },
      );
    }

    // Idempotent: check for existing active conference
    const { data: existing } = await sb
      .from("conference_rooms")
      .select("id, conference_name")
      .eq("alert_id", alert_id)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      console.log(
        `[${FN}] Returning existing conference ${existing.id} for alert ${alert_id}`,
      );
      return new Response(
        JSON.stringify({
          conference_id: existing.id,
          conference_name: existing.conference_name,
          alert_id,
        }),
        { headers: jh },
      );
    }

    const conferenceName = `sos-${alert_id}`;

    // Create conference room
    const { data: room, error: roomError } = await sb
      .from("conference_rooms")
      .insert({
        alert_id,
        conference_name: conferenceName,
        status: "active",
      })
      .select("id, conference_name")
      .single();

    if (roomError) {
      console.error(`[${FN}] Failed to create conference room:`, roomError);
      return new Response(
        JSON.stringify({ error: "Failed to create conference room" }),
        { status: 500, headers: jh },
      );
    }

    // Update alert with conference_id
    await sb
      .from("alerts")
      .update({ conference_id: room.id })
      .eq("id", alert_id);

    // Insert participants: member + Isabella AI
    const participants = [
      {
        conference_id: room.id,
        participant_type: "member",
        participant_name: member_name || "Member",
        phone_number: member_phone || null,
        join_method: "automatic",
      },
      {
        conference_id: room.id,
        participant_type: "ai",
        participant_name: "Isabella AI",
        join_method: "automatic",
      },
    ];

    const { error: participantError } = await sb
      .from("conference_participants")
      .insert(participants);

    if (participantError) {
      console.error(`[${FN}] Failed to insert participants:`, participantError);
      // Conference room is still usable, so don't fail
    }

    console.log(
      `[${FN}] Created conference ${room.id} (${conferenceName}) for alert ${alert_id}`,
    );

    return new Response(
      JSON.stringify({
        conference_id: room.id,
        conference_name: conferenceName,
        alert_id,
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
