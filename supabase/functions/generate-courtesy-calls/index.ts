import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { runCourtesyGeneration } from "../_shared/courtesy-generate-run.ts";

/*
  TRANSPORT ONLY. The run itself is in `_shared/courtesy-generate-run.ts` so it can be EXECUTED
  by a test rather than only read — see the comment at the top of that file for why this repo
  stopped trusting source scans for edge-function logic.
*/
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    const result = await runCourtesyGeneration(supabase, today);

    const response = { success: true, date: today.toISOString(), ...result };
    console.log("Courtesy call generation complete:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    console.error("Error generating courtesy calls:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
