import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Get settings
    const settingsMap: Record<string, any> = {};
    const { data: allSettings } = await supabase.from("outreach_settings").select("setting_key, setting_value");
    if (allSettings) allSettings.forEach((s: any) => { settingsMap[s.setting_key] = s.setting_value; });

    const followupSchedule = (Array.isArray(settingsMap.followup_schedule) ? settingsMap.followup_schedule : [2, 5, 10]) as number[];
    const maxFollowups = followupSchedule.length;
    const dryRun = settingsMap.dry_run_mode === true;

    // Find leads needing follow-up
    const now = new Date().toISOString();
    const { data: leads, error } = await supabase
      .from("outreach_crm_leads")
      .select("*")
      .eq("status", "contacted")
      .eq("do_not_contact", false)
      .lt("next_followup_at", now)
      .lt("followup_count", maxFollowups)
      .not("next_followup_at", "is", null)
      .limit(10);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ followups: 0, message: "No follow-ups due" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check suppression
    const emails = leads.filter((l: any) => l.email).map((l: any) => l.email.toLowerCase());
    const { data: suppressed } = await supabase.from("outreach_suppression").select("email").in("email", emails);
    const suppressedSet = new Set((suppressed || []).map((s: any) => s.email.toLowerCase()));

    let followupCount = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        if (!lead.email || suppressedSet.has(lead.email.toLowerCase())) continue;

        const followupNum = (lead.followup_count || 0) + 1;

        // Generate follow-up draft
        const prompt = `Write a follow-up email #${followupNum} for ${lead.company_name} from ICE Alarm España.
Previous emails sent: ${lead.email_count || 1}
Company: ${lead.company_name}, Contact: ${lead.contact_name || "there"}
This is follow-up #${followupNum}. Keep it short (2-3 paragraphs), reference previous outreach, add new value.
Respond with JSON: {"subject": "...", "body_text": "...", "body_html": "<p>...</p>"}`;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "Write concise B2B follow-up emails. Always respond with valid JSON." },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
          }),
        });

        if (!response.ok) { errors.push(`AI failed for ${lead.company_name}`); continue; }

        const aiResp = await response.json();
        const content = aiResp.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { errors.push(`No JSON for ${lead.company_name}`); continue; }

        const draft = JSON.parse(jsonMatch[0]);
        const unsubscribeUrl = `${supabaseUrl}/functions/v1/outreach-unsubscribe?token=${lead.unsubscribe_token}`;
        const unsubFooter = `<br/><hr style="margin-top:30px;border:none;border-top:1px solid #eee"/><p style="font-size:11px;color:#999;"><a href="${unsubscribeUrl}">Unsubscribe</a></p>`;

        // Insert draft
        const { data: insertedDraft, error: insertError } = await supabase.from("outreach_email_drafts").insert({
          crm_lead_id: lead.id,
          campaign_id: lead.campaign_id,
          subject: draft.subject,
          body_text: draft.body_text + `\n\nUnsubscribe: ${unsubscribeUrl}`,
          body_html: (draft.body_html || `<p>${draft.body_text}</p>`) + unsubFooter,
          status: dryRun ? "sent" : "approved",
          draft_type: "followup",
          sequence_number: followupNum,
          auto_approved: true,
          approval_required: false,
          sent_at: dryRun ? new Date().toISOString() : null,
        }).select("id").single();

        // If not dry run and draft was created, send it immediately
        if (!dryRun && insertedDraft && !insertError) {
          try {
            const sendResp = await fetch(`${supabaseUrl}/functions/v1/outreach-send-email`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ draft_ids: [insertedDraft.id] }),
            });
            if (!sendResp.ok) {
              errors.push(`Follow-up send failed for ${lead.company_name}`);
            }
          } catch (sendErr) {
            errors.push(`Follow-up send error: ${sendErr instanceof Error ? sendErr.message : "Unknown"}`);
          }
        }

        // Calculate next follow-up
        const nextIdx = followupNum < followupSchedule.length ? followupNum : null;
        const nextFollowup = nextIdx !== null ? new Date(Date.now() + followupSchedule[nextIdx] * 86400000) : null;

        await supabase.from("outreach_crm_leads").update({
          followup_count: followupNum,
          next_followup_at: nextFollowup?.toISOString() || null,
          last_contacted_at: new Date().toISOString(),
        }).eq("id", lead.id);

        followupCount++;
      } catch (err) {
        errors.push(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    return new Response(
      JSON.stringify({ followups: followupCount, total: leads.length, dry_run: dryRun, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("outreach-followup-runner error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
