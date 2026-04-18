import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



async function refreshTokenIfNeeded(supabase: any, integration: any): Promise<string> {
  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  
  // Refresh if token expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return integration.access_token_encrypted;
  }

  console.log("Refreshing expired YouTube token...");
  
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token_encrypted,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await response.json();
  if (tokens.error) {
    throw new Error(`Token refresh failed: ${tokens.error_description || tokens.error}`);
  }

  // Update stored tokens
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await supabase.from("system_integrations").update({
    access_token_encrypted: tokens.access_token,
    expires_at: newExpiresAt,
    last_used_at: new Date().toISOString(),
  }).eq("integration_type", "youtube");

  return tokens.access_token;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is staff
    const { data: staff } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!staff) {
      return new Response(JSON.stringify({ error: "Staff access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { video_export_id, title, description, visibility, tags, playlist_id, made_for_kids } = body;

    if (!video_export_id || !title || !description || !visibility) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get video export
    const { data: videoExport, error: exportError } = await supabase
      .from("video_exports")
      .select("*")
      .eq("id", video_export_id)
      .single();

    if (exportError || !videoExport) {
      return new Response(JSON.stringify({ error: "Video export not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!videoExport.mp4_url) {
      return new Response(JSON.stringify({ error: "Video file not available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get YouTube integration
    const { data: integration, error: integrationError } = await supabase
      .from("system_integrations")
      .select("*")
      .eq("integration_type", "youtube")
      .eq("status", "connected")
      .single();

    if (integrationError || !integration) {
      return new Response(JSON.stringify({ error: "YouTube not connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to uploading
    await supabase.from("video_exports").update({
      youtube_status: "uploading",
      youtube_error: null,
    }).eq("id", video_export_id);

    // Get fresh access token
    const accessToken = await refreshTokenIfNeeded(supabase, integration);

    // Download video file
    const videoResponse = await fetch(videoExport.mp4_url);
    if (!videoResponse.ok) {
      throw new Error("Failed to download video file");
    }
    const videoBlob = await videoResponse.blob();

    // Create video metadata
    const videoMetadata = {
      snippet: {
        title,
        description,
        tags: tags ? tags.split(",").map((t: string) => t.trim()) : [],
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus: visibility,
        selfDeclaredMadeForKids: made_for_kids || false,
      },
    };

    // Initiate resumable upload
    const initResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": videoBlob.size.toString(),
        },
        body: JSON.stringify(videoMetadata),
      }
    );

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(`Failed to initiate upload: ${errorText}`);
    }

    const uploadUrl = initResponse.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("No upload URL returned");
    }

    // Upload video content
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": videoBlob.size.toString(),
      },
      body: videoBlob,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Video upload failed: ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    const youtubeVideoId = uploadResult.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

    // Add to playlist if specified
    if (playlist_id && youtubeVideoId) {
      try {
        await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            snippet: {
              playlistId: playlist_id,
              resourceId: {
                kind: "youtube#video",
                videoId: youtubeVideoId,
              },
            },
          }),
        });
      } catch (e) {
        console.warn("Failed to add video to playlist:", e);
      }
    }

    // Update video export with success
    await supabase.from("video_exports").update({
      youtube_video_id: youtubeVideoId,
      youtube_url: youtubeUrl,
      youtube_status: "published",
      youtube_published_at: new Date().toISOString(),
      youtube_error: null,
    }).eq("id", video_export_id);

    // Update integration last used
    await supabase.from("system_integrations").update({
      last_used_at: new Date().toISOString(),
    }).eq("integration_type", "youtube");

    return new Response(JSON.stringify({
      success: true,
      youtube_video_id: youtubeVideoId,
      youtube_url: youtubeUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("YouTube publish error:", error);

    // Update export with error status
    try {
      const body = await req.clone().json();
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.from("video_exports").update({
        youtube_status: "failed",
        youtube_error: errorMessage,
      }).eq("id", body.video_export_id);
    } catch (e) {
      console.error("Failed to update error status:", e);
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
