import express from "express";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { renderVideo } from "./renderer";
import { generateCaptions } from "./captions";
import { uploadToStorage } from "./storage";

// Environment configuration
const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "video-hub-secret";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const app = express();
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Render job endpoint
app.post("/render", async (req, res) => {
  const { render_id, project_id, token } = req.body;

  // Validate webhook secret
  if (token !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid token" });
  }

  if (!render_id || !project_id) {
    return res.status(400).json({ error: "render_id and project_id required" });
  }

  // Immediately respond - work happens in background
  res.json({ status: "accepted", job_id: uuidv4() });

  // Process render in background
  processRenderJob(render_id, project_id).catch((err) => {
    console.error(`[Render ${render_id}] Fatal error:`, err);
  });
});

async function processRenderJob(renderId: string, projectId: string) {
  console.log(`[Render ${renderId}] Starting job for project ${projectId}`);

  try {
    // Update status to running
    await updateRenderStatus(renderId, "running", 5, "initializing");

    // Fetch project data
    const { data: project, error: projectError } = await supabase
      .from("video_projects")
      .select("*, video_templates(*)")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error(`Project not found: ${projectError?.message}`);
    }

    // Fetch brand settings
    const { data: brandSettings } = await supabase
      .from("video_brand_settings")
      .select("*")
      .limit(1)
      .single();

    console.log(`[Render ${renderId}] Project: ${project.name}, Template: ${project.video_templates?.name || "none"}`);

    // Stage 1: Generating scenes (10-30%)
    await updateRenderStatus(renderId, "running", 15, "generating");

    // Build composition props
    const compositionProps = {
      headline: project.data_json?.headline || "",
      bullets: project.data_json?.bullets || [],
      ctaText: project.data_json?.ctaText || brandSettings?.default_cta_en || "Call Now",
      contactLine: project.data_json?.contactLine || "",
      logoUrl: brandSettings?.logo_url || null,
      primaryColor: brandSettings?.primary_color || "#E63946",
      duration: project.duration,
      format: project.format,
      language: project.language,
    };

    await updateRenderStatus(renderId, "running", 30, "generating");

    // Stage 2: Processing audio (30-50%)
    await updateRenderStatus(renderId, "running", 40, "processing");
    
    // Generate captions/subtitles from content
    const captions = await generateCaptions(compositionProps, project.duration);
    
    await updateRenderStatus(renderId, "running", 50, "processing");

    // Stage 3: Compositing (50-70%)
    await updateRenderStatus(renderId, "running", 55, "compositing");

    // Render the video using Remotion
    const { videoPath, thumbnailPath } = await renderVideo({
      compositionId: "IceAlarmVideo",
      props: compositionProps,
      outputDir: `/tmp/renders/${renderId}`,
      format: project.format,
      duration: project.duration,
      onProgress: async (progress: number) => {
        // Map 0-100 to 55-90%
        const mappedProgress = 55 + Math.floor(progress * 0.35);
        await updateRenderStatus(renderId, "running", mappedProgress, progress < 50 ? "compositing" : "encoding");
      },
    });

    await updateRenderStatus(renderId, "running", 90, "encoding");

    // Stage 4: Finalizing - Upload to storage (90-100%)
    await updateRenderStatus(renderId, "running", 92, "finalizing");

    // Upload MP4
    const mp4Url = await uploadToStorage(supabase, videoPath, `${renderId}.mp4`, "video-hub-exports");
    console.log(`[Render ${renderId}] MP4 uploaded: ${mp4Url}`);

    // Upload thumbnail
    const thumbnailUrl = await uploadToStorage(supabase, thumbnailPath, `${renderId}.jpg`, "video-hub-thumbnails");
    console.log(`[Render ${renderId}] Thumbnail uploaded: ${thumbnailUrl}`);

    // Upload VTT captions
    const vttUrl = await uploadToStorage(supabase, captions.vttPath, `${renderId}.vtt`, "video-hub-captions");
    console.log(`[Render ${renderId}] VTT uploaded: ${vttUrl}`);

    // Upload SRT captions (optional)
    let srtUrl: string | null = null;
    if (captions.srtPath) {
      srtUrl = await uploadToStorage(supabase, captions.srtPath, `${renderId}.srt`, "video-hub-captions");
      console.log(`[Render ${renderId}] SRT uploaded: ${srtUrl}`);
    }

    await updateRenderStatus(renderId, "running", 98, "finalizing");

    // Create export record
    const { error: exportError } = await supabase.from("video_exports").insert({
      project_id: projectId,
      render_id: renderId,
      mp4_url: mp4Url,
      thumbnail_url: thumbnailUrl,
      vtt_url: vttUrl,
      srt_url: srtUrl,
    });

    if (exportError) {
      console.error(`[Render ${renderId}] Export insert error:`, exportError);
    }

    // Mark render as done
    await updateRenderStatus(renderId, "done", 100, "finalizing");

    // Update project status to approved
    await supabase.from("video_projects").update({ status: "approved" }).eq("id", projectId);

    console.log(`[Render ${renderId}] ✓ Completed successfully`);
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[Render ${renderId}] Error:`, error.message);

    // Mark render as failed
    await supabase
      .from("video_renders")
      .update({
        status: "failed",
        error: error.message || "Unknown render error",
      })
      .eq("id", renderId);

    // Revert project status to draft
    await supabase.from("video_projects").update({ status: "draft" }).eq("id", projectId);
  }
}

async function updateRenderStatus(
  renderId: string,
  status: string,
  progress: number,
  stage: string
) {
  const { error } = await supabase
    .from("video_renders")
    .update({ status, progress, stage })
    .eq("id", renderId);

  if (error) {
    console.error(`[Render ${renderId}] Status update error:`, error);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🎬 Video Render Worker listening on port ${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});
