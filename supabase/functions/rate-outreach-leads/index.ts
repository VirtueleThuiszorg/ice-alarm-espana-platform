import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface LeadToRate {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  website_url: string | null;
  phone: string | null;
  location: string | null;
  category: string | null;
  campaign_id: string | null;
}

interface Campaign {
  id: string;
  name: string;
  pipeline_type: string;
  target_description: string | null;
  target_locations: string | null;
  messaging_tone: string | null;
}

interface RatingResult {
  score: number;
  reasoning: string;
}

interface CapSetting {
  value: number;
  enabled: boolean;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_ids, rate_all_new } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check daily caps
    const today = new Date().toISOString().split("T")[0];
    
    // Get cap setting
    const { data: capSettingData } = await supabase
      .from("outreach_settings")
      .select("setting_value")
      .eq("setting_key", "max_ai_ratings_per_day")
      .single();
    
    const cap: CapSetting = capSettingData?.setting_value as CapSetting || { value: 100, enabled: true };
    
    // Get today's usage
    const { data: usageData } = await supabase
      .from("outreach_daily_usage")
      .select("usage_count")
      .eq("usage_date", today)
      .eq("usage_type", "ai_ratings")
      .is("inbox_id", null)
      .single();
    
    const usedToday = usageData?.usage_count || 0;
    const remaining = cap.enabled ? Math.max(0, cap.value - usedToday) : Infinity;

    if (remaining === 0) {
      return new Response(
        JSON.stringify({ 
          rated: 0, 
          queued: 0, 
          capReached: true,
          message: "Daily AI rating limit reached" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get leads to rate
    let query = supabase.from("outreach_raw_leads").select("*");

    if (rate_all_new) {
      query = query.eq("status", "new").is("ai_score", null);
    } else if (lead_ids && lead_ids.length > 0) {
      query = query.in("id", lead_ids);
    } else {
      return new Response(
        JSON.stringify({ error: "No leads specified" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ rated: 0, message: "No leads to rate" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apply cap - only process what we can
    const leadsToProcess = leads.slice(0, remaining);
    const leadsToQueue = leads.slice(remaining);

    // Queue leads that exceed cap
    if (leadsToQueue.length > 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const queuedTasks = leadsToQueue.map((lead: LeadToRate) => ({
        task_type: "ai_rating",
        entity_id: lead.id,
        entity_type: "raw_lead",
        scheduled_for: tomorrow.toISOString().split("T")[0],
      }));

      await supabase.from("outreach_queued_tasks").insert(queuedTasks);
    }

    // Get unique campaign IDs
    const campaignIds = [...new Set(leadsToProcess.filter((l: LeadToRate) => l.campaign_id).map((l: LeadToRate) => l.campaign_id))];
    
    // Fetch campaigns if any
    let campaignsMap: Record<string, Campaign> = {};
    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from("outreach_campaigns")
        .select("id, name, pipeline_type, target_description, target_locations, messaging_tone")
        .in("id", campaignIds);
      
      if (campaigns) {
        campaignsMap = campaigns.reduce((acc: Record<string, Campaign>, c: Campaign) => ({ ...acc, [c.id]: c }), {});
      }
    }

    let ratedCount = 0;
    const errors: string[] = [];

    // Rate each lead
    for (const lead of leadsToProcess) {
      try {
        const campaign = lead.campaign_id ? campaignsMap[lead.campaign_id] : null;
        
        const prompt = buildPrompt(lead as LeadToRate, campaign);
        
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
                content: `You are a B2B lead qualification specialist for an emergency response service company based in Spain. Your task is to rate leads on a scale of 1.0 to 5.0 based on their potential fit as customers or partners.

Rating guidelines:
- 5.0: Perfect fit - healthcare/elderly care industry in Spain, contact info complete
- 4.0-4.9: Strong fit - relevant industry, good location match, decent contact info
- 3.0-3.9: Moderate fit - some relevance, may need more research
- 2.0-2.9: Weak fit - limited relevance or poor data quality
- 1.0-1.9: Poor fit - wrong industry, wrong location, or incomplete data

Always respond with valid JSON in this exact format: {"score": 4.2, "reasoning": "Brief explanation in 1-2 sentences"}`,
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            errors.push(`Rate limited - try again later`);
            break;
          }
          throw new Error(`AI request failed: ${response.status}`);
        }

        const aiResponse = await response.json();
        const content = aiResponse.choices?.[0]?.message?.content || "";

        // Parse the JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          errors.push(`Failed to parse AI response for ${lead.company_name}`);
          continue;
        }

        const rating: RatingResult = JSON.parse(jsonMatch[0]);
        
        // Validate score
        const score = Math.min(5, Math.max(1, Number(rating.score)));
        
        // Update the lead
        const { error: updateError } = await supabase
          .from("outreach_raw_leads")
          .update({
            ai_score: score,
            ai_reasoning: rating.reasoning,
            ai_rated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);

        if (updateError) {
          errors.push(`Failed to update ${lead.company_name}: ${updateError.message}`);
        } else {
          ratedCount++;
        }
      } catch (err) {
        errors.push(`Error rating ${lead.company_name}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    // Track usage
    if (ratedCount > 0) {
      const { data: existingUsage } = await supabase
        .from("outreach_daily_usage")
        .select("id, usage_count")
        .eq("usage_date", today)
        .eq("usage_type", "ai_ratings")
        .is("inbox_id", null)
        .single();

      if (existingUsage) {
        await supabase
          .from("outreach_daily_usage")
          .update({ usage_count: existingUsage.usage_count + ratedCount })
          .eq("id", existingUsage.id);
      } else {
        await supabase.from("outreach_daily_usage").insert({
          usage_date: today,
          usage_type: "ai_ratings",
          usage_count: ratedCount,
        });
      }
    }

    return new Response(
      JSON.stringify({
        rated: ratedCount,
        total: leadsToProcess.length,
        queued: leadsToQueue.length,
        capReached: leadsToQueue.length > 0,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("rate-outreach-leads error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildPrompt(lead: LeadToRate, campaign: Campaign | null): string {
  let prompt = `Rate this B2B lead for our emergency response service:

Lead Information:
- Company: ${lead.company_name}
- Contact: ${lead.contact_name || "Not provided"}
- Email: ${lead.email || "Not provided"}
- Phone: ${lead.phone || "Not provided"}
- Website: ${lead.website_url || "Not provided"}
- Location: ${lead.location || "Not provided"}
- Category/Industry: ${lead.category || "Not provided"}`;

  if (campaign) {
    prompt += `

Campaign Context:
- Campaign: ${campaign.name}
- Pipeline: ${campaign.pipeline_type}
- Target Description: ${campaign.target_description || "Not specified"}
- Target Regions: ${campaign.target_locations || "Spain"}
- Messaging Tone: ${campaign.messaging_tone || "professional"}`;
  }

  prompt += `

Based on the above, provide a score (1.0-5.0) and brief reasoning.`;

  return prompt;
}
