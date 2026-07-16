import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getShiftContext } from "../_shared/shift-time.ts";

/**
 * Staff Shift Monitor
 *
 * Runs every 2 minutes via pg_cron (migration 20260716120000_sos_escalation_cron.sql).
 * Performs three checks:
 * 1. No-show: scheduled staff who haven't signed in after grace period
 * 2. No coverage: nobody on duty at all
 * 3. Disconnected: on-duty staff whose heartbeat has gone stale
 *
 * It ALSO acts as the dead-man's-switch for sos-escalation-runner: if that runner's heartbeat is
 * stale, this fires a LOUD admin alert — catching the "escalation cron silently died" nightmare
 * (GOALS G2). Shift math uses the shared, timezone-correct helper so it can never diverge from the
 * escalation runner (HAZARD 2 fix).
 */

const FN = "staff-shift-monitor";

// Grace period after shift start before alerting (in minutes)
const NO_SHOW_GRACE_MINUTES = 5;

// Heartbeat staleness threshold (in seconds) — 90s means 3 missed 30s heartbeats
const HEARTBEAT_STALE_SECONDS = 90;

// Dead-man's-switch for sos-escalation-runner.
const ESCALATION_HEARTBEAT_KEY = "ops_sos_escalation_last_run_at";
const ESCALATION_STALE_MS = 180_000; // 3 min: tolerates one missed per-minute wake
const ESCALATION_STALE_DEDUP_KEY = "ops_sos_escalation_stale_last_alert_at";
const ESCALATION_STALE_DEDUP_MS = 1_800_000; // re-alert at most every 30 min

// Shift schedule labels (Madrid timezone) — used for the shift_time in notifications.
const SHIFTS = {
  morning: { start: 7, end: 15 },
  afternoon: { start: 15, end: 23 },
  night: { start: 23, end: 7 },
} as const;

/** Structured, PII-free log line. */
function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({ fn: FN, ts: new Date().toISOString(), ...entry }));
}

