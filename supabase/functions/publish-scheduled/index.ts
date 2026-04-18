import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



const SITE_URL = "https://icealarm.es";

// ─────────────────────────── HELPERS ───────────────────────────

const extractTitle = (text: string): string => {
  const firstSentence = text.split(/[.!?]/)[0].trim();
  return firstSentence.length > 70 ? firstSentence.substring(0, 67) + "..." : firstSentence;
};

const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 60);
};

const generateExcerpt = (text: string): string => {
  return text.split("\n").slice(0, 2).join(" ").substring(0, 160).trim();
};

interface PublishRequest {
  slot_id?: string;
  run_scheduler?: boolean;
}

interface CalendarSlot {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  is_approved: boolean;
  is_disabled: boolean;
  publish_to_blog: boolean;
  publish_to_facebook: boolean;
  publish_to_instagram: boolean;
  generated_post_text: string | null;
  generated_post_text_es: string | null;
  generated_blog_intro: string | null;
  generated_blog_content: string | null;
  generated_image_url: string | null;
  goal_id: string | null;
  audience_id: string | null;
  topic_id: string | null;
  image_style_id: string | null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { slot_id, run_scheduler }: PublishRequest = await req.json();

    let slotsToPublish: CalendarSlot[] = [];

    if (slot_id) {
      // Publish specific slot
      const { data: slot, error } = await adminClient
        .from("media_content_calendar")
        .select("*")
        .eq("id", slot_id)
        .single();

      if (error || !slot) {
        return new Response(
          JSON.stringify({ error: "Slot not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      slotsToPublish = [slot as CalendarSlot];
    } else if (run_scheduler) {
      // Check if auto-publish is enabled
      const { data: scheduleSettings } = await adminClient
        .from("media_schedule_settings")
        .select("auto_publish_enabled")
        .limit(1)
        .single();

      if (!scheduleSettings?.auto_publish_enabled) {
        return new Response(
          JSON.stringify({ message: "Auto-publish is disabled", published: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find all approved slots due for publishing
      const now = new Date();
      const currentDate = now.toISOString().split("T")[0];
      const currentTime = now.toTimeString().split(" ")[0];

      const { data: dueSlots, error } = await adminClient
        .from("media_content_calendar")
        .select("*")
        .eq("is_approved", true)
        .eq("is_disabled", false)
        .eq("status", "ready")
        .or(`scheduled_date.lt.${currentDate},and(scheduled_date.eq.${currentDate},scheduled_time.lte.${currentTime})`)
        .is("published_at", null);

      if (error) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch due slots", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      slotsToPublish = (dueSlots || []) as CalendarSlot[];
    } else {
      return new Response(
        JSON.stringify({ error: "slot_id or run_scheduler required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Facebook credentials
    const { data: settings } = await adminClient
      .from("system_settings")
      .select("key, value")
      .in("key", ["settings_facebook_page_id", "settings_facebook_page_access_token"]);

    const settingsMap = Object.fromEntries((settings || []).map((s: { key: string; value: string }) => [s.key, s.value]));
    const fbPageId = settingsMap.settings_facebook_page_id;
    const fbAccessToken = settingsMap.settings_facebook_page_access_token;

    const results: Array<{
      slot_id: string;
      blog?: { success: boolean; slug?: string; error?: string };
      facebook?: { success: boolean; post_id?: string; error?: string };
    }> = [];

    for (const slot of slotsToPublish) {
      // Skip disabled or unapproved
      if (slot.is_disabled || !slot.is_approved) {
        results.push({ slot_id: slot.id, blog: { success: false, error: "Disabled or not approved" } });
        continue;
      }

      const result: { slot_id: string; blog?: any; facebook?: any } = { slot_id: slot.id };
      const postText = slot.generated_post_text || "";
      const imageUrl = slot.generated_image_url;

      // ─────────────────────────── CREATE SOCIAL POST RECORD ───────────────────────────
      let socialPostId: string | null = null;
      
      if (postText) {
        try {
          const { data: socialPost, error: socialPostError } = await adminClient
            .from("social_posts")
            .insert({
              post_text: postText,
              post_text_es: slot.generated_post_text_es || null,
              image_url: imageUrl,
              language: "en",
              status: "published",
              published_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (socialPostError) {
            console.error("Failed to create social_posts record:", socialPostError);
          } else {
            socialPostId = socialPost?.id || null;
            console.log(`Created social_posts record: ${socialPostId}`);
          }
        } catch (err) {
          console.error("Error creating social_posts record:", err);
        }
      }

      // ─────────────────────────── PUBLISH TO BLOG (mandatory) ───────────────────────────
      if (slot.publish_to_blog && postText) {
        try {
          const title = extractTitle(postText);
          let slug = generateSlug(title);

          // Check for duplicate slug
          const { data: existingSlug } = await adminClient
            .from("blog_posts")
            .select("slug")
            .eq("slug", slug)
            .maybeSingle();

          if (existingSlug) {
            slug = `${slug}-${Date.now()}`;
          }

          // Compose content
          const blogIntro = slot.generated_blog_intro || "";
          const blogContent = slot.generated_blog_content || postText;
          const ctaLine = `\n\nLearn more about ICE Alarm services at ${SITE_URL}`;
          const composedContent = blogIntro
            ? `${blogIntro}\n\n---\n\n${blogContent}${ctaLine}`
            : `${blogContent}${ctaLine}`;

          const excerpt = generateExcerpt(postText);

          const { data: blogPost, error: blogError } = await adminClient
            .from("blog_posts")
            .insert({
              title,
              slug,
              content: composedContent,
              excerpt,
              ai_intro: blogIntro,
              language: "en",
              published: true,
              published_at: new Date().toISOString(),
              image_url: imageUrl,
              seo_title: title,
              seo_description: excerpt,
              social_post_id: socialPostId, // Link to social post
            })
            .select("id, slug")
            .single();

          if (blogError) {
            result.blog = { success: false, error: blogError.message };
          } else {
            result.blog = { success: true, slug: blogPost?.slug };

            // Record publishing history for blog
            await adminClient.from("media_publishing_history").insert({
              calendar_item_id: slot.id,
              goal_id: slot.goal_id,
              audience_id: slot.audience_id,
              topic_id: slot.topic_id,
              image_style_id: slot.image_style_id,
              platform: "blog",
              post_text: postText,
              image_url: imageUrl,
              external_post_id: blogPost?.slug,
              published_at: new Date().toISOString(),
            });

            // Update calendar with blog post ID
            await adminClient
              .from("media_content_calendar")
              .update({ blog_post_id: blogPost?.id })
              .eq("id", slot.id);
          }
        } catch (blogErr) {
          result.blog = { success: false, error: blogErr instanceof Error ? blogErr.message : "Unknown error" };
        }
      }

      // ─────────────────────────── PUBLISH TO FACEBOOK ───────────────────────────
      if (slot.publish_to_facebook && postText && fbPageId && fbAccessToken) {
        try {
          let fbMessage = postText;
          
          // Add blog link if blog was published
          if (result.blog?.success && result.blog?.slug) {
            const blogUrl = `${SITE_URL}/blog/${result.blog.slug}`;
            const readMoreText = "\n\n📖 Read more: ";
            if (fbMessage.length + readMoreText.length + blogUrl.length < 2000) {
              fbMessage += readMoreText + blogUrl;
            }
          }

          let fbResponse: Response;
          if (imageUrl) {
            const params = new URLSearchParams({
              url: imageUrl,
              caption: fbMessage,
              access_token: fbAccessToken,
            });
            fbResponse = await fetch(`https://graph.facebook.com/v24.0/${fbPageId}/photos`, {
              method: "POST",
              body: params,
            });
          } else {
            const params = new URLSearchParams({
              message: fbMessage,
              access_token: fbAccessToken,
            });
            fbResponse = await fetch(`https://graph.facebook.com/v24.0/${fbPageId}/feed`, {
              method: "POST",
              body: params,
            });
          }

          const fbResult = await fbResponse.json();

          if (!fbResponse.ok) {
            result.facebook = {
              success: false,
              error: fbResult?.error?.message || JSON.stringify(fbResult),
            };
          } else {
            const facebookPostId = fbResult.post_id || fbResult.id;
            result.facebook = { success: true, post_id: facebookPostId };

            // Record publishing history for Facebook
            await adminClient.from("media_publishing_history").insert({
              calendar_item_id: slot.id,
              goal_id: slot.goal_id,
              audience_id: slot.audience_id,
              topic_id: slot.topic_id,
              image_style_id: slot.image_style_id,
              platform: "facebook",
              post_text: postText,
              image_url: imageUrl,
              external_post_id: facebookPostId,
              published_at: new Date().toISOString(),
            });

            // Update calendar with Facebook post ID
            await adminClient
              .from("media_content_calendar")
              .update({ facebook_post_id: facebookPostId })
              .eq("id", slot.id);
          }
        } catch (fbErr) {
          result.facebook = {
            success: false,
            error: fbErr instanceof Error ? fbErr.message : "Unknown error",
          };
        }
      }

      // ─────────────────────────── UPDATE SLOT STATUS ───────────────────────────
      const allSucceeded = 
        (!slot.publish_to_blog || result.blog?.success) &&
        (!slot.publish_to_facebook || !fbPageId || !fbAccessToken || result.facebook?.success);

      const publishError = [
        result.blog?.error ? `Blog: ${result.blog.error}` : null,
        result.facebook?.error ? `Facebook: ${result.facebook.error}` : null,
      ].filter(Boolean).join("; ");

      await adminClient
        .from("media_content_calendar")
        .update({
          status: allSucceeded ? "published" : "ready",
          published_at: allSucceeded ? new Date().toISOString() : null,
          publish_error: publishError || null,
        })
        .eq("id", slot.id);

      results.push(result);
    }

    // Notify admin about auto-publish results (only for scheduler runs)
    if (run_scheduler && results.length > 0) {
      const published = results.filter(r => r.blog?.success || r.facebook?.success).length;
      const failed = results.filter(r => (r.blog && !r.blog.success) || (r.facebook && !r.facebook.success)).length;
      try {
        if (failed > 0) {
          await adminClient.from("notification_log").insert({
            admin_user_id: null,
            event_type: "alert",
            entity_type: "auto_publish",
            entity_id: null,
            message: `Auto-publish: ${published} published, ${failed} failed`,
            status: "pending",
          });
        } else if (published > 0) {
          await adminClient.from("notification_log").insert({
            admin_user_id: null,
            event_type: "system",
            entity_type: "auto_publish",
            entity_id: null,
            message: `Auto-publish: ${published} post(s) published successfully`,
            status: "pending",
          });
        }
      } catch {
        // Don't fail if notification fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Publish scheduled error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
