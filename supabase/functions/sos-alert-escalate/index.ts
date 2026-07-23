/**
 * SOS Alert Escalate — MANUAL escalation with a real audit trail and a real,
 * CONFIRMED admin notification (STAGE_SOS_FIX.md WP-C).
 *
 * POST { alert_id }
 * Auth: Bearer token (any active staff — operators escalate).
 *
 * Before WP-C the client flipped alerts.status to 'escalated' and toasted
 * "Admin has been notified" while NOTHING was sent. This function makes the
 * claim true — and reports honestly when it is not:
 *
 * 1. Updates the alert to status='escalated'.
 * 2. Inserts an alert_escalations audit row (escalated_by = the staff member,
 *    target_type='admin_notification'). The row uses escalation_level=1 +
 *    call_placed=true, which the runner's tier-check treats as "browser tier
 *    already reached" — truthful (the dashboards did surface it) and provably
 *    unable to suppress any voice-call tier (2–5).
 * 3. Calls notify-admin (event escalation.manual) and INSPECTS its per-admin
 *    results: `notified` is true only if at least one admin WhatsApp was
 *    actually SENT. The client may only show a success toast when
 *    notified=true (GOALS G2 — fail loud, never lie).
 *
 * Response: { escalated: boolean, notified: boolean, notified_count: number }
 * — escalated can be true while notified is false; the UI must distinguish.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "sos-alert-escalate";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jh });
  }

  try {
    // ── auth: any ACTIVE staff member ───────────────────────────────────────
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jh });
    }

    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: staffRow } = await sbAdmin
      .from("staff")
      .select("id, first_name, last_name, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!staffRow || staffRow.status !== "active") {
      return new Response(JSON.stringify({ error: "Active staff role required" }), { status: 403, headers: jh });
    }

    const { alert_id } = await req.json();
    if (!alert_id) {
      return new Response(JSON.stringify({ error: "alert_id is required" }), { status: 400, headers: jh });
    }

    const { data: alert } = await sbAdmin
      .from("alerts")
      .select("id, alert_type, status, member_id")
      .eq("id", alert_id)
      .maybeSingle();
    if (!alert) {
      return new Response(JSON.stringify({ error: "Alert not found" }), { status: 404, headers: jh });
    }

    const { data: member } = await sbAdmin
      .from("members")
      .select("first_name, last_name")
      .eq("id", alert.member_id)
      .maybeSingle();
    const memberName = member ? `${member.first_name} ${member.last_name}` : "Unknown member";

    // 1. Escalate the alert.
    const { error: updateError } = await sbAdmin
      .from("alerts")
      .update({ status: "escalated" })
      .eq("id", alert_id);
    if (updateError) {
      console.error(`[${FN}] status update failed:`, updateError);
      return new Response(JSON.stringify({ error: "Failed to escalate alert" }), { status: 500, headers: jh });
    }

    // 2. Audit row — see header for the level-1/call_placed=true safety argument.
    const { error: escRowError } = await sbAdmin.from("alert_escalations").insert({
      alert_id,
      escalation_level: 1,
      target_type: "admin_notification",
      call_placed: true,
      escalated_by: staffRow.id,
    });
    if (escRowError) {
      // Audit failure must be visible, not silent — but the alert IS escalated.
      console.error(`[${FN}] audit row insert failed:`, escRowError);
    }

    // 3. Notify admins and CONFIRM at least one send succeeded.
    let notifiedCount = 0;
    try {
      const baseUrl = Deno.env.get("SUPABASE_URL")!;
      const res = await fetch(`${baseUrl}/functions/v1/notify-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({
          event_type: "escalation.manual",
          entity_type: "alert",
          entity_id: alert_id,
          payload: {
            alert_id,
            alert_type: alert.alert_type,
            member_id: alert.member_id,
            member_name: memberName,
            escalated_by_name: `${staffRow.first_name} ${staffRow.last_name}`,
          },
        }),
      });
      if (res.ok) {
        const body = await res.json();
        const results: Array<{ status?: string }> = Array.isArray(body?.results) ? body.results : [];
        notifiedCount = results.filter((r) => r.status === "sent").length;
      } else {
        console.error(`[${FN}] notify-admin returned ${res.status}`);
      }
    } catch (err) {
      console.error(`[${FN}] notify-admin call failed:`, err);
    }

    const notified = notifiedCount > 0;
    console.log(
      `[${FN}] alert ${alert_id} escalated by staff ${staffRow.id}; admin notification ${notified ? `SENT (${notifiedCount})` : "FAILED"}`,
    );

    return new Response(
      JSON.stringify({ escalated: true, notified, notified_count: notifiedCount, audit_row: !escRowError }),
      { headers: jh },
    );
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jh },
    );
  }
});
