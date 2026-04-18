import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



/**
 * EV-07B Offline Monitor
 * 
 * Monitoring thresholds for devices that ping every 30 seconds:
 * - ONLINE: last check-in within 2 minutes (120s)
 * - OFFLINE: last check-in older than 2 minutes
 * - ALERT: only created after 5 minutes (300s) offline
 * 
 * Should be run every 1 minute via cron job or external scheduler.
 */

// Threshold constants (in seconds)
const ONLINE_WINDOW_SECONDS = 120;      // 2 minutes - device considered online if checked in within this window
const OFFLINE_ALERT_SECONDS = 300;       // 5 minutes - create alert only after this duration offline

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

    const now = new Date();
    const onlineThreshold = new Date(now.getTime() - ONLINE_WINDOW_SECONDS * 1000);
    const alertThreshold = new Date(now.getTime() - OFFLINE_ALERT_SECONDS * 1000);

    // Fetch all EV-07B devices that are in active statuses
    const { data: devices, error: fetchError } = await supabase
      .from("devices")
      .select("id, imei, member_id, last_checkin_at, is_online, offline_since")
      .eq("model", "EV-07B")
      .in("status", ["allocated", "with_staff", "live"]);

    if (fetchError) {
      throw new Error(`Failed to fetch devices: ${fetchError.message}`);
    }

    let onlineCount = 0;
    let offlineCount = 0;
    let newlyOfflineCount = 0;
    let alertsCreatedCount = 0;
    const newlyOfflineDevices: { id: string; imei: string; member_id: string | null }[] = [];

    for (const device of devices || []) {
      const lastCheckin = device.last_checkin_at ? new Date(device.last_checkin_at) : null;
      const isCurrentlyOnline = lastCheckin && lastCheckin >= onlineThreshold;

      // Device is online (checked in within 2 minutes)
      if (isCurrentlyOnline) {
        // Only update if status has changed
        if (device.is_online !== true || device.offline_since !== null) {
          await supabase
            .from("devices")
            .update({
              is_online: true,
              offline_since: null,
            })
            .eq("id", device.id);
        }
        onlineCount++;
      } else {
        // Device is offline (no check-in within 2 minutes)
        const wasOnline = device.is_online === true;
        const offlineSinceNotSet = device.offline_since === null;

        // Set offline status and record when it went offline
        if (wasOnline || offlineSinceNotSet) {
          const offlineSince = device.offline_since || now.toISOString();
          await supabase
            .from("devices")
            .update({
              is_online: false,
              offline_since: offlineSince,
            })
            .eq("id", device.id);

          if (wasOnline) {
            newlyOfflineCount++;
            newlyOfflineDevices.push({
              id: device.id,
              imei: device.imei,
              member_id: device.member_id,
            });
          }
        }
        offlineCount++;

        // Check if we should create an alert (5+ minutes offline)
        const deviceOfflineSince = device.offline_since 
          ? new Date(device.offline_since) 
          : (lastCheckin || now);
        
        const offlineDurationMs = now.getTime() - deviceOfflineSince.getTime();
        const shouldCreateAlert = offlineDurationMs >= OFFLINE_ALERT_SECONDS * 1000;

        if (shouldCreateAlert && device.member_id) {
          // Check if there's already an open alert for this device
          const { data: existingAlert } = await supabase
            .from("alerts")
            .select("id")
            .eq("device_id", device.id)
            .eq("alert_type", "device_offline")
            .eq("status", "incoming")
            .maybeSingle();

          if (!existingAlert) {
            // Create new alert - device has been offline for 5+ minutes
            const offlineMinutes = Math.floor(offlineDurationMs / 60000);
            const { data: newAlert } = await supabase.from("alerts").insert({
              device_id: device.id,
              member_id: device.member_id,
              alert_type: "device_offline",
              status: "incoming",
              message: `EV-07B device (IMEI: ${device.imei}) has been offline for ${offlineMinutes} minutes`,
              received_at: now.toISOString(),
            }).select("id").single();
            
            console.log(`Created offline alert for device ${device.imei} (offline ${offlineMinutes} min)`);
            alertsCreatedCount++;

            // Notify partner and admin
            if (newAlert?.id) {
              const baseUrl = Deno.env.get("SUPABASE_URL")!;
              const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

              // Notify partner
              try {
                await fetch(`${baseUrl}/functions/v1/partner-alert-notify`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceKey}`
                  },
                  body: JSON.stringify({
                    alert_id: newAlert.id,
                    member_id: device.member_id
                  })
                });
              } catch (notifyErr) {
                console.error("Partner notification error:", notifyErr);
              }

              // Fetch member name for admin notification
              let memberName = "Unknown";
              try {
                const { data: member } = await supabase
                  .from("members")
                  .select("first_name, last_name")
                  .eq("id", device.member_id)
                  .maybeSingle();
                if (member) {
                  memberName = `${member.first_name || ""} ${member.last_name || ""}`.trim() || "Unknown";
                }
              } catch (_) { /* non-critical */ }

              // Notify admin via WhatsApp
              try {
                await fetch(`${baseUrl}/functions/v1/notify-admin`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceKey}`
                  },
                  body: JSON.stringify({
                    event_type: "ev07b.alert",
                    entity_type: "alert",
                    entity_id: newAlert.id,
                    payload: {
                      alert_id: newAlert.id,
                      alert_type: "device_offline",
                      member_id: device.member_id,
                      member_name: memberName,
                      imei: device.imei,
                      message: `EV-07B device (IMEI: ${device.imei}) has been offline for ${offlineMinutes} minutes`,
                    },
                  })
                });
              } catch (notifyErr) {
                console.error("Admin notification error:", notifyErr);
              }
            }
          }
        }
      }
    }

    const result = {
      success: true,
      timestamp: now.toISOString(),
      thresholds: {
        onlineWindowSeconds: ONLINE_WINDOW_SECONDS,
        offlineAlertSeconds: OFFLINE_ALERT_SECONDS,
      },
      stats: {
        total: devices?.length || 0,
        online: onlineCount,
        offline: offlineCount,
        newlyOffline: newlyOfflineCount,
        alertsCreated: alertsCreatedCount,
      },
    };

    console.log("EV-07B offline monitor completed:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Offline monitor error:", error);
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
