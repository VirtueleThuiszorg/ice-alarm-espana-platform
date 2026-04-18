import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface DeviceInput {
  imei: string;
  sim_phone_number: string;
  sim_iccid?: string;
  serial_number?: string;
  model?: string;
}

interface AddPayload {
  action: "add";
  devices: DeviceInput[];
}

interface RemovePayload {
  action: "remove";
  imei: string;
  reason?: string;
}

type Payload = AddPayload | RemovePayload;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("EV07B_CHECKIN_KEY");

    if (!expectedKey) {
      console.error("EV07B_CHECKIN_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: jh }
      );
    }

    if (!apiKey || apiKey !== expectedKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or missing API key" }),
        { status: 401, headers: jh }
      );
    }

    const body: Payload = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // HANDLE ADD
    if (body.action === "add") {
      if (!body.devices || !Array.isArray(body.devices) || body.devices.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "devices array is required" }),
          { status: 400, headers: jh }
        );
      }

      const results = [];

      for (const device of body.devices) {
        if (!device.imei || !device.sim_phone_number) {
          results.push({
            imei: device.imei || "unknown",
            status: "error",
            error: "imei and sim_phone_number are required",
          });
          continue;
        }

        const { data: existing } = await supabase
          .from("devices")
          .select("id, status")
          .eq("imei", device.imei)
          .maybeSingle();

        if (existing) {
          results.push({
            imei: device.imei,
            device_id: existing.id,
            status: "already_exists",
            current_status: existing.status,
          });
          continue;
        }

        const { data: newDevice, error: insertError } = await supabase
          .from("devices")
          .insert({
            imei: device.imei,
            sim_phone_number: device.sim_phone_number,
            sim_iccid: device.sim_iccid || null,
            serial_number: device.serial_number || null,
            model: device.model || "EV-07B",
            device_type: "pendant",
            status: "in_stock",
            is_online: false,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("Error creating device:", insertError);
          results.push({
            imei: device.imei,
            status: "error",
            error: insertError.message,
          });
          continue;
        }

        results.push({
          imei: device.imei,
          device_id: newDevice.id,
          status: "created",
        });

        console.log(`Stock sync: Added device ${device.imei} to Spanish stock`);
      }

      return new Response(
        JSON.stringify({ success: true, action: "add", results }),
        { headers: jh }
      );
    }

    // HANDLE REMOVE
    if (body.action === "remove") {
      if (!body.imei) {
        return new Response(
          JSON.stringify({ success: false, error: "imei is required" }),
          { status: 400, headers: jh }
        );
      }

      const { data: device, error: fetchError } = await supabase
        .from("devices")
        .select("id, status, member_id")
        .eq("imei", body.imei)
        .maybeSingle();

      if (fetchError || !device) {
        return new Response(
          JSON.stringify({ success: false, error: "Device not found" }),
          { status: 404, headers: jh }
        );
      }

      if (device.member_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Cannot remove device - currently allocated to a member",
            device_id: device.id,
            status: device.status,
          }),
          { status: 409, headers: jh }
        );
      }

      const { error: updateError } = await supabase
        .from("devices")
        .update({
          status: "returned",
          notes: body.reason || "Returned to MonitorLinq",
        })
        .eq("id", device.id);

      if (updateError) {
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { status: 500, headers: jh }
        );
      }

      console.log(`Stock sync: Removed device ${body.imei} - ${body.reason || "returned"}`);

      return new Response(
        JSON.stringify({
          success: true,
          action: "remove",
          imei: body.imei,
          device_id: device.id,
        }),
        { headers: jh }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action. Use 'add' or 'remove'" }),
      { status: 400, headers: jh }
    );
  } catch (error) {
    console.error("Stock sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: jh }
    );
  }
});
