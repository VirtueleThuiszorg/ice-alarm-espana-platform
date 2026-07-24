import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { post_id, post_text, topic, language, goal, target_audience, image_url, targets } = await req.json();

    if (!post_text) {
      return new Response(
        JSON.stringify({ error: "post_text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, string> = {};

    // ── Generate Video Project ──
    if (targets?.video) {
      const videoPrompt = language === "es"
        ? `Convierte este post de redes sociales en un guión de vídeo corto (30-60 segundos) para una empresa de alarmas personales para mayores. Incluye: titular, 3-4 viñetas de texto, y un llamado a la acción. Responde SOLO en JSON con las claves: headline, bullets (array de strings), cta.`
        : `Convert this social media post into a short video script (30-60 seconds) for a personal alarm company for elderly care. Include: headline, 3-4 text bullets, and a call-to-action. Respond ONLY in JSON with keys: headline, bullets (array of strings), cta.`;

      try {
        const videoResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: videoPrompt },
              { role: "user", content: post_text },
            ],
            max_tokens: 1000,
          }),
        });

        if (videoResponse.ok) {
          const videoData = await videoResponse.json();
          const scriptText = videoData.choices?.[0]?.message?.content || "";

          // Parse JSON from AI response
          let scriptJson;
          try {
            const jsonMatch = scriptText.match(/\{[\s\S]*\}/);
            scriptJson = jsonMatch ? JSON.parse(jsonMatch[0]) : { headline: topic || "Untitled", bullets: [], cta: "Contact us" };
          } catch {
            scriptJson = { headline: topic || "Untitled", bullets: [scriptText.slice(0, 200)], cta: "Contact us" };
          }

          // Create video project
          const { data: project, error: projectError } = await supabase
            .from("video_projects")
            .insert({
              name: `[Repurposed] ${topic || "Social Post"}`,
              language: language === "both" ? "en" : language,
              format: "9:16",
              duration: 30,
              status: "draft",
              data_json: {
                headline: scriptJson.headline,
                bullets: scriptJson.bullets || [],
                ctaText: scriptJson.cta || "Contact us",
                source_post_id: post_id,
                repurposed: true,
              },
            })
            .select("id")
            .single();

          if (!projectError && project) {
            results.video = project.id;
          } else {
            console.error("Video project insert error:", projectError);
          }
        } else {
          console.error("Video AI response error:", videoResponse.status);
        }
      } catch (videoErr) {
        console.error("Video generation failed:", videoErr);
      }
    }

    // ── Generate Outreach Email Template ──
    if (targets?.outreach) {
      const emailPrompt = language === "es"
        ? `Convierte este post de redes sociales en un email de outreach profesional para posibles socios comerciales (residencias, farmacias, centros de salud). El email debe ser breve (3-4 párrafos), personalizable, y mencionar los beneficios del contenido. Responde SOLO en JSON con: subject, body_text.`
        : `Convert this social media post into a professional outreach email for potential business partners (care homes, pharmacies, health centers). The email should be concise (3-4 paragraphs), personalizable, and mention the content benefits. Respond ONLY in JSON with: subject, body_text.`;

      try {
        const emailResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: emailPrompt },
              { role: "user", content: post_text },
            ],
            max_tokens: 1000,
          }),
        });

        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          const emailText = emailData.choices?.[0]?.message?.content || "";

          let emailJson;
          try {
            const jsonMatch = emailText.match(/\{[\s\S]*\}/);
            emailJson = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: `Re: ${topic}`, body_text: emailText };
          } catch {
            emailJson = { subject: `Re: ${topic || "Our latest content"}`, body_text: emailText };
          }

          // Generate unique slug
          const slugBase = (topic || "repurposed")
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .substring(0, 40);
          const slug = `repurposed-${slugBase}-${Date.now()}`;

          const bodyHtml = emailJson.body_text
            .split("\n\n")
            .map((p: string) => `<p>${p}</p>`)
            .join("\n");

          // Store as reusable email template
          const { data: template, error: templateError } = await supabase
            .from("email_templates")
            .insert({
              slug,
              name: `[Repurposed] ${topic || "Social Post"}`,
              description: `Auto-generated from social post: ${post_id}`,
              module: "outreach",
              subject_en: emailJson.subject,
              subject_es: emailJson.subject,
              body_html_en: bodyHtml,
              body_html_es: bodyHtml,
              body_text_en: emailJson.body_text,
              body_text_es: emailJson.body_text,
              is_active: true,
            })
            .select("id")
            .single();

          if (!templateError && template) {
            results.outreach = template.id;
          } else {
            console.error("Email template insert error:", templateError);
          }
        } else {
          console.error("Email AI response error:", emailResponse.status);
        }
      } catch (emailErr) {
        console.error("Email generation failed:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
