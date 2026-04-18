import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "video-hub-secret";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, "x-webhook-secret");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const providedSecret = req.headers.get("x-webhook-secret");
    if (providedSecret !== WEBHOOK_SECRET) {
      return new Response(
        JSON.stringify({ error: "Invalid webhook secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { 
      render_id, 
      project_id, 
      event, 
      status, 
      progress, 
      stage, 
      error,
      mp4_url,
      thumbnail_url,
      vtt_url,
      srt_url,
      format, // Format variant for exports
    } = body;

    console.log(`[Webhook] Event: ${event}, Render: ${render_id}, Status: ${status}`);

    if (!render_id) {
      return new Response(
        JSON.stringify({ error: "render_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (event) {
      case "progress":
        // Update render progress
        await supabase
          .from("video_renders")
          .update({ 
            status: status || "running", 
            progress: progress || 0, 
            stage: stage || null 
          })
          .eq("id", render_id);
        break;

      case "completed": {
        // Mark render as done
        await supabase
          .from("video_renders")
          .update({ status: "done", progress: 100, stage: "finalizing" })
          .eq("id", render_id);

        // Update project status to approved
        if (project_id) {
          await supabase
            .from("video_projects")
            .update({ status: "approved" })
            .eq("id", project_id);
        }

        // Create export record with format variant
        if (mp4_url) {
          const { error: exportError } = await supabase
            .from("video_exports")
            .insert({
              project_id,
              render_id,
              mp4_url,
              thumbnail_url: thumbnail_url || null,
              vtt_url: vtt_url || null,
              srt_url: srt_url || null,
              format: format || null, // Store format variant
            });

          if (exportError) {
            console.error("[Webhook] Export insert error:", exportError);
          }
        }

        // ── Notify admin of render completion ──
        try {
          let projectName = "Untitled";
          if (project_id) {
            const { data: proj } = await supabase.from("video_projects").select("name").eq("id", project_id).single();
            if (proj?.name) projectName = proj.name;
          }
          await supabase.from("notification_log").insert({
            admin_user_id: null,
            event_type: "system",
            entity_type: "video_render",
            entity_id: render_id,
            message: `Video render complete: "${projectName}"`,
            status: "pending",
          });
        } catch (notifyErr) {
          console.error("Render notification failed:", notifyErr);
        }
        break;
      }

      case "failed": {
        const errorMessage = error || "Unknown render error";

        // Mark render as failed
        await supabase
          .from("video_renders")
          .update({
            status: "failed",
            error: errorMessage
          })
          .eq("id", render_id);

        // Revert project status to draft
        if (project_id) {
          await supabase
            .from("video_projects")
            .update({ status: "draft" })
            .eq("id", project_id);
        }

        // ── Notify admin of render failure ──
        try {
          let projectName = "Untitled";
          if (project_id) {
            const { data: proj } = await supabase.from("video_projects").select("name").eq("id", project_id).single();
            if (proj?.name) projectName = proj.name;
          }
          await supabase.from("notification_log").insert({
            admin_user_id: null,
            event_type: "alert",
            entity_type: "video_render",
            entity_id: render_id,
            message: `Video render failed: "${projectName}" — ${errorMessage}`,
            status: "pending",
          });
        } catch (notifyErr) {
          console.error("Render failure notification failed:", notifyErr);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unknown event: ${event}`);
    }

    return new Response(
      JSON.stringify({ success: true, event, render_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
