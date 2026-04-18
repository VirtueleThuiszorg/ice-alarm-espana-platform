import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_ids, draft_all_qualified } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Check daily cap
    const today = new Date().toISOString().split("T")[0];
    const { data: capData } = await supabase.from("outreach_settings").select("setting_value").eq("setting_key", "max_ai_emails_per_day").single();
    const cap = (capData?.setting_value as { value: number; enabled: boolean }) || { value: 30, enabled: true };
    const { data: usageData } = await supabase.from("outreach_daily_usage").select("usage_count").eq("usage_date", today).eq("usage_type", "ai_emails").is("inbox_id", null).single();
    const usedToday = usageData?.usage_count || 0;
    const remaining = cap.enabled ? Math.max(0, cap.value - usedToday) : Infinity;

    if (remaining === 0) {
      return new Response(JSON.stringify({ drafted: 0, capReached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get settings
    const settingsMap: Record<string, any> = {};
    const { data: allSettings } = await supabase.from("outreach_settings").select("setting_key, setting_value");
    if (allSettings) allSettings.forEach((s: any) => { settingsMap[s.setting_key] = s.setting_value; });

    const senderName = (typeof settingsMap.sender_name === "string" ? settingsMap.sender_name : "ICE Alarm España") || "ICE Alarm España";
    const autoApprove = !settingsMap.auto_sending_enabled ? false : settingsMap.auto_sending_enabled === true;
    const minScore = (typeof settingsMap.min_score_to_send === "number" ? settingsMap.min_score_to_send : 3.5) || 3.5;

    // Get CRM leads that need drafts
    let query = supabase.from("outreach_crm_leads").select("*");
    if (draft_all_qualified) {
      // Get leads with score >= threshold and no existing draft
      query = query.gte("ai_score", minScore).eq("do_not_contact", false);
    } else if (lead_ids?.length > 0) {
      query = query.in("id", lead_ids);
    } else {
      return new Response(JSON.stringify({ error: "Provide lead_ids or draft_all_qualified" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: leads, error: leadsError } = await query;
    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ drafted: 0, message: "No leads to draft" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter out leads that already have a draft
    const leadIds_all = leads.map((l: any) => l.id);
    const { data: existingDrafts } = await supabase.from("outreach_email_drafts").select("crm_lead_id").in("crm_lead_id", leadIds_all);
    const alreadyDrafted = new Set((existingDrafts || []).map((d: any) => d.crm_lead_id));
    const leadsNeedingDrafts = leads.filter((l: any) => !alreadyDrafted.has(l.id));

    if (leadsNeedingDrafts.length === 0) {
      return new Response(JSON.stringify({ drafted: 0, message: "All leads already have drafts" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get enrichment data from raw leads
    const rawLeadIds = leadsNeedingDrafts.filter((l: any) => l.raw_lead_id).map((l: any) => l.raw_lead_id);
    let enrichmentMap: Record<string, any> = {};
    if (rawLeadIds.length > 0) {
      const { data: rawLeads } = await supabase.from("outreach_raw_leads").select("id, enrichment_data").in("id", rawLeadIds);
      if (rawLeads) rawLeads.forEach((r: any) => { enrichmentMap[r.id] = r.enrichment_data; });
    }

    // Get campaign settings for each lead
    const campaignIds = [...new Set(
      leadsNeedingDrafts.filter((l: any) => l.campaign_id).map((l: any) => l.campaign_id)
    )];
    let campaignsMap: Record<string, any> = {};
    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from("outreach_campaigns")
        .select("id, name, default_language, email_tone, outreach_goal, target_description, messaging_tone, max_emails_per_lead")
        .in("id", campaignIds);
      if (campaigns) campaigns.forEach((c: any) => { campaignsMap[c.id] = c; });
    }

    // Get unsubscribe base URL
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const leadsToProcess = leadsNeedingDrafts.slice(0, remaining);
    let draftedCount = 0;
    const errors: string[] = [];

    for (const lead of leadsToProcess) {
      try {
        const enrichment = lead.raw_lead_id ? enrichmentMap[lead.raw_lead_id] : null;
        const unsubscribeUrl = `${supabaseUrl}/functions/v1/outreach-unsubscribe?token=${lead.unsubscribe_token}`;
        const campaign = lead.campaign_id ? campaignsMap[lead.campaign_id] : null;

        // Skip if lead has exceeded campaign's max emails
        if (campaign?.max_emails_per_lead && (lead.email_count || 0) >= campaign.max_emails_per_lead) {
          continue;
        }

        const language = campaign?.default_language || "en";
        const tone = campaign?.messaging_tone || campaign?.email_tone || "professional";
        const goal = campaign?.outreach_goal || "partnership";
        const targetDesc = campaign?.target_description || "";

        const languageInstruction = language === "es"
          ? "Write the email IN SPANISH. The recipient is Spanish-speaking."
          : "Write the email in English.";

        const toneInstruction = tone === "friendly"
          ? "Tone: Friendly and conversational, as if from one colleague to another."
          : tone === "neutral"
            ? "Tone: Neutral and informative, focused on facts and benefits."
            : "Tone: Professional but warm, Spanish business culture aware.";

        const goalInstruction = goal === "intro"
          ? "Goal: Introduce ICE Alarm España and its services. No hard sell."
          : goal === "meeting"
            ? "Goal: Secure a meeting or call. Be direct about wanting to schedule a conversation."
            : "Goal: Propose a partnership opportunity. Emphasise mutual benefit.";

        const prompt = `Write a B2B outreach email from ${senderName} to ${lead.company_name}.

About ${senderName}:
- Personal emergency response service for elderly and vulnerable people in Spain
- 24/7 call centre monitoring
- GPS pendant devices with SOS button, fall detection
- Monthly subscription service (from €24.99/month)
- Looking for partners: care homes, insurance companies, healthcare providers, pharmacies, residential complexes
${targetDesc ? `\nCampaign focus: ${targetDesc}` : ""}

About the prospect:
- Company: ${lead.company_name}
- Contact: ${lead.contact_name || "Decision Maker"}
- Industry: ${lead.category || "Unknown"}
- Location: ${lead.location || "Spain"}
- Website: ${lead.website_url || "N/A"}
${enrichment ? `- Research: ${JSON.stringify(enrichment)}` : ""}
${lead.research_summary ? `- Summary: ${lead.research_summary}` : ""}

Requirements:
- Subject line: Compelling, personalized, under 60 characters
- Body: 3-4 short paragraphs
- ${toneInstruction}
- ${goalInstruction}
- ${languageInstruction}
- Include a specific value proposition for their business type
- End with a clear call-to-action
- Sign off as "${senderName}"
- Do NOT include unsubscribe text (added automatically)

Respond with JSON:
{
  "subject": "Email subject line",
  "body_text": "Plain text email body",
  "body_html": "<p>HTML formatted email body</p>"
}`;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are an expert B2B email copywriter for ICE Alarm España. Write compelling, personalized outreach emails. Always respond with valid JSON." },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) { errors.push("Rate limited"); break; }
          throw new Error(`AI failed: ${response.status}`);
        }

        const aiResp = await response.json();
        const content = aiResp.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { errors.push(`No JSON for ${lead.company_name}`); continue; }

        const draft = JSON.parse(jsonMatch[0]);

        // Add unsubscribe footer
        const unsubFooter = `<br/><hr style="margin-top:30px;border:none;border-top:1px solid #eee"/><p style="font-size:11px;color:#999;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}">unsubscribe here</a>.</p>`;
        const htmlBody = (draft.body_html || `<p>${draft.body_text}</p>`) + unsubFooter;
        const textBody = (draft.body_text || "") + `\n\n---\nUnsubscribe: ${unsubscribeUrl}`;

        const status = autoApprove ? "approved" : "draft";

        const { error: insertError } = await supabase.from("outreach_email_drafts").insert({
          crm_lead_id: lead.id,
          campaign_id: lead.campaign_id,
          subject: draft.subject || `Partnership opportunity - ICE Alarm España`,
          body_text: textBody,
          body_html: htmlBody,
          status,
          approval_required: !autoApprove,
          auto_approved: autoApprove,
          draft_type: "initial",
        });

        if (insertError) { errors.push(`Insert failed for ${lead.company_name}: ${insertError.message}`); continue; }
        draftedCount++;
      } catch (err) {
        errors.push(`Error drafting ${lead.company_name}: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // Track usage
    if (draftedCount > 0) {
      const { data: existing } = await supabase.from("outreach_daily_usage").select("id, usage_count").eq("usage_date", today).eq("usage_type", "ai_emails").is("inbox_id", null).single();
      if (existing) {
        await supabase.from("outreach_daily_usage").update({ usage_count: existing.usage_count + draftedCount }).eq("id", existing.id);
      } else {
        await supabase.from("outreach_daily_usage").insert({ usage_date: today, usage_type: "ai_emails", usage_count: draftedCount });
      }
    }

    return new Response(
      JSON.stringify({ drafted: draftedCount, total: leadsToProcess.length, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("outreach-generate-drafts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
