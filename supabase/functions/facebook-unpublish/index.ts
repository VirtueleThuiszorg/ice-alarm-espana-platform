import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { post_id } = await req.json();

    if (!post_id) {
      return new Response(
        JSON.stringify({ error: "post_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[facebook-unpublish] Starting unpublish for post: ${post_id}`);

    // 1. Fetch the post and verify it's published
    const { data: post, error: postError } = await supabase
      .from("social_posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (postError || !post) {
      console.error("[facebook-unpublish] Post not found:", postError);
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (post.status !== "published") {
      return new Response(
        JSON.stringify({ error: "Post is not published", status: post.status }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get Facebook credentials from system_settings
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["settings_facebook_page_access_token", "settings_facebook_page_id"]);

    if (settingsError) {
      console.error("[facebook-unpublish] Failed to fetch settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch Facebook credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) {
      settingsMap[s.key] = s.value;
    }

    const accessToken = settingsMap["settings_facebook_page_access_token"];
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "not_configured", message: "Facebook access token not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let deletedFromFacebook = false;
    let facebookError: string | null = null;

    // 3. Delete from Facebook if we have a facebook_post_id
    if (post.facebook_post_id) {
      console.log(`[facebook-unpublish] Deleting Facebook post: ${post.facebook_post_id}`);
      
      try {
        const deleteUrl = `https://graph.facebook.com/v24.0/${post.facebook_post_id}?access_token=${accessToken}`;
        const fbResponse = await fetch(deleteUrl, { method: "DELETE" });
        const fbResult = await fbResponse.json();

        console.log("[facebook-unpublish] Facebook API response:", fbResult);

        if (fbResult.success === true) {
          deletedFromFacebook = true;
          console.log("[facebook-unpublish] Successfully deleted from Facebook");
        } else if (fbResult.error?.code === 190) {
          // Token expired
          facebookError = "token_expired";
          console.error("[facebook-unpublish] Facebook token expired");
          return new Response(
            JSON.stringify({ 
              error: "token_expired", 
              message: "Facebook access token has expired. Please update it in Settings." 
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else if (fbResult.error?.code === 100 && fbResult.error?.error_subcode === 33) {
          // Post already deleted or doesn't exist - treat as success
          deletedFromFacebook = true;
          console.log("[facebook-unpublish] Post already deleted from Facebook (or never existed)");
        } else if (fbResult.error) {
          facebookError = fbResult.error.message || "Unknown Facebook error";
          console.error("[facebook-unpublish] Facebook API error:", fbResult.error);
          // Continue with local cleanup even if Facebook delete fails
        }
      } catch (err) {
        facebookError = err instanceof Error ? err.message : "Network error";
        console.error("[facebook-unpublish] Facebook API exception:", err);
        // Continue with local cleanup
      }
    } else {
      console.log("[facebook-unpublish] No facebook_post_id, skipping Facebook deletion");
      deletedFromFacebook = true; // Nothing to delete
    }

    // 4. Delete ALL linked blog posts (by social_post_id OR facebook_post_id)
    let blogRemoved = false;
    let blogsDeletedCount = 0;

    // Safe queries - no string interpolation
    const { data: blogsBySocial } = await supabase
      .from("blog_posts")
      .select("id")
      .eq("social_post_id", post_id);

    let blogsByFb: { id: string }[] = [];
    if (post.facebook_post_id) {
      const { data } = await supabase
        .from("blog_posts")
        .select("id")
        .eq("facebook_post_id", post.facebook_post_id);
      blogsByFb = data || [];
    }

    // Merge unique IDs
    const allBlogIds = [...new Set([
      ...(blogsBySocial || []).map(b => b.id),
      ...blogsByFb.map(b => b.id),
    ])];

    if (allBlogIds.length > 0) {
      const { error: blogDeleteError } = await supabase
        .from("blog_posts")
        .delete()
        .in("id", allBlogIds);

      if (blogDeleteError) {
        console.error("[facebook-unpublish] Failed to delete blog posts:", blogDeleteError);
      } else {
        blogRemoved = true;
        blogsDeletedCount = allBlogIds.length;
        console.log(`[facebook-unpublish] Deleted ${blogsDeletedCount} blog post(s): ${allBlogIds.join(", ")}`);
      }
    } else {
      console.log("[facebook-unpublish] No linked blog posts found");
      blogRemoved = true; // Nothing to remove
    }

    // 5. Delete metrics from social_post_metrics
    let metricsRemoved = false;
    const { error: metricsDeleteError } = await supabase
      .from("social_post_metrics")
      .delete()
      .eq("social_post_id", post_id);

    if (metricsDeleteError) {
      console.error("[facebook-unpublish] Failed to delete metrics:", metricsDeleteError);
    } else {
      metricsRemoved = true;
      console.log("[facebook-unpublish] Deleted metrics for post");
    }

    // 6. Update social post status to "draft" (archived not in constraint)
    const { error: updateError } = await supabase
      .from("social_posts")
      .update({ 
        status: "draft",
        facebook_post_id: null // Clear the facebook_post_id
      })
      .eq("id", post_id);

    if (updateError) {
      console.error("[facebook-unpublish] Failed to update post status:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update post status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[facebook-unpublish] Post status updated to draft");

    // 7. Log to activity_logs for audit
    await supabase.from("activity_logs").insert({
      entity_type: "social_post",
      entity_id: post_id,
      action: "unpublish",
      new_values: {
        deleted_from_facebook: deletedFromFacebook,
        blog_removed: blogRemoved,
        metrics_removed: metricsRemoved,
        facebook_error: facebookError,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        deleted_from_facebook: deletedFromFacebook,
        blog_removed: blogRemoved,
        metrics_removed: metricsRemoved,
        facebook_error: facebookError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[facebook-unpublish] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
