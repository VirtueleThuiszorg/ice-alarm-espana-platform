/**
 * Isabella Assessment Log — writes to isabella_assessment_notes table.
 * Simple logging function used by isabella-voice-handler and other processes.
 *
 * POST { alert_id, note_type, content, is_critical? }
 * Auth: service_role_key (internal)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "isabella-assessment-log";

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

    const { alert_id, note_type, content, is_critical } = await req.json();

    if (!alert_id || !note_type || !content) {
      return new Response(
        JSON.stringify({ error: "alert_id, note_type, and content are required" }),
        { status: 400, headers: jh },
      );
    }

    // Validate alert exists and is active
    const { data: alert } = await sb
      .from("alerts")
      .select("id, status")
      .eq("id", alert_id)
      .in("status", ["incoming", "in_progress"])
      .maybeSingle();

    if (!alert) {
      return new Response(
        JSON.stringify({ error: "Alert not found or not active" }),
        { status: 404, headers: jh },
      );
    }

    const { data: note, error } = await sb
      .from("isabella_assessment_notes")
      .insert({
        alert_id,
        note_type,
        content,
        is_critical: is_critical || false,
      })
      .select()
      .single();

    if (error) {
      console.error(`[${FN}] Insert error:`, error);
      return new Response(
        JSON.stringify({ error: "Failed to create note" }),
        { status: 500, headers: jh },
      );
    }

    console.log(`[${FN}] Note created: ${note_type} for alert ${alert_id}`);
    return new Response(JSON.stringify(note), { headers: jh });
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jh },
    );
  }
});
