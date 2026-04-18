import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

async function callFunction(supabaseUrl: string, authKey: string, fnName: string, body: any): Promise<any> {
  const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return resp.json();
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { steps_override } = await req.json().catch(() => ({}));
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get automation settings
    const settingsMap: Record<string, any> = {};
    const { data: allSettings } = await supabase.from("outreach_settings").select("setting_key, setting_value");
    if (allSettings) allSettings.forEach((s: any) => { settingsMap[s.setting_key] = s.setting_value; });

    const dryRun = settingsMap.dry_run_mode === true;
    const startedAt = new Date().toISOString();

    const stepsResult: Record<string, any> = {};
    const errors: string[] = [];

    // Step 1: Enrich (if enabled)
    const runEnrich = steps_override?.enrich ?? settingsMap.auto_enrichment_enabled === true;
    if (runEnrich) {
      try {
        const result = await callFunction(supabaseUrl, serviceKey, "outreach-enrich-lead", { enrich_all_unenriched: true });
        stepsResult.enrich = result;
      } catch (e) {
        stepsResult.enrich = { error: e instanceof Error ? e.message : "Failed" };
        errors.push(`Enrich: ${e instanceof Error ? e.message : "Failed"}`);
      }
    }

    // Step 2: Rate (if enabled)
    const runRate = steps_override?.rate ?? settingsMap.auto_rating_enabled === true;
    if (runRate) {
      try {
        const result = await callFunction(supabaseUrl, serviceKey, "rate-outreach-leads", { rate_all_new: true });
        stepsResult.rate = result;
      } catch (e) {
        stepsResult.rate = { error: e instanceof Error ? e.message : "Failed" };
        errors.push(`Rate: ${e instanceof Error ? e.message : "Failed"}`);
      }
    }

    // Step 3: Draft (if enabled)
    const runDraft = steps_override?.draft ?? settingsMap.auto_drafting_enabled === true;
    if (runDraft) {
      try {
        const result = await callFunction(supabaseUrl, serviceKey, "outreach-generate-drafts", { draft_all_qualified: true });
        stepsResult.draft = result;
      } catch (e) {
        stepsResult.draft = { error: e instanceof Error ? e.message : "Failed" };
        errors.push(`Draft: ${e instanceof Error ? e.message : "Failed"}`);
      }
    }

    // Step 4: Send (if enabled)
    const runSend = steps_override?.send ?? settingsMap.auto_sending_enabled === true;
    if (runSend) {
      try {
        const result = await callFunction(supabaseUrl, serviceKey, "outreach-send-email", { send_all_approved: true });
        stepsResult.send = result;
      } catch (e) {
        stepsResult.send = { error: e instanceof Error ? e.message : "Failed" };
        errors.push(`Send: ${e instanceof Error ? e.message : "Failed"}`);
      }
    }

    // Step 5: Follow-up (if enabled)
    const runFollowup = steps_override?.followup ?? settingsMap.auto_followup_enabled === true;
    if (runFollowup) {
      try {
        const result = await callFunction(supabaseUrl, serviceKey, "outreach-followup-runner", {});
        stepsResult.followup = result;
      } catch (e) {
        stepsResult.followup = { error: e instanceof Error ? e.message : "Failed" };
        errors.push(`Followup: ${e instanceof Error ? e.message : "Failed"}`);
      }
    }

    const finishedAt = new Date().toISOString();

    // Write run log
    const totals = {
      enriched: stepsResult.enrich?.enriched || 0,
      rated: stepsResult.rate?.rated || 0,
      drafted: stepsResult.draft?.drafted || 0,
      sent: stepsResult.send?.sent || 0,
      followups: stepsResult.followup?.followups || 0,
    };

    const { data: runLog } = await supabase.from("outreach_run_logs").insert({
      run_type: "full_pipeline",
      started_at: startedAt,
      finished_at: finishedAt,
      steps: stepsResult,
      totals,
      errors: errors.length > 0 ? errors : null,
      dry_run: dryRun,
      triggered_by: "manual",
    }).select("id").single();

    const runId = runLog?.id || null;

    // ── Notify admin of pipeline completion ──
    try {
      const summary = `Pipeline ${dryRun ? "(dry run) " : ""}complete: ${totals.enriched} enriched, ${totals.rated} rated, ${totals.drafted} drafted, ${totals.sent} sent`;
      await supabase.from("notification_log").insert({
        admin_user_id: null,
        event_type: "system",
        entity_type: "outreach_pipeline",
        entity_id: runId,
        message: summary,
        status: "pending",
      });
    } catch (notifyErr) {
      console.error("Pipeline notification failed:", notifyErr);
    }

    // ── Notify admin of pipeline errors ──
    if (errors.length > 0) {
      try {
        await supabase.from("notification_log").insert({
          admin_user_id: null,
          event_type: "alert",
          entity_type: "outreach_pipeline",
          entity_id: runId,
          message: `Pipeline errors: ${errors.slice(0, 3).join("; ")}`,
          status: "pending",
        });
      } catch (notifyErr) {
        console.error("Pipeline error notification failed:", notifyErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        started_at: startedAt,
        finished_at: finishedAt,
        totals,
        steps: stepsResult,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("outreach-pipeline-runner error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
