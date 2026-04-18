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

// ─────────────────────────── AI INTRO GENERATION ───────────────────────────

async function generateAIIntro(postText: string, language: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not configured, skipping AI intro generation");
    return null;
  }

  const systemPrompt = language === "es"
    ? `Eres un escritor profesional para ICE Alarm España, una empresa de servicios de alarmas personales para personas mayores. Escribe una introducción breve (2-4 oraciones) en un tono profesional y amigable que explique el tema del siguiente post. No repitas el contenido del post, solo introduce el tema de manera atractiva.`
    : `You are a professional writer for ICE Alarm España, a personal alarm service company for elderly care. Write a brief introduction (2-4 sentences) in a professional, friendly tone that explains the topic of the following post. Don't repeat the post content, just introduce the topic engagingly.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write an intro for this post:\n\n${postText}` },
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("AI intro generation failed:", error);
    return null;
  }
}

// ─────────────────────────── MAIN HANDLER ───────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ───────────────────────── AUTH ─────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user from JWT token
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      console.error("Auth error:", userError?.message || "No user found");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ───────────────────────── STAFF CHECK ─────────────────────────
    const userId = userData.user.id;
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (staffError || !staffData) {
      console.error("Staff check failed:", staffError?.message || "Not staff");
      return new Response(JSON.stringify({ error: "Forbidden - Staff access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ───────────────────────── PARSE BODY ─────────────────────────
    let post_id: string | null = null;
    try {
      const body = await req.json();
      post_id = body?.post_id;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!post_id) {
      return new Response(JSON.stringify({ error: "post_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ───────────────────────── ADMIN CLIENT ─────────────────────────
    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ───────────────────────── FETCH POST ─────────────────────────
    const { data: post, error: postError } = await adminClient
      .from("social_posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (post.status !== "approved") {
      return new Response(
        JSON.stringify({
          error: "Post must be approved before publishing",
          current_status: post.status,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ───────────────────────── FACEBOOK SETTINGS ─────────────────────────
    const { data: settings, error: settingsError } = await adminClient
      .from("system_settings")
      .select("key,value")
      .in("key", ["settings_facebook_page_id", "settings_facebook_page_access_token"]);

    if (settingsError || !settings) {
      return new Response(JSON.stringify({ error: "Failed to fetch Facebook settings" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const pageId = settingsMap.settings_facebook_page_id;
    const accessToken = settingsMap.settings_facebook_page_access_token;

    if (!pageId || !accessToken) {
      return new Response(
        JSON.stringify({
          error: "Facebook credentials not configured. Please add Page ID and Access Token in Settings.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ───────────────────────── STEP 1: CREATE BLOG POST FIRST ─────────────────────────
    const postText = post.post_text || "";
    const language = post.language || "en";
    let blogPostId: string | null = null;
    let blogSlug: string | null = null;

    try {
      // Check if a blog post already exists for this social post (re-publish case)
      const { data: existingBlog } = await adminClient
        .from("blog_posts")
        .select("id, slug")
        .eq("social_post_id", post_id)
        .maybeSingle();

      if (existingBlog) {
        // Reuse existing blog post
        blogPostId = existingBlog.id;
        blogSlug = existingBlog.slug;
        console.log("Reusing existing blog post:", blogPostId);
      } else {
        // Generate title and slug
        const title = extractTitle(postText);
        let slug = generateSlug(title);

        const { data: existingSlug } = await adminClient
          .from("blog_posts")
          .select("slug")
          .eq("slug", slug)
          .maybeSingle();

        if (existingSlug) {
          slug = `${slug}-${Date.now()}`;
        }

        console.log("Generating AI intro...");
        const aiIntro = await generateAIIntro(postText, language);
        console.log("AI intro generated:", aiIntro ? "success" : "skipped/failed");

        const ctaLine = language === "es"
          ? `\n\nConoce más sobre los servicios de ICE Alarm en ${SITE_URL}`
          : `\n\nLearn more about ICE Alarm services at ${SITE_URL}`;

        const composedContent = aiIntro
          ? `${aiIntro}\n\n---\n\n${postText}${ctaLine}`
          : `${postText}${ctaLine}`;

        const excerpt = generateExcerpt(postText);

        const { data: blogPost, error: blogError } = await adminClient.from("blog_posts").insert({
          title,
          slug,
          content: composedContent,
          excerpt,
          ai_intro: aiIntro,
          language,
          published: true,
          published_at: new Date().toISOString(),
          social_post_id: post_id,
          image_url: post.image_url,
          seo_title: title,
          seo_description: excerpt,
        }).select("id, slug").single();

        if (blogError) {
          console.error("Error creating blog post:", blogError);
        } else {
          blogPostId = blogPost?.id;
          blogSlug = blogPost?.slug;
          console.log("Blog post created successfully:", blogPostId);
        }
      }
    } catch (blogCreationError) {
      console.error("Blog post creation failed:", blogCreationError);
    }

    // ───────────────────────── STEP 2: PUBLISH TO FACEBOOK ─────────────────────────
    const imageUrl = post.image_url;
    let fbResponse: Response;
    let fbResult: any;

    // Prepare Facebook message (optionally include blog URL)
    let fbMessage = postText;
    if (blogSlug) {
      const blogUrl = `${SITE_URL}/blog/${blogSlug}`;
      const readMoreText = language === "es" ? "\n\n📖 Leer más: " : "\n\n📖 Read more: ";
      // Only add if within reasonable length
      if (fbMessage.length + readMoreText.length + blogUrl.length < 2000) {
        fbMessage += readMoreText + blogUrl;
      }
    }

    if (imageUrl) {
      const params = new URLSearchParams({
        url: imageUrl,
        caption: fbMessage,
        access_token: accessToken,
      });

      fbResponse = await fetch(`https://graph.facebook.com/v24.0/${pageId}/photos`, { method: "POST", body: params });
    } else {
      const params = new URLSearchParams({
        message: fbMessage,
        access_token: accessToken,
      });

      fbResponse = await fetch(`https://graph.facebook.com/v24.0/${pageId}/feed`, { method: "POST", body: params });
    }

    fbResult = await fbResponse.json();

    if (!fbResponse.ok) {
      // Update social post with error but keep blog post
      const errorMessage = fbResult?.error?.message || JSON.stringify(fbResult);

      await adminClient
        .from("social_posts")
        .update({
          status: "failed",
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post_id);

      // ── Notify admin of publish failure ──
      try {
        await adminClient.from("notification_log").insert({
          admin_user_id: null,
          event_type: "alert",
          entity_type: "social_post",
          entity_id: post_id,
          message: `Facebook publish failed: "${post.topic || "Untitled"}" — ${errorMessage}`,
          status: "pending",
        });
      } catch (notifyErr) {
        console.error("Notification insert failed:", notifyErr);
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          blog_post_id: blogPostId, // Blog still created
          blog_slug: blogSlug,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const facebookPostId = fbResult.post_id || fbResult.id;

    // ───────────────────────── UPDATE RECORDS WITH FACEBOOK ID ─────────────────────────
    // Build primary URL for partner tracking
    const primaryUrl = blogSlug ? `${SITE_URL}/blog/${blogSlug}` : null;

    // Update social post
    await adminClient
      .from("social_posts")
      .update({
        status: "published",
        facebook_post_id: facebookPostId,
        published_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
        primary_url: primaryUrl,
        content_channels: ["facebook", ...(blogPostId ? ["blog"] : [])],
      })
      .eq("id", post_id);

    // Update blog post with facebook_post_id
    if (blogPostId) {
      await adminClient
        .from("blog_posts")
        .update({ facebook_post_id: facebookPostId })
        .eq("id", blogPostId);
    }

    // ───────────────────────── GENERATE PARTNER LINKS IF ENABLED ─────────────────────────
    if (post.partner_enabled && (post.partner_audience === "all" || post.partner_audience === "selected")) {
      try {
        console.log("Generating partner links...");
        
        // Get partners based on audience
        let partnersQuery = adminClient
          .from("partners")
          .select("id, referral_code")
          .eq("status", "active");

        if (post.partner_audience === "selected" && post.partner_selected_partner_ids?.length) {
          partnersQuery = partnersQuery.in("id", post.partner_selected_partner_ids);
        }

        const { data: partners, error: partnersError } = await partnersQuery;
        
        if (partnersError) {
          console.error("Error fetching partners:", partnersError);
        } else if (partners?.length) {
          // Generate slug from topic
          const slug = (post.topic || "post")
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .substring(0, 30);

          // Create links for each partner
          const links = partners.map((partner: { id: string; referral_code: string }) => ({
            post_id: post_id,
            partner_id: partner.id,
            tracked_code: partner.referral_code,
            tracked_path: `/r/${partner.referral_code}/${slug}`,
            tracked_url: `${SITE_URL}/r/${partner.referral_code}/${slug}`,
          }));

          // Insert all links (upsert to handle re-publish)
          const { error: linksError } = await adminClient
            .from("partner_post_links")
            .upsert(links, { 
              onConflict: "post_id,partner_id",
              ignoreDuplicates: false 
            });

          if (linksError) {
            console.error("Error creating partner links:", linksError);
          } else {
            console.log(`Created ${links.length} partner links`);
            
            // Update partner_published_at
            await adminClient
              .from("social_posts")
              .update({ partner_published_at: new Date().toISOString() })
              .eq("id", post_id);
          }
        }
      } catch (partnerError) {
        console.error("Partner link generation failed:", partnerError);
        // Don't fail the publish - just log the error
      }
    }

    // ── Notify admin of publish success ──
    try {
      await adminClient.from("notification_log").insert({
        admin_user_id: null,
        event_type: "system",
        entity_type: "social_post",
        entity_id: post_id,
        message: `Facebook post published: "${post.topic || "Untitled"}"`,
        status: "pending",
      });
    } catch (notifyErr) {
      console.error("Notification insert failed:", notifyErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        facebook_post_id: facebookPostId,
        blog_post_id: blogPostId,
        blog_slug: blogSlug,
        partner_links_generated: post.partner_enabled,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("facebook-publish error:", message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
