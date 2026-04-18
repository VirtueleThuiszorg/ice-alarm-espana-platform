/**
 * SOS False Alarm Resolve — called by Isabella to autonomously resolve false alarms.
 *
 * POST { alert_id }
 * Auth: service_role_key (internal)
 *
 * Safety checks:
 * - Member must have responded to at least 2 of Isabella's questions
 * - Alert must still be in incoming/in_progress status
 * - No staff has joined the conference yet
 *
 * Actions:
 * - Sets alert to resolved with is_false_alarm=true
 * - Ends the conference
 * - Marks all participants as left
 * - Does NOT notify emergency contacts
 * - Logs resolution in isabella_assessment_notes
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "sos-false-alarm-resolve";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jh });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { alert_id } = await req.json();

    if (!alert_id) {
      return new Response(
        JSON.stringify({ error: "alert_id is required" }),
        { status: 400, headers: jh },
      );
    }

    // Verify alert exists and is active
    const { data: alert } = await sb
      .from("alerts")
      .select("id, status, member_id, conference_id")
      .eq("id", alert_id)
      .in("status", ["incoming", "in_progress"])
      .maybeSingle();

    if (!alert) {
      return new Response(
        JSON.stringify({ error: "Alert not found or not active" }),
        { status: 404, headers: jh },
      );
    }

    // Safety check: member must have responded to at least 2 of Isabella's questions
    const { data: memberResponses } = await sb
      .from("isabella_assessment_notes")
      .select("id")
      .eq("alert_id", alert_id)
      .eq("note_type", "member_response");

    const responseCount = memberResponses?.length || 0;
    if (responseCount < 2) {
      console.warn(`[${FN}] Refusing false alarm resolution: only ${responseCount} member responses (need 2+)`);
      await sb.from("isabella_assessment_notes").insert({
        alert_id,
        note_type: "flag",
        content: `False alarm resolution REFUSED: insufficient member responses (${responseCount}/2 required). Escalating to staff.`,
        is_critical: true,
      });
      return new Response(
        JSON.stringify({ error: "Insufficient member responses for autonomous resolution", response_count: responseCount }),
        { status: 400, headers: jh },
      );
    }

    // Safety check: no staff has accepted/joined yet
    if (alert.conference_id) {
      const { data: staffParticipants } = await sb
        .from("conference_participants")
        .select("id")
        .eq("conference_id", alert.conference_id)
        .eq("participant_type", "staff")
        .is("left_at", null);

      if (staffParticipants && staffParticipants.length > 0) {
        console.log(`[${FN}] Staff already in conference — deferring to staff for resolution`);
        return new Response(
          JSON.stringify({ error: "Staff already in conference, cannot auto-resolve" }),
          { status: 409, headers: jh },
        );
      }
    }

    // Resolve the alert
    const now = new Date().toISOString();

    await sb
      .from("alerts")
      .update({
        status: "resolved",
        resolved_at: now,
        resolution_notes: "False alarm resolved by Isabella. Member confirmed they are fine.",
        is_false_alarm: true,
      })
      .eq("id", alert_id);

    console.log(`[${FN}] Alert ${alert_id} resolved as false alarm by Isabella`);

    // End conference if exists
    if (alert.conference_id) {
      // Mark all participants as left
      await sb
        .from("conference_participants")
        .update({ left_at: now })
        .eq("conference_id", alert.conference_id)
        .is("left_at", null);

      // End conference room
      await sb
        .from("conference_rooms")
        .update({ status: "ended", ended_at: now })
        .eq("id", alert.conference_id);
    }

    // Log the resolution
    await sb.from("isabella_assessment_notes").insert({
      alert_id,
      note_type: "triage_decision",
      content: "False alarm confirmed by member. Alert resolved autonomously by Isabella. Member confirmed they are fine with 2+ responses.",
      is_critical: false,
    });

    return new Response(JSON.stringify({ resolved: true, alert_id, by: "isabella" }), { headers: jh });
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jh },
    );
  }
});