/** Fire a LOUD admin alert about a runner failure. Best-effort; never throws. */
async function fireRunnerFailureAlert(
  baseUrl: string,
  serviceKey: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${baseUrl}/functions/v1/notify-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ event_type: "system.runner_failure", entity_type: "runner", payload: detail }),
    });
  } catch (err) {
    log({ event: "runner_failure_alert_send_failed", error: err instanceof Error ? err.message : String(err) });
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const supabase = createClient(baseUrl, serviceKey);

    // Shift context from the shared, DST-correct helper (Europe/Madrid) — identical to the math
    // sos-escalation-runner uses, so the two safety runners agree on "current shift".
    const now = new Date();
    const shiftCtx = getShiftContext(now.getTime());
    const currentShift = shiftCtx.shiftType;
    const minutesSinceShiftStart = shiftCtx.minutesSinceShiftStart;
    const today = shiftCtx.shiftDate;

    const stats = {
      noShowAlerts: 0,
      noCoverageAlerts: 0,
      disconnectedAlerts: 0,
    };

    // ================================================================
    // CHECK 1: No-show — scheduled staff who haven't signed in
    // ================================================================
    if (minutesSinceShiftStart >= NO_SHOW_GRACE_MINUTES) {
      // Get staff scheduled for current shift
      const { data: scheduledStaff } = await supabase
        .from("staff_on_shift_now")
        .select("staff_id, first_name, last_name, shift_type");

      if (scheduledStaff && scheduledStaff.length > 0) {
        // Get who is actually on call
        const { data: onCallStaff } = await supabase
          .from("staff")
          .select("id, first_name, last_name, personal_mobile")
          .eq("is_on_call", true);

        const onCallIds = new Set((onCallStaff || []).map((s) => s.id));

        for (const scheduled of scheduledStaff) {
          if (onCallIds.has(scheduled.staff_id)) continue; // They signed in, skip

          // Check deduplication
          const { data: existing } = await supabase
            .from("shift_alert_log")
            .select("id")
            .eq("alert_type", "no_show")
            .eq("staff_id", scheduled.staff_id)
            .eq("shift_date", today)
            .eq("shift_type", currentShift)
            .is("resolved_at", null)
            .maybeSingle();

          if (existing) continue; // Already alerted

          // Insert alert log
          await supabase.from("shift_alert_log").insert({
            alert_type: "no_show",
            staff_id: scheduled.staff_id,
            shift_date: today,
            shift_type: currentShift,
          });

          const staffName = `${scheduled.first_name} ${scheduled.last_name}`.trim();

          // Notify admin
          try {
            await fetch(`${baseUrl}/functions/v1/notify-admin`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                event_type: "shift.no_show",
                entity_type: "staff",
                entity_id: scheduled.staff_id,
                payload: {
                  staff_name: staffName,
                  shift_type: currentShift,
                  shift_time: `${SHIFTS[currentShift as keyof typeof SHIFTS].start}:00`,
                },
              }),
            });
          } catch (err) {
            console.error("Admin notify error (no_show):", err);
          }

          // Notify the staff member directly
          // Look up their mobile from the staff table
          const { data: staffRecord } = await supabase
            .from("staff")
            .select("personal_mobile")
            .eq("id", scheduled.staff_id)
            .maybeSingle();

          if (staffRecord?.personal_mobile) {
            try {
              await fetch(`${baseUrl}/functions/v1/notify-staff-whatsapp`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  staff_id: scheduled.staff_id,
                  message_type: "no_show",
                  staff_name: staffName,
                  phone_number: staffRecord.personal_mobile,
                  shift_type: currentShift,
                }),
              });
            } catch (err) {
              console.error("Staff notify error (no_show):", err);
            }
          }

          stats.noShowAlerts++;
          console.log(`No-show alert: ${staffName} for ${currentShift} shift`);
        }
      }
    }

    // ================================================================
    // CHECK 2: No coverage — nobody on duty at all
    // ================================================================
    const { count: onDutyOnlineCount } = await supabase
      .from("staff_presence")
      .select("id", { count: "exact", head: true })
      .eq("is_online", true);

    if ((onDutyOnlineCount ?? 0) === 0) {
      // Also check is_on_call in case heartbeat hasn't been set up yet
      const { count: onCallCount } = await supabase
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("is_on_call", true);

      if ((onCallCount ?? 0) === 0) {
        // Check deduplication
        const { data: existing } = await supabase
          .from("shift_alert_log")
          .select("id")
          .eq("alert_type", "no_coverage")
          .eq("shift_date", today)
          .eq("shift_type", currentShift)
          .is("resolved_at", null)
          .maybeSingle();

        if (!existing) {
          await supabase.from("shift_alert_log").insert({
            alert_type: "no_coverage",
            staff_id: null,
            shift_date: today,
            shift_type: currentShift,
          });

          try {
            await fetch(`${baseUrl}/functions/v1/notify-admin`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                event_type: "shift.no_coverage",
                entity_type: "shift",
                payload: {
                  shift_type: currentShift,
                },
              }),
            });
          } catch (err) {
            console.error("Admin notify error (no_coverage):", err);
          }

          stats.noCoverageAlerts++;
          console.log(`No coverage alert for ${currentShift} shift`);
        }
      }
    }

    // ================================================================
    // CHECK 3: Disconnected — on-duty staff with stale heartbeats
    // ================================================================
    const staleThreshold = new Date(now.getTime() - HEARTBEAT_STALE_SECONDS * 1000).toISOString();

    const { data: stalePresences } = await supabase
      .from("staff_presence")
      .select("staff_id, last_heartbeat_at")
      .eq("is_online", true)
      .lt("last_heartbeat_at", staleThreshold);

    if (stalePresences && stalePresences.length > 0) {
      // Mark them all offline
      const staleIds = stalePresences.map((p) => p.staff_id);
      await supabase
        .from("staff_presence")
        .update({ is_online: false })
        .in("staff_id", staleIds);

      // Get staff details for notifications
      const { data: staleStaff } = await supabase
        .from("staff")
        .select("id, first_name, last_name, personal_mobile")
        .in("id", staleIds);

      for (const staff of staleStaff || []) {
        // Deduplication
        const { data: existing } = await supabase
          .from("shift_alert_log")
          .select("id")
          .eq("alert_type", "disconnected")
          .eq("staff_id", staff.id)
          .eq("shift_date", today)
          .eq("shift_type", currentShift)
          .is("resolved_at", null)
          .maybeSingle();

        if (existing) continue;

        await supabase.from("shift_alert_log").insert({
          alert_type: "disconnected",
          staff_id: staff.id,
          shift_date: today,
          shift_type: currentShift,
        });

        const staffName = `${staff.first_name} ${staff.last_name}`.trim();

        // Notify admin
        try {
          await fetch(`${baseUrl}/functions/v1/notify-admin`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              event_type: "shift.disconnected",
              entity_type: "staff",
              entity_id: staff.id,
              payload: {
                staff_name: staffName,
                shift_type: currentShift,
              },
            }),
          });
        } catch (err) {
          console.error("Admin notify error (disconnected):", err);
        }

        // Notify staff member
        if (staff.personal_mobile) {
          try {
            await fetch(`${baseUrl}/functions/v1/notify-staff-whatsapp`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                staff_id: staff.id,
                message_type: "disconnected",
                staff_name: staffName,
                phone_number: staff.personal_mobile,
                shift_type: currentShift,
              }),
            });
          } catch (err) {
            console.error("Staff notify error (disconnected):", err);
          }
        }

        stats.disconnectedAlerts++;
        console.log(`Disconnected alert: ${staffName}`);
      }
    }

    // ================================================================
    // DEAD-MAN'S-SWITCH: is sos-escalation-runner still firing?
    // A silently dead escalation cron is the nightmare (GOALS G2). Its runner writes a heartbeat
    // each invocation; if that heartbeat is missing or stale, escalation is NOT running — alert LOUD.
    // ================================================================
    let escalationRunnerStale = false;
    try {
      const { data: hb } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", ESCALATION_HEARTBEAT_KEY)
        .maybeSingle();

      const lastRunMs = hb?.value ? new Date(hb.value).getTime() : null;
      const ageMs = lastRunMs == null ? Infinity : now.getTime() - lastRunMs;

      if (ageMs > ESCALATION_STALE_MS) {
        escalationRunnerStale = true;

        // Dedup: only re-alert every ESCALATION_STALE_DEDUP_MS.
        const { data: lastAlert } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", ESCALATION_STALE_DEDUP_KEY)
          .maybeSingle();
        const lastAlertMs = lastAlert?.value ? new Date(lastAlert.value).getTime() : null;
        const sinceLastAlert = lastAlertMs == null ? Infinity : now.getTime() - lastAlertMs;

        log({
          event: "escalation_runner_stale",
          last_run_at: hb?.value ?? null,
          age_s: ageMs === Infinity ? null : Math.round(ageMs / 1000),
          will_alert: sinceLastAlert > ESCALATION_STALE_DEDUP_MS,
        });

        if (sinceLastAlert > ESCALATION_STALE_DEDUP_MS) {
          await fireRunnerFailureAlert(baseUrl, serviceKey, {
            runner: "sos-escalation-runner",
            scope: "heartbeat_stale",
            last_run_at: hb?.value ?? "never",
            age_s: ageMs === Infinity ? "unknown" : Math.round(ageMs / 1000),
          });
          await supabase
            .from("system_settings")
            .upsert({ key: ESCALATION_STALE_DEDUP_KEY, value: now.toISOString() }, { onConflict: "key" });
        }
      }
    } catch (hbErr) {
      log({ event: "heartbeat_check_failed", error: hbErr instanceof Error ? hbErr.message : String(hbErr) });
    }

    const result = {
      success: true,
      timestamp: now.toISOString(),
      currentShift,
      minutesSinceShiftStart,
      escalationRunnerStale,
      stats,
    };

    log({ event: "completed", currentShift, minutesSinceShiftStart, escalationRunnerStale, ...stats });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log({ event: "fatal", error: message });
    // Fatal error in the night-cover safety net must be LOUD, not swallowed.
    await fireRunnerFailureAlert(baseUrl, serviceKey, { runner: FN, scope: "fatal", error: message });
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
