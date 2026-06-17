import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { canBootstrapFirstAdmin, validateBootstrapInput } from "./guard.ts";

/**
 * bootstrap-admin — ONE-TIME first-admin bootstrap (see CUTOVER_RUNBOOK.md Step C).
 *
 * Creates/promotes a super_admin staff row for a given (already-created) auth user.
 * Self-disabling: refuses once any super_admin exists, so it cannot escalate later.
 * Service-role only — not a public endpoint. The atomic guarantee is enforced in the SQL
 * function public.bootstrap_first_admin; the TS guard here is a fast, clean pre-check.
 */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Gate to the service role — this is a cutover tool, never public.
    const auth = req.headers.get("Authorization") || "";
    if (!SERVICE_ROLE || auth !== `Bearer ${SERVICE_ROLE}`) {
      return json(401, { error: "Unauthorized — service role required" });
    }

    const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE!);

    const body = await req.json().catch(() => ({}));
    const v = validateBootstrapInput(body);
    if (!v.ok) {
      return json(400, { error: v.error });
    }

    // Fast pre-check for a clean 409 (the SQL function is the atomic backstop).
    const decision = await canBootstrapFirstAdmin(supabase);
    if (!decision.allowed) {
      const status = decision.reason === "super_admin_exists" ? 409 : 503;
      return json(status, { error: `bootstrap refused: ${decision.reason}` });
    }

    // Atomic create/promote + guard inside the DB (closes any race window).
    const { data, error } = await supabase.rpc("bootstrap_first_admin", {
      p_user_id: v.value.user_id,
      p_email: v.value.email,
      p_first_name: v.value.first_name,
      p_last_name: v.value.last_name,
    });

    if (error) {
      // SQL guard raises if a super_admin appeared between pre-check and now.
      return json(409, { error: `bootstrap refused at DB: ${error.message}` });
    }

    return json(200, { success: true, staff_id: data, role: "super_admin" });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
