/**
 * SOS Drill — create and clean up SAFE test SOS alerts (admin-only).
 *
 * POST { action: "create" } | { action: "cleanup" }
 * Auth: Bearer token; caller must be an active staff member with role
 * admin/super_admin (403 otherwise).
 *
 * WHY THIS IS SAFE (verified against sos-escalation-runner):
 * - The drill alert is inserted with escalation_level_reached = 5. The runner
 *   picks its next rung with `for (level = current+1; level <= 5)`, so a
 *   level-5 alert has NO next rung — the escalation ladder NEVER fires for it:
 *   no Twilio calls to staff/supervisors/admins/contacts, ever.
 * - It does NOT go through the ev07b-sos-alert ingress, so no
 *   emergency-contact-notify / partner-alert-notify / notify-admin fires.
 * - It belongs to a dedicated, clearly-labelled drill member
 *   (sos-drill@care-conneqt.internal) that this function REFUSES to use if it
 *   somehow has emergency contacts.
 * - The only side effects are operator-facing: realtime queue/dashboard/SOS
 *   pending list + browser tone for logged-in operators. That is the point of
 *   a drill.
 * - "cleanup" deletes ONLY the drill member's alerts (+ their escalation rows).
 *
 * The drill alert is fully claimable/resolvable through the normal UI, so it
 * exercises the real WP-A claim handoff and (once merged) the WP-B resolve
 * path end to end.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "sos-drill";
const DRILL_MEMBER_EMAIL = "sos-drill@care-conneqt.internal";
const DRILL_LABEL = "🧪 SOS DRILL — not a real emergency";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jh });
  }

  try {
    // ── auth: authenticated ADMIN staff only ────────────────────────────────
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
      .select("id, role, status")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin =
      staffRow?.status === "active" && ["admin", "super_admin"].includes(staffRow?.role ?? "");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin role required for SOS drills" }),
        { status: 403, headers: jh },
      );
    }

    const { action } = await req.json();

    // ── find (or create) the dedicated drill member ─────────────────────────
    const { data: existing } = await sbAdmin
      .from("members")
      .select("id")
      .eq("email", DRILL_MEMBER_EMAIL)
      .maybeSingle();

    let drillMemberId = existing?.id as string | undefined;

    if (action === "create") {
      if (!drillMemberId) {
        const { data: created, error: createErr } = await sbAdmin
          .from("members")
          .insert({
            first_name: "SOS Drill",
            last_name: "(TEST — not a real member)",
            email: DRILL_MEMBER_EMAIL,
            phone: "+34000000000",
            date_of_birth: "1950-01-01",
            address_line_1: "Drill — no real address",
            city: "Drill",
            province: "Drill",
            postal_code: "00000",
          })
          .select("id")
          .single();
        if (createErr || !created) {
          console.error(`[${FN}] drill member create failed:`, createErr);
          return new Response(JSON.stringify({ error: "Could not create drill member" }), { status: 500, headers: jh });
        }
        drillMemberId = created.id;
      }

      // Belt & braces: refuse to drill against a member that somehow has
      // real emergency contacts attached.
      const { count: contactCount } = await sbAdmin
        .from("emergency_contacts")
        .select("id", { count: "exact", head: true })
        .eq("member_id", drillMemberId);
      if ((contactCount ?? 0) > 0) {
        return new Response(
          JSON.stringify({ error: "Drill member has emergency contacts — refusing to create a drill alert" }),
          { status: 409, headers: jh },
        );
      }

      // The drill alert: ladder-suppressed (level 5 ⇒ no next rung ⇒ no calls).
      const { data: alert, error: alertErr } = await sbAdmin
        .from("alerts")
        .insert({
          member_id: drillMemberId,
          alert_type: "sos_button",
          status: "incoming",
          escalation_level_reached: 5,
          location_address: DRILL_LABEL,
        })
        .select("id")
        .single();
      if (alertErr || !alert) {
        console.error(`[${FN}] drill alert insert failed:`, alertErr);
        return new Response(JSON.stringify({ error: "Could not create drill alert" }), { status: 500, headers: jh });
      }

      console.log(`[${FN}] drill alert ${alert.id} created by staff ${staffRow!.id}`);
      return new Response(
        JSON.stringify({ created: true, alert_id: alert.id, member_id: drillMemberId }),
        { headers: jh },
      );
    }

    if (action === "cleanup") {
      if (!drillMemberId) {
        return new Response(JSON.stringify({ cleaned: true, alerts_deleted: 0 }), { headers: jh });
      }

      // Scope strictly to the drill member's alerts.
      const { data: drillAlerts } = await sbAdmin
        .from("alerts")
        .select("id")
        .eq("member_id", drillMemberId);
      const ids = (drillAlerts ?? []).map((a: { id: string }) => a.id);

      if (ids.length > 0) {
        await sbAdmin.from("alert_escalations").delete().in("alert_id", ids);
        await sbAdmin.from("isabella_assessment_notes").delete().in("alert_id", ids);
        await sbAdmin.from("alerts").delete().in("id", ids);
      }

      console.log(`[${FN}] cleanup by staff ${staffRow!.id}: ${ids.length} drill alert(s) removed`);
      return new Response(
        JSON.stringify({ cleaned: true, alerts_deleted: ids.length }),
        { headers: jh },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: jh });
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jh },
    );
  }
});
