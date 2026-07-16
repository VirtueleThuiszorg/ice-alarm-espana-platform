/**
 * SOS Escalation Runner — checks for unaccepted alerts and escalates.
 *
 * Invocation model (HAZARD 1, SOS_ESCALATION_SPEC.md §c item 1):
 *   A per-minute pg_cron wake (migration 20260716120000_sos_escalation_cron.sql) POSTs here.
 *   Each invocation drives runEscalationLoop, which sweeps every ESCALATION_TICK_MS (~10s) for up
 *   to ESCALATION_MAX_RUNTIME_MS (~55s) — an effective ~10s cadence that meets the sub-minute
 *   ladder rungs. The next wake restarts the loop, so a crashed invocation self-heals within a
 *   minute. Measured in src/test/escalationLoop.test.ts; end-to-end in src/test/sosEscalation.e2e.test.ts.
 *
 * Escalation chain (unchanged logic):
 *   Level 1 (15s): Browser alert (client-side audio)
 *   Level 2 (30s): On-shift staff mobile call
 *   Level 3 (60s): Supervisor mobile call
 *   Level 4 (90s): Admin mobile call
 *   Level 5 (120s): Emergency contacts called
 *
 * Unresponsive alerts use tighter timings: 15s, 30s, 45s, 60s, 90s.
 *
 * Fail-loud (GOALS G2): every invocation writes a heartbeat, logs structured JSON, and fires a
 * LOUD admin alert (notify-admin `system.runner_failure`) on any sweep error or fatal error — a
 * silently dead escalation runner is the nightmare this guards against.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  loadTwilioCredentials,
  twilioAuth,
  type TwilioCredentials,
} from "../_shared/twilio-credentials.ts";
import { getShiftContext } from "../_shared/shift-time.ts";
import {
  runEscalationLoop,
  ESCALATION_TICK_MS,
  ESCALATION_MAX_RUNTIME_MS,
} from "../_shared/escalation-loop.ts";

const FN = "sos-escalation-runner";

/** Heartbeat key read by staff-shift-monitor's dead-man's-switch. */
const HEARTBEAT_KEY = "ops_sos_escalation_last_run_at";

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

/** Structured, PII-free log line (ids/levels/counts only). */
function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({ fn: FN, ts: new Date().toISOString(), ...entry }));
}

/** Fire a LOUD admin alert that a safety runner failed. Best-effort; never throws. */
async function fireRunnerFailureAlert(
  baseUrl: string,
  serviceKey: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${baseUrl}/functions/v1/notify-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        event_type: "system.runner_failure",
        entity_type: "runner",
        payload: { runner: FN, ...detail },
      }),
    });
  } catch (err) {
    // Last-resort: at least make the failure of the failure-alert visible in logs.
    log({ event: "runner_failure_alert_send_failed", error: err instanceof Error ? err.message : String(err) });
  }
}

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

/**
 * One escalation sweep. `nowMs` is the instant to evaluate timings against (injected so the loop
 * and tests control time). Escalation logic is UNCHANGED from the pre-scheduling version; only the
 * shift derivation now uses the shared, timezone-correct helper (HAZARD 2 fix).
 */
async function runEscalationSweep(
  sb: SupabaseClient,
  creds: TwilioCredentials,
  baseUrl: string,
  nowMs: number,
): Promise<{ processed: number; total: number }> {
  const { data: alerts } = await sb
    .from("alerts")
    .select("id, alert_type, member_id, received_at, is_unresponsive, escalation_level_reached")
    .eq("status", "incoming")
    .in("alert_type", ["sos_button", "fall_detected"])
    .order("received_at", { ascending: true });

  if (!alerts || alerts.length === 0) {
    return { processed: 0, total: 0 };
  }

  let processed = 0;

  for (const alert of alerts) {
    const elapsed = nowMs - new Date(alert.received_at).getTime();
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

    log({ event: "escalating", alert_id: alert.id, level: nextLevel, elapsed_s: Math.round(elapsed / 1000) });

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

    // Determine current shift from the shared, DST-correct helper (Europe/Madrid).
    // HAZARD 2 fix: previously this used getUTCHours(), disagreeing with staff-shift-monitor.
    const { shiftType, shiftDate } = getShiftContext(nowMs);

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

  return { processed, total: alerts.length };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(baseUrl, serviceKey);

  try {
    const creds = await loadTwilioCredentials(sb);

    // Heartbeat FIRST, so the dead-man's-switch (staff-shift-monitor) can tell the runner is alive
    // even if a later sweep throws.
    await sb
      .from("system_settings")
      .upsert({ key: HEARTBEAT_KEY, value: new Date().toISOString() }, { onConflict: "key" });

    let totalProcessed = 0;
    const result = await runEscalationLoop({
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      tickMs: ESCALATION_TICK_MS,
      maxRuntimeMs: ESCALATION_MAX_RUNTIME_MS,
      sweep: async (nowMs) => {
        const r = await runEscalationSweep(sb, creds, baseUrl, nowMs);
        totalProcessed += r.processed;
      },
      log,
      // A sweep error must be LOUD but must NOT stop the loop.
      onError: async (err, sweepIndex) => {
        await fireRunnerFailureAlert(baseUrl, serviceKey, {
          scope: "sweep",
          sweep_index: sweepIndex,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    });

    log({ event: "loop_complete", sweeps: result.sweeps, errors: result.errors, cadence_ms: result.cadenceMs, elapsed_ms: result.elapsedMs, processed: totalProcessed });

    return new Response(
      JSON.stringify({ ok: true, sweeps: result.sweeps, errors: result.errors, cadence_ms: result.cadenceMs, processed: totalProcessed }),
      { headers: jh },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log({ event: "fatal", error: message });
    // Fatal (e.g. bad credentials / DB unreachable): make it LOUD.
    await fireRunnerFailureAlert(baseUrl, serviceKey, { scope: "fatal", error: message });
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500, headers: jh });
  }
});
