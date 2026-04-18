import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface SosAlertPayload {
  imei: string;
  alarm_type: "sos" | "fall" | "low_battery" | "geo_fence";
  lat?: number;
  lng?: number;
  battery_level?: number;
  caller_phone?: string;
}

const ALARM_TO_ALERT_TYPE: Record<string, string> = {
  sos: "sos_button",
  fall: "fall_detected",
  low_battery: "low_battery",
  geo_fence: "geo_fence",
};

const ALERT_MESSAGES: Record<string, (imei: string) => string> = {
  sos_button: (imei) => `SOS button pressed on pendant ${imei}`,
  fall_detected: (imei) => `Fall detected on pendant ${imei}`,
  low_battery: (imei) => `Low battery alert on pendant ${imei}`,
  geo_fence: (imei) => `Geofence boundary alert on pendant ${imei}`,
};

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * EV-07B SOS Alert Edge Function
 *
 * Creates alerts for SOS, fall, low battery, and geofence events.
 * De-duplicates: skips if active alert of same type exists within 5 minutes.
 * Notifies partners and admin via WhatsApp.
 */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate API key
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("EV07B_CHECKIN_KEY");

    if (!expectedKey) {
      console.error("EV07B_CHECKIN_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!apiKey || apiKey !== expectedKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or missing API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: SosAlertPayload = await req.json();

    if (!body.imei || !body.alarm_type) {
      return new Response(
        JSON.stringify({ success: false, error: "imei and alarm_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const alertType = ALARM_TO_ALERT_TYPE[body.alarm_type];
    if (!alertType) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown alarm_type: ${body.alarm_type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find device by IMEI
    const { data: device, error: fetchError } = await supabase
      .from("devices")
      .select("id, imei, member_id, sim_phone_number, last_location_lat, last_location_lng")
      .eq("imei", body.imei)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching device:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!device) {
      return new Response(
        JSON.stringify({ success: false, error: "Device not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!device.member_id) {
      console.log(`SOS alert for unassigned device ${body.imei} — skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Device not assigned to a member" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // De-duplicate: skip if active alert of same type within 5 minutes
    const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: recentAlert } = await supabase
      .from("alerts")
      .select("id")
      .eq("device_id", device.id)
      .eq("alert_type", alertType)
      .in("status", ["incoming", "in_progress"])
      .gte("received_at", windowStart)
      .maybeSingle();

    if (recentAlert) {
      console.log(`Duplicate ${alertType} alert for ${body.imei} within 5min — skipping`);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "Duplicate alert within dedup window",
          existing_alert_id: recentAlert.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine location (prefer payload, fall back to device's last known)
    const lat = (typeof body.lat === "number" && body.lat >= -90 && body.lat <= 90)
      ? body.lat
      : device.last_location_lat;
    const lng = (typeof body.lng === "number" && body.lng >= -180 && body.lng <= 180)
      ? body.lng
      : device.last_location_lng;

    const message = ALERT_MESSAGES[alertType]?.(body.imei) || `Alert: ${alertType}`;
    const now = new Date().toISOString();

    // Create alert record
    const { data: newAlert, error: insertError } = await supabase
      .from("alerts")
      .insert({
        device_id: device.id,
        member_id: device.member_id,
        alert_type: alertType,
        status: "incoming",
        message,
        received_at: now,
        location_lat: lat,
        location_lng: lng,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating alert:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create alert" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Created ${alertType} alert ${newAlert.id} for device ${body.imei}`);

    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // HIGHEST PRIORITY: Notify emergency contacts first
    try {
      await fetch(`${baseUrl}/functions/v1/emergency-contact-notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          alert_id: newAlert.id,
          member_id: device.member_id,
        }),
      });
    } catch (err) {
      console.error("Emergency contact notification error:", err);
    }

    // Notify partners (non-blocking)
    try {
      await fetch(`${baseUrl}/functions/v1/partner-alert-notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          alert_id: newAlert.id,
          member_id: device.member_id,
        }),
      });
    } catch (err) {
      console.error("Partner notification error:", err);
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

    // Notify admin via WhatsApp (non-blocking)
    try {
      await fetch(`${baseUrl}/functions/v1/notify-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          event_type: "ev07b.alert",
          entity_type: "alert",
          entity_id: newAlert.id,
          payload: {
            alert_id: newAlert.id,
            alert_type: alertType,
            member_id: device.member_id,
            member_name: memberName,
            imei: body.imei,
            message,
            lat: lat || null,
            lng: lng || null,
          },
        }),
      });
    } catch (err) {
      console.error("Admin notification error:", err);
    }

    return new Response(
      JSON.stringify({
        success: true,
        alert_id: newAlert.id,
        alert_type: alertType,
        device_id: device.id,
        member_id: device.member_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SOS alert error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
