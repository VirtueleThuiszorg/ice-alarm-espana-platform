import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_id, enrich_all_unenriched } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Check daily cap
    const today = new Date().toISOString().split("T")[0];
    const { data: capData } = await supabase
      .from("outreach_settings")
      .select("setting_value")
      .eq("setting_key", "max_ai_research_per_day")
      .single();
    const cap = (capData?.setting_value as { value: number; enabled: boolean }) || { value: 20, enabled: true };

    const { data: usageData } = await supabase
      .from("outreach_daily_usage")
      .select("usage_count")
      .eq("usage_date", today)
      .eq("usage_type", "ai_research")
      .is("inbox_id", null)
      .single();
    const usedToday = usageData?.usage_count || 0;
    const remaining = cap.enabled ? Math.max(0, cap.value - usedToday) : Infinity;

    if (remaining === 0) {
      return new Response(
        JSON.stringify({ enriched: 0, capReached: true, message: "Daily research cap reached" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get leads to enrich
    let query = supabase.from("outreach_raw_leads").select("*");
    if (enrich_all_unenriched) {
      query = query.is("enriched_at", null).not("website_url", "is", null).neq("website_url", "");
    } else if (lead_id) {
      query = query.eq("id", lead_id);
    } else {
      return new Response(
        JSON.stringify({ error: "Provide lead_id or enrich_all_unenriched" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: leads, error: leadsError } = await query;
    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ enriched: 0, message: "No leads to enrich" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadsToProcess = leads.slice(0, remaining);
    let enrichedCount = 0;
    const errors: string[] = [];

    for (const lead of leadsToProcess) {
      try {
        const websiteUrl = lead.website_url;
        if (!websiteUrl) continue;

        const prompt = `Analyze this company for B2B outreach by ICE Alarm España (personal emergency response service for elderly people in Spain). 

Company: ${lead.company_name}
Website: ${websiteUrl}
Location: ${lead.location || "Unknown"}
Category: ${lead.category || "Unknown"}

Provide a JSON response with:
{
  "description": "What the company does (1-2 sentences)",
  "services": ["list", "of", "main", "services"],
  "industry": "primary industry",
  "company_size": "small/medium/large/unknown",
  "location_details": "city, region if identifiable",
  "potential_contacts": ["any decision-maker roles mentioned"],
  "contact_emails": ["any public emails found on website description"],
  "why_fit": "Why this company could be a good partner/customer for ICE Alarm España (elderly care, healthcare, insurance, residential, etc.)",
  "recommended_approach": "How to approach them (partnership, reseller, direct customer, referral partner)"
}`;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: "You are a B2B research analyst for ICE Alarm España, a personal emergency response service. Analyze companies and return structured JSON. Always respond with valid JSON only.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            errors.push("Rate limited - stopping enrichment");
            break;
          }
          throw new Error(`AI request failed: ${response.status}`);
        }

        const aiResponse = await response.json();
        const content = aiResponse.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        let enrichmentData = {};
        if (jsonMatch) {
          try {
            enrichmentData = JSON.parse(jsonMatch[0]);
          } catch {
            enrichmentData = { raw_response: content };
          }
        }

        // Extract domain
        let domain = "";
        try {
          domain = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).hostname.replace("www.", "");
        } catch { /* ignore */ }

        const { error: updateError } = await supabase
          .from("outreach_raw_leads")
          .update({
            enrichment_data: enrichmentData,
            enriched_at: new Date().toISOString(),
            domain: domain || null,
          })
          .eq("id", lead.id);

        if (updateError) {
          errors.push(`Failed to update ${lead.company_name}: ${updateError.message}`);
        } else {
          enrichedCount++;
        }
      } catch (err) {
        errors.push(`Error enriching ${lead.company_name}: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // Track usage
    if (enrichedCount > 0) {
      const { data: existing } = await supabase
        .from("outreach_daily_usage")
        .select("id, usage_count")
        .eq("usage_date", today)
        .eq("usage_type", "ai_research")
        .is("inbox_id", null)
        .single();

      if (existing) {
        await supabase.from("outreach_daily_usage").update({ usage_count: existing.usage_count + enrichedCount }).eq("id", existing.id);
      } else {
        await supabase.from("outreach_daily_usage").insert({ usage_date: today, usage_type: "ai_research", usage_count: enrichedCount });
      }
    }

    return new Response(
      JSON.stringify({ enriched: enrichedCount, total: leadsToProcess.length, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("outreach-enrich-lead error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
