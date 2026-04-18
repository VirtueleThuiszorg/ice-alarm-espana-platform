import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { saveDraftSchema, validateRequest } from "../_shared/validation.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";

const MAX_WIZARD_DATA_SIZE = 50_000; // ~50KB

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit: 20 requests per 15 minutes per IP
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(clientIp, 20, 15 * 60_000);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const rawBody = await req.json();
    const validated = validateRequest(saveDraftSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;
    const { sessionId, currentStep, wizardData } = validated.data;

    // Validate payload size to prevent storage abuse
    const wizardDataStr = JSON.stringify(wizardData);
    if (wizardDataStr.length > MAX_WIZARD_DATA_SIZE) {
      return new Response(
        JSON.stringify({ error: "Draft data too large" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract key identifiable info from wizard data for quick access
    const wd = wizardData as Record<string, any>;
    const pm = wd?.primaryMember || {};
    const email = pm?.email || null;
    const phone = pm?.phone || null;
    const firstName = pm?.firstName || null;
    const lastName = pm?.lastName || null;

    // Upsert the draft - update if exists, insert if new
    const { data, error } = await supabase
      .from("registration_drafts")
      .upsert(
        {
          session_id: sessionId,
          email,
          phone,
          first_name: firstName,
          last_name: lastName,
          current_step: currentStep,
          wizard_data: wizardData,
          source: "join_wizard",
          status: "in_progress",
          updated_at: new Date().toISOString(),
        },
        { 
          onConflict: "session_id",
          ignoreDuplicates: false 
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving draft:", error);
      return new Response(
        JSON.stringify({ error: "Failed to save draft", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, draftId: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
