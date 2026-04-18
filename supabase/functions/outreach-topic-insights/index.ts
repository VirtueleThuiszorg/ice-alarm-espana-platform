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

    // Fetch recent inbound emails (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: threads, error: threadsError } = await supabase
      .from("outreach_email_threads")
      .select("subject, body_snippet")
      .eq("direction", "inbound")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    if (threadsError) throw threadsError;

    if (!threads || threads.length === 0) {
      return new Response(
        JSON.stringify({ insights: [], message: "No recent replies to analyze" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compile reply texts for AI analysis
    const replyTexts = threads
      .map(t => `Subject: ${t.subject || "No subject"}\nSnippet: ${t.body_snippet || ""}`)
      .join("\n---\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You analyze outreach email replies for ICE Alarm España (personal emergency alarms for elderly people in Spain). Extract the top 3-5 common themes/topics that leads are asking about or expressing interest in.

For each theme, provide:
- topic: A short topic name suitable for a content calendar (e.g., "GPS Tracking Features", "Pricing Plans", "Family Peace of Mind")
- description: A 1-2 sentence description explaining why this topic matters based on the replies
- frequency: How many of the replies relate to this theme (approximate count)
- suggested_angle: A suggested content angle for social media posts about this topic

Respond ONLY in JSON format: { "themes": [...] }
Do NOT include any text outside the JSON.`,
          },
          {
            role: "user",
            content: `Analyze these ${threads.length} recent outreach replies:\n\n${replyTexts}`,
          },
        ],
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const aiData = await response.json();
    const aiText = aiData.choices?.[0]?.message?.content || "{}";

    let insights;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      insights = jsonMatch ? JSON.parse(jsonMatch[0]) : { themes: [] };
    } catch {
      insights = { themes: [] };
    }

    return new Response(
      JSON.stringify({
        insights: insights.themes || [],
        analyzed_count: threads.length,
        period_days: 30,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
