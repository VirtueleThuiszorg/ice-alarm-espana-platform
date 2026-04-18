import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



interface GenerateRequest {
  slot_id?: string;
  slot_ids?: string[];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { slot_id, slot_ids }: GenerateRequest = await req.json();
    const idsToProcess = slot_ids || (slot_id ? [slot_id] : []);

    if (idsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "slot_id or slot_ids required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch slots with related data
    const { data: slots, error: slotsError } = await adminClient
      .from("media_content_calendar")
      .select(`
        *,
        goal:media_goals(id, name, description),
        audience:media_audiences(id, name, description),
        topic:media_topics(id, name, description),
        image_style:media_image_styles(id, name, description, ai_prompt_hint)
      `)
      .in("id", idsToProcess);

    if (slotsError || !slots?.length) {
      return new Response(
        JSON.stringify({ error: "Slots not found", details: slotsError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ slot_id: string; success: boolean; error?: string }> = [];

    for (const slot of slots) {
      try {
        // Update status to generating
        await adminClient
          .from("media_content_calendar")
          .update({ status: "generating" })
          .eq("id", slot.id);

        const goal = slot.goal as { name: string; description?: string } | null;
        const audience = slot.audience as { name: string; description?: string } | null;
        const topic = slot.topic as { name: string; description?: string } | null;
        const imageStyle = slot.image_style as { name: string; description?: string; ai_prompt_hint?: string } | null;

        // Build context for AI
        const context = {
          goal: goal?.name || "General",
          goalDescription: goal?.description || "",
          audience: audience?.name || "General Public",
          audienceDescription: audience?.description || "",
          topic: topic?.name || "ICE Alarm Services",
          topicDescription: topic?.description || "",
          imageStyle: imageStyle?.name || "Professional",
          imageStyleDescription: imageStyle?.description || "",
          imageStylePromptHint: imageStyle?.ai_prompt_hint || "",
        };

        // Generate content using AI
        const systemPrompt = `You are an expert social media content creator for ICE Alarm España, a personal emergency alarm service for elderly people in Spain. 

Company context:
- ICE Alarm provides 24/7 personal emergency response services
- Main product is a GPS pendant worn around the neck
- Target market: elderly people, their families, and caregivers in Spain
- Brand voice: caring, professional, reassuring, trustworthy

Your task is to generate content for a social media post with the following parameters:
- Goal: ${context.goal} ${context.goalDescription ? `(${context.goalDescription})` : ''}
- Target Audience: ${context.audience} ${context.audienceDescription ? `(${context.audienceDescription})` : ''}
- Topic: ${context.topic} ${context.topicDescription ? `(${context.topicDescription})` : ''}

IMPORTANT MEDICAL COMPLIANCE:
- NEVER make guaranteed medical claims (e.g., "guarantees safety", "will prevent falls")
- Use softer language like "helps provide", "designed to support", "can assist"
- Focus on peace of mind and connection rather than medical guarantees

You must return a JSON object with these exact fields:
{
  "post_text_en": "English social media post (200-300 chars, engaging, with relevant emojis and 3-5 hashtags)",
  "post_text_es": "Spanish version of the post (same format)",
  "blog_intro_en": "SEO-friendly blog introduction in English (2-4 sentences, professional tone)",
  "blog_intro_es": "Spanish version of blog intro",
  "blog_content_en": "Full blog article in English (300-500 words, informative, includes subheadings)",
  "blog_content_es": "Spanish version of blog content",
  "image_prompt": "Detailed image generation prompt for ${context.imageStyle} style. ${context.imageStylePromptHint ? `Style hint: ${context.imageStylePromptHint}` : ''} The image should relate to ${context.topic} and appeal to ${context.audience}. Be specific about composition, lighting, mood, and subjects."
}

Return ONLY valid JSON, no markdown or other formatting.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Generate content for a post about: ${context.topic}` },
            ],
            max_tokens: 4000,
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error("AI API error:", errorText);
          throw new Error(`AI API error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const rawContent = aiData.choices?.[0]?.message?.content || "";
        
        // Parse JSON from response
        let content;
        try {
          // Try to extract JSON if wrapped in markdown
          const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/) || rawContent.match(/```\s*([\s\S]*?)\s*```/);
          const jsonStr = jsonMatch ? jsonMatch[1] : rawContent;
          content = JSON.parse(jsonStr.trim());
        } catch (parseError) {
          console.error("Failed to parse AI response:", rawContent);
          throw new Error("Failed to parse AI response as JSON");
        }

        // Update slot with generated content
        await adminClient
          .from("media_content_calendar")
          .update({
            generated_post_text: content.post_text_en,
            generated_post_text_es: content.post_text_es,
            generated_blog_intro: content.blog_intro_en,
            generated_blog_content: content.blog_content_en,
            generated_image_prompt: content.image_prompt,
            generated_at: new Date().toISOString(),
            status: "ready",
          })
          .eq("id", slot.id);

        results.push({ slot_id: slot.id, success: true });
      } catch (slotError) {
        console.error(`Error processing slot ${slot.id}:`, slotError);
        
        // Update slot with error
        await adminClient
          .from("media_content_calendar")
          .update({
            status: "planned",
            publish_error: slotError instanceof Error ? slotError.message : "Unknown error",
          })
          .eq("id", slot.id);

        results.push({
          slot_id: slot.id,
          success: false,
          error: slotError instanceof Error ? slotError.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate slot content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
