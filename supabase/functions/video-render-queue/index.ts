import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Environment configuration
const RENDER_WORKER_URL = Deno.env.get("RENDER_WORKER_URL");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "video-hub-secret";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { project_id, format_override } = await req.json();

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify project exists and get data
    const { data: project, error: projectError } = await supabase
      .from("video_projects")
      .select("id, name, status, format, duration, language, template_id, data_json")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Project not found", message: "The video project could not be found. It may have been deleted." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch template settings if project references a template
    let template = null;
    if (project.template_id) {
      const { data: tpl } = await supabase
        .from("video_templates")
        .select("id, name, allowed_formats, allowed_durations, remotion_id")
        .eq("id", project.template_id)
        .single();
      template = tpl;
    }

    // Fetch brand settings
    const { data: brandSettings } = await supabase
      .from("video_brand_settings")
      .select("logo_url, primary_color, secondary_color, font_family, watermark_enabled, disclaimers_en, disclaimers_es, default_cta_en, default_cta_es")
      .limit(1)
      .maybeSingle();

    // Determine format: use override if provided, otherwise use project default
    const renderFormat = format_override || project.format;

    // Validate format against template allowed_formats
    if (template?.allowed_formats && !template.allowed_formats.includes(renderFormat)) {
      return new Response(
        JSON.stringify({ error: `Format ${renderFormat} is not allowed by template ${template.name}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update project status to "rendering" (only if not already rendering)
    if (project.status !== "rendering") {
      await supabase
        .from("video_projects")
        .update({ status: "rendering" })
        .eq("id", project_id);
    }

    // Create a render record with queued status (include format)
    const { data: render, error: renderError } = await supabase
      .from("video_renders")
      .insert({
        project_id,
        status: "queued",
        progress: 0,
        stage: "queued",
      })
      .select()
      .single();

    if (renderError) {
      console.error("Error creating render:", renderError);
      // Revert project status on failure
      await supabase
        .from("video_projects")
        .update({ status: project.status })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: "Failed to queue render", message: "Could not create the render job. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If RENDER_WORKER_URL is configured, call the external render worker
    if (RENDER_WORKER_URL) {
      try {
        console.log(`[Queue] Calling render worker at ${RENDER_WORKER_URL}`);
        
        const workerResponse = await fetch(`${RENDER_WORKER_URL}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            render_id: render.id,
            project_id,
            format: renderFormat,
            project_name: project.name,
            duration: project.duration,
            language: project.language,
            data_json: project.data_json,
            template: template ? { id: template.id, name: template.name, remotion_id: template.remotion_id } : null,
            brand: brandSettings || null,
            token: WEBHOOK_SECRET,
          }),
        });

        if (!workerResponse.ok) {
          const errorText = await workerResponse.text();
          console.error(`[Queue] Worker error: ${workerResponse.status} - ${errorText}`);
          throw new Error(`Worker returned ${workerResponse.status}`);
        }

        const workerResult = await workerResponse.json();
        console.log(`[Queue] Worker accepted job:`, workerResult);

        // Update render with worker job ID if provided
        if (workerResult.job_id) {
          await supabase
            .from("video_renders")
            .update({ worker_job_id: workerResult.job_id })
            .eq("id", render.id);
        }

        return new Response(
          JSON.stringify({
            success: true,
            render_id: render.id,
            format: renderFormat,
            worker_job_id: workerResult.job_id,
            status: "queued",
            message: "Render queued successfully. The video will be available in the Exports tab once complete.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (workerError: unknown) {
        const err = workerError as Error;
        console.error(`[Queue] Failed to call render worker:`, err.message);
        
        // Mark render as failed if worker is unreachable
        await supabase
          .from("video_renders")
          .update({ 
            status: "failed", 
            error: `Render worker unavailable: ${err.message}` 
          })
          .eq("id", render.id);

        await supabase
          .from("video_projects")
          .update({ status: "draft" })
          .eq("id", project_id);

        return new Response(
          JSON.stringify({
            error: "Render worker unavailable. Please try again later.",
            message: "The render service is currently unavailable. Please try again in a few minutes.",
            details: err.message
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // FALLBACK: Simulated rendering (for development/demo when no worker configured)
    console.log(`[Queue] No RENDER_WORKER_URL configured - using simulated render for format: ${renderFormat}`);
    simulateRenderCompletion(supabaseUrl, supabaseServiceKey, render.id, project_id, renderFormat);

    return new Response(
      JSON.stringify({
        success: true,
        render_id: render.id,
        format: renderFormat,
        status: "queued",
        message: "Render queued successfully (simulated mode). The video will be available in the Exports tab once complete.",
        mode: "simulated",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Error in video-render-queue:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Render stages with progress milestones
const RENDER_STAGES = [
  { stage: "initializing", progress: 10 },
  { stage: "generating", progress: 30 },
  { stage: "processing", progress: 50 },
  { stage: "compositing", progress: 70 },
  { stage: "encoding", progress: 90 },
  { stage: "finalizing", progress: 100 },
];

// Simulate render completion with stage tracking (fallback for dev/demo)
async function simulateRenderCompletion(
  supabaseUrl: string, 
  supabaseKey: string, 
  renderId: string, 
  projectId: string,
  format: string
) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Update to running status
    await supabase
      .from("video_renders")
      .update({ status: "running", progress: 5, stage: "initializing" })
      .eq("id", renderId);

    console.log(`[Render ${renderId}] Started (simulated) - Stage: initializing, Format: ${format}`);

    // Progress through each stage
    for (const { stage, progress } of RENDER_STAGES) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      await supabase
        .from("video_renders")
        .update({ progress, stage })
        .eq("id", renderId);
      
      console.log(`[Render ${renderId}] Stage: ${stage}, Progress: ${progress}%`);
    }

    // Mark as done
    await supabase
      .from("video_renders")
      .update({ status: "done", progress: 100, stage: "finalizing" })
      .eq("id", renderId);

    // Update project status to "approved"
    await supabase
      .from("video_projects")
      .update({ status: "approved" })
      .eq("id", projectId);

    // Create export record with demo video placeholder (include format)
    const demoVideoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
    const demoThumbnail = "https://storage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg";
    const demoVttUrl = null; // No captions in simulated mode

    await supabase
      .from("video_exports")
      .insert({
        project_id: projectId,
        render_id: renderId,
        mp4_url: demoVideoUrl,
        srt_url: null,
        vtt_url: demoVttUrl,
        thumbnail_url: demoThumbnail,
        format: format, // Store the format variant
      });

    console.log(`[Render ${renderId}] Completed successfully (simulated) - Format: ${format}`);
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[Render ${renderId}] Error:`, error);
    
    // Mark as failed
    await supabase
      .from("video_renders")
      .update({ 
        status: "failed", 
        error: error.message || "Unknown error during render" 
      })
      .eq("id", renderId);

    // Revert project status to draft on failure
    await supabase
      .from("video_projects")
      .update({ status: "draft" })
      .eq("id", projectId);
  }
}
