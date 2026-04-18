import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * Staff Shift Monitor
 *
 * Runs every 2 minutes via pg_cron. Performs three checks:
 * 1. No-show: scheduled staff who haven't signed in after grace period
 * 2. No coverage: nobody on duty at all
 * 3. Disconnected: on-duty staff whose heartbeat has gone stale
 */

// Grace period after shift start before alerting (in minutes)
const NO_SHOW_GRACE_MINUTES = 5;

// Heartbeat staleness threshold (in seconds) — 90s means 3 missed 30s heartbeats
const HEARTBEAT_STALE_SECONDS = 90;

// Shift schedule (Madrid timezone)
const SHIFTS = {
  morning: { start: 7, end: 15 },
  afternoon: { start: 15, end: 23 },
  night: { start: 23, end: 7 },
} as const;

function getCurrentShiftType(hour: number): string {
  if (hour >= 7 && hour < 15) return "morning";
  if (hour >= 15 && hour < 23) return "afternoon";
  return "night";
}

function getShiftStartHour(shiftType: string): number {
  return SHIFTS[shiftType as keyof typeof SHIFTS]?.start ?? 0;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get current time in Madrid
    const now = new Date();
    const madridFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const madridParts = madridFormatter.formatToParts(now);
    const madridHour = parseInt(madridParts.find((p) => p.type === "hour")?.value || "0");
    const madridMinute = parseInt(madridParts.find((p) => p.type === "minute")?.value || "0");

    const currentShift = getCurrentShiftType(madridHour);
    const shiftStartHour = getShiftStartHour(currentShift);

    // Calculate minutes since shift started
    let minutesSinceShiftStart: number;
    if (currentShift === "night" && madridHour < 7) {
      // After midnight in night shift
      minutesSinceShiftStart = (madridHour + 24 - 23) * 60 + madridMinute;
    } else {
      minutesSinceShiftStart = (madridHour - shiftStartHour) * 60 + madridMinute;
    }

    const today = new Date().toISOString().split("T")[0];

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

    const result = {
      success: true,
      timestamp: now.toISOString(),
      currentShift,
      minutesSinceShiftStart,
      stats,
    };

    console.log("Staff shift monitor completed:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Staff shift monitor error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
