import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Expire pending cover requests
    const { data: expiredCount } = await supabase.rpc("expire_pending_covers");
    console.log(`Expired ${expiredCount || 0} pending cover requests`);

    // 2. Get tomorrow's shifts with staff info
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: shifts, error: shiftsError } = await supabase
      .from("staff_shifts")
      .select("id, staff_id, shift_date, shift_type, start_time, end_time, staff:staff_id(first_name, last_name, phone)")
      .eq("shift_date", tomorrowStr);

    if (shiftsError) {
      throw new Error(`Failed to fetch shifts: ${shiftsError.message}`);
    }

    // 3. Insert ai_events for each shift reminder
    const events = (shifts || []).map((shift: any) => ({
      event_type: "shift.daily_reminder",
      entity_type: "staff_shift",
      entity_id: shift.id,
      payload: {
        staff_id: shift.staff_id,
        staff_name: shift.staff ? `${shift.staff.first_name} ${shift.staff.last_name}` : "Unknown",
        staff_phone: shift.staff?.phone || null,
        shift_date: shift.shift_date,
        shift_type: shift.shift_type,
        start_time: shift.start_time,
        end_time: shift.end_time,
      },
    }));

    if (events.length > 0) {
      const { error: insertError } = await supabase
        .from("ai_events")
        .insert(events);
      if (insertError) {
        console.error("Failed to insert reminder events:", insertError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expired_covers: expiredCount || 0,
        reminders_sent: events.length,
        date: tomorrowStr,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("shift-daily-reminders error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
