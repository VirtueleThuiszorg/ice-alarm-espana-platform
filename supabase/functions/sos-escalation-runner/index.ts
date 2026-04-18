/**
 * SOS Escalation Runner — checks for unaccepted alerts and escalates.
 * Designed to be called every 10 seconds via cron or pg_cron.
 *
 * Escalation chain:
 *   Level 1 (15s): Browser alert (client-side audio)
 *   Level 2 (30s): On-shift staff mobile call
 *   Level 3 (60s): Supervisor mobile call
 *   Level 4 (90s): Admin mobile call
 *   Level 5 (120s): Emergency contacts called
 *
 * Unresponsive alerts use tighter timings: 15s, 30s, 45s, 60s, 90s.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  loadTwilioCredentials,
  twilioAuth,
} from "../_shared/twilio-credentials.ts";

const FN = "sos-escalation-runner";

// Normal timings (ms)
const NORMAL_TIMINGS: Record<number, number> = {
  1: 15_000,
  2: 30_000,
  3: 60_000,
  4: 90_000,
  5: 120_000,
};

// Tighter timings for unresponsive
const UNRESPONSIVE_TIMINGS: Record<number, number> = {
  1: 15_000,
  2: 30_000,
  3: 45_000,
  4: 60_000,
  5: 90_000,
};

async function placeEscalationCall(
  creds: { accountSid: string; authToken: string; sosNumber: string },
  baseUrl: string,
  toPhone: string,
  alertId: string,
  memberName: string,
  alertType: string,
): Promise<string | null> {
  const outboundNumber = Deno.env.get("TWILIO_OUTBOUND_NUMBER") || creds.sosNumber;
  const voiceUrl = `${baseUrl}/functions/v1/sos-escalation-mobile?alert_id=${encodeURIComponent(alertId)}&member_name=${encodeURIComponent(memberName)}&alert_type=${encodeURIComponent(alertType)}`;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls.json`;
  const res = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${twilioAuth(creds.accountSid, creds.authToken)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: toPhone,
      From: outboundNumber,
      Url: voiceUrl,
      Method: "POST",
      Timeout: "15",
    }),
  });

  if (!res.ok) {
    console.error(`[${FN}] Call failed to ${toPhone}: ${res.status}`);
    return null;
  }

  const data = await res.json();
  return data.sid;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const creds = await loadTwilioCredentials(sb);

    // Find unaccepted SOS alerts
    const { data: alerts } = await sb
      .from("alerts")
      .select("id, alert_type, member_id, received_at, is_unresponsive, escalation_level_reached")
      .eq("status", "incoming")
      .in("alert_type", ["sos_button", "fall_detected"])
      .order("received_at", { ascending: true });

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: jh });
    }

    let processed = 0;

    for (const alert of alerts) {
      const elapsed = Date.now() - new Date(alert.received_at).getTime();
      const timings = alert.is_unresponsive ? UNRESPONSIVE_TIMINGS : NORMAL_TIMINGS;
      const currentLevel = alert.escalation_level_reached || 0;

      // Find the next level to escalate to
      let nextLevel = 0;
      for (let level = currentLevel + 1; level <= 5; level++) {
        if (elapsed >= timings[level]) {
          nextLevel = level;
        }
      }

      if (nextLevel === 0 || nextLevel <= currentLevel) continue;

      // Check if this level was already attempted
      const { data: existingEsc } = await sb
        .from("alert_escalations")
        .select("id, responded")
        .eq("alert_id", alert.id)
        .eq("escalation_level", nextLevel)
        .maybeSingle();

      if (existingEsc) {
        if (existingEsc.responded) break; // Stop escalating if responded
        continue; // Already attempted this level
      }

      // Get member name
      const { data: member } = await sb
        .from("members")
        .select("first_name, last_name")
        .eq("id", alert.member_id)
        .maybeSingle();
      const memberName = member ? `${member.first_name} ${member.last_name}` : "Member";

      console.log(`[${FN}] Escalating alert ${alert.id} to level ${nextLevel} (elapsed ${Math.round(elapsed / 1000)}s)`);

      // Level 1: Browser alert (handled client-side)
      if (nextLevel === 1) {
        await sb.from("alert_escalations").insert({
          alert_id: alert.id,
          escalation_level: 1,
          target_type: "browser_alert",
        });
        await sb.from("alerts").update({ escalation_level_reached: 1 }).eq("id", alert.id);
        processed++;
        continue;
      }

      // Try shift escalation chain first (levels 2-3)
      // Determine current shift type based on time
      const now = new Date();
      const hours = now.getUTCHours(); // Use UTC to match DB
      const shiftType = hours >= 7 && hours < 15 ? "morning" : hours >= 15 && hours < 23 ? "afternoon" : "night";
      const shiftDate = hours < 7
        ? new Date(now.getTime() - 86400000).toISOString().slice(0, 10) // Yesterday for overnight
        : now.toISOString().slice(0, 10);

      const { data: chain } = await sb
        .from("shift_escalation_chain")
        .select("primary_staff_id, backup_staff_id, supervisor_staff_id")
        .eq("shift_date", shiftDate)
        .eq("shift_type", shiftType)
        .maybeSingle();

      // Level 2: On-shift staff (chain primary/backup first, then fallback)
      if (nextLevel === 2) {
        let called = false;

        // Try chain primary first
        if (chain?.primary_staff_id) {
          const { data: primary } = await sb.from("staff").select("id, personal_mobile").eq("id", chain.primary_staff_id).maybeSingle();
          if (primary?.personal_mobile) {
            const callSid = await placeEscalationCall(creds, baseUrl, primary.personal_mobile, alert.id, memberName, alert.alert_type);
            await sb.from("alert_escalations").insert({
              alert_id: alert.id, escalation_level: 2, target_type: "mobile_call",
              target_staff_id: primary.id, target_phone: primary.personal_mobile,
            });
            if (callSid) called = true;
          }
        }

        // Try chain backup
        if (!called && chain?.backup_staff_id) {
          const { data: backup } = await sb.from("staff").select("id, personal_mobile").eq("id", chain.backup_staff_id).maybeSingle();
          if (backup?.personal_mobile) {
            const callSid = await placeEscalationCall(creds, baseUrl, backup.personal_mobile, alert.id, memberName, alert.alert_type);
            await sb.from("alert_escalations").insert({
              alert_id: alert.id, escalation_level: 2, target_type: "mobile_call",
              target_staff_id: backup.id, target_phone: backup.personal_mobile,
            });
            if (callSid) called = true;
          }
        }

        // Fallback: on-call staff by escalation_priority
        if (!called) {
          const { data: staffList } = await sb
            .from("staff")
            .select("id, personal_mobile")
            .eq("status", "active")
            .eq("is_on_call", true)
            .not("personal_mobile", "is", null)
            .order("escalation_priority", { ascending: true })
            .limit(3);

          for (const staff of staffList || []) {
            if (!staff.personal_mobile) continue;
            const callSid = await placeEscalationCall(creds, baseUrl, staff.personal_mobile, alert.id, memberName, alert.alert_type);
            await sb.from("alert_escalations").insert({
              alert_id: alert.id, escalation_level: 2, target_type: "mobile_call",
              target_staff_id: staff.id, target_phone: staff.personal_mobile,
            });
            if (callSid) break;
          }
        }

        await sb.from("alerts").update({ escalation_level_reached: 2 }).eq("id", alert.id);
        processed++;
        continue;
      }

      // Level 3: Supervisors (chain supervisor first, then fallback)
      if (nextLevel === 3) {
        let called = false;

        // Try chain supervisor
        if (chain?.supervisor_staff_id) {
          const { data: supervisor } = await sb.from("staff").select("id, personal_mobile").eq("id", chain.supervisor_staff_id).maybeSingle();
          if (supervisor?.personal_mobile) {
            await placeEscalationCall(creds, baseUrl, supervisor.personal_mobile, alert.id, memberName, alert.alert_type);
            await sb.from("alert_escalations").insert({
              alert_id: alert.id, escalation_level: 3, target_type: "mobile_call",
              target_staff_id: supervisor.id, target_phone: supervisor.personal_mobile,
            });
            called = true;
          }
        }

        // Fallback: all supervisors
        if (!called) {
          const { data: supervisors } = await sb
            .from("staff")
            .select("id, personal_mobile")
            .eq("status", "active")
            .eq("role", "call_centre_supervisor")
            .not("personal_mobile", "is", null)
            .limit(3);

          for (const sup of supervisors || []) {
            if (!sup.personal_mobile) continue;
            await placeEscalationCall(creds, baseUrl, sup.personal_mobile, alert.id, memberName, alert.alert_type);
            await sb.from("alert_escalations").insert({
              alert_id: alert.id, escalation_level: 3, target_type: "mobile_call",
              target_staff_id: sup.id, target_phone: sup.personal_mobile,
            });
          }
        }

        await sb.from("alerts").update({ escalation_level_reached: 3 }).eq("id", alert.id);
        processed++;
        continue;
      }

      // Level 4: Admins
      if (nextLevel === 4) {
        const { data: admins } = await sb
          .from("staff")
          .select("id, personal_mobile")
          .eq("status", "active")
          .in("role", ["admin", "super_admin"])
          .not("personal_mobile", "is", null)
          .limit(3);

        for (const admin of admins || []) {
          if (!admin.personal_mobile) continue;
          await placeEscalationCall(creds, baseUrl, admin.personal_mobile, alert.id, memberName, alert.alert_type);
          await sb.from("alert_escalations").insert({
            alert_id: alert.id,
            escalation_level: 4,
            target_type: "mobile_call",
            target_staff_id: admin.id,
            target_phone: admin.personal_mobile,
          });
        }

        await sb.from("alerts").update({ escalation_level_reached: 4 }).eq("id", alert.id);
        processed++;
        continue;
      }

      // Level 5: Emergency contacts
      if (nextLevel === 5) {
        const { data: contacts } = await sb
          .from("emergency_contacts")
          .select("id, phone, contact_name")
          .eq("member_id", alert.member_id)
          .order("priority_order")
          .limit(5);

        for (const contact of contacts || []) {
          if (!contact.phone) continue;
          await placeEscalationCall(creds, baseUrl, contact.phone, alert.id, memberName, alert.alert_type);
          await sb.from("alert_escalations").insert({
            alert_id: alert.id,
            escalation_level: 5,
            target_type: "emergency_contact_call",
            target_phone: contact.phone,
          });
        }

        await sb.from("alerts").update({ escalation_level_reached: 5 }).eq("id", alert.id);
        processed++;
      }
    }

    return new Response(JSON.stringify({ processed, total: alerts.length }), { headers: jh });
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jh },
    );
  }
});
