import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { outreachSendEmailSchema, validateRequest } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const validated = validateRequest(outreachSendEmailSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;
    const { draft_ids, send_all_approved } = validated.data;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get settings
    const settingsMap: Record<string, any> = {};
    const { data: allSettings } = await supabase.from("outreach_settings").select("setting_key, setting_value");
    if (allSettings) allSettings.forEach((s: any) => { settingsMap[s.setting_key] = s.setting_value; });

    const dailySendLimit = (typeof settingsMap.daily_send_limit === "number" ? settingsMap.daily_send_limit : 20) || 20;
    const warmupMode = settingsMap.warmup_mode === true;
    const dryRun = settingsMap.dry_run_mode === true;
    const effectiveLimit = warmupMode ? Math.min(dailySendLimit, 5) : dailySendLimit;

    // Check today's send count
    const today = new Date().toISOString().split("T")[0];
    const { data: usageData } = await supabase.from("outreach_daily_usage").select("usage_count").eq("usage_date", today).eq("usage_type", "emails_sent").is("inbox_id", null).single();
    const sentToday = usageData?.usage_count || 0;
    const remaining = Math.max(0, effectiveLimit - sentToday);

    if (remaining === 0) {
      return new Response(JSON.stringify({ sent: 0, capReached: true, message: "Daily send limit reached" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get drafts to send
    let query = supabase.from("outreach_email_drafts").select("*");
    if (send_all_approved) {
      query = query.eq("status", "approved").is("sent_at", null);
    } else if (draft_ids && draft_ids.length > 0) {
      query = query.in("id", draft_ids as string[]);
    } else {
      return new Response(JSON.stringify({ error: "Provide draft_ids or send_all_approved" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: drafts, error: draftsError } = await query;
    if (draftsError) throw draftsError;
    if (!drafts || drafts.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No drafts to send" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get CRM leads for email addresses
    const crmLeadIds = drafts.map((d: any) => d.crm_lead_id);
    const { data: crmLeads } = await supabase.from("outreach_crm_leads").select("id, email, company_name, do_not_contact").in("id", crmLeadIds);
    const crmMap: Record<string, any> = {};
    if (crmLeads) crmLeads.forEach((l: any) => { crmMap[l.id] = l; });

    // Check suppression list
    const emails = (crmLeads || []).filter((l: any) => l.email).map((l: any) => l.email.toLowerCase());
    const { data: suppressed } = await supabase.from("outreach_suppression").select("email").in("email", emails);
    const suppressedSet = new Set((suppressed || []).map((s: any) => s.email.toLowerCase()));

    const draftsToSend = drafts.slice(0, remaining);
    let sentCount = 0;
    let dryRunCount = 0;
    const errors: string[] = [];
    const followupSchedule = (Array.isArray(settingsMap.followup_schedule) ? settingsMap.followup_schedule : [2, 5, 10]) as number[];

    for (const draft of draftsToSend) {
      try {
        const lead = crmMap[draft.crm_lead_id];
        if (!lead) { errors.push(`No CRM lead for draft ${draft.id}`); continue; }
        if (!lead.email) { errors.push(`No email for ${lead.company_name}`); continue; }
        if (lead.do_not_contact) { errors.push(`DNC: ${lead.company_name}`); continue; }
        if (suppressedSet.has(lead.email.toLowerCase())) { errors.push(`Suppressed: ${lead.email}`); continue; }

        if (dryRun) {
          // Dry run - mark as sent without actually sending
          await supabase.from("outreach_email_drafts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", draft.id);
          
          // Create thread entry
          await supabase.from("outreach_email_threads").insert({
            crm_lead_id: draft.crm_lead_id,
            direction: "outbound",
            subject: draft.subject,
            message_body: draft.body_text,
            thread_id: `dry-run-${draft.id}`,
          });

          dryRunCount++;
          sentCount++;
        } else {
          // Actually send via send-email function
          const sendResp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: lead.email,
              subject: draft.subject,
              html_body: draft.body_html || `<p>${draft.body_text}</p>`,
              text_body: draft.body_text,
              module: "outreach",
              related_entity_id: draft.crm_lead_id,
              related_entity_type: "outreach_crm_lead",
            }),
          });

          const sendResult = await sendResp.json();

          if (!sendResp.ok || !sendResult.success) {
            errors.push(`Send failed for ${lead.company_name}: ${sendResult.error || "Unknown"}`);
            // Check for bounce
            if (sendResult.error?.includes("bounce") || sendResult.error?.includes("invalid")) {
              await supabase.from("outreach_crm_leads").update({ bounce_count: (lead.bounce_count || 0) + 1 }).eq("id", lead.id);
            }
            continue;
          }

          // Update draft status
          await supabase.from("outreach_email_drafts").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            external_message_id: sendResult.message_id || null,
          }).eq("id", draft.id);

          // Create thread entry
          await supabase.from("outreach_email_threads").insert({
            crm_lead_id: draft.crm_lead_id,
            direction: "outbound",
            subject: draft.subject,
            message_body: draft.body_text,
            thread_id: sendResult.message_id || null,
          });

          sentCount++;
        }

        // Update CRM lead status + set next follow-up
        const nextFollowupDays = followupSchedule[0] || 3;
        const nextFollowup = new Date();
        nextFollowup.setDate(nextFollowup.getDate() + nextFollowupDays);

        await supabase.from("outreach_crm_leads").update({
          status: "contacted",
          last_contacted_at: new Date().toISOString(),
          next_followup_at: nextFollowup.toISOString(),
          email_count: (lead.email_count || 0) + 1,
        }).eq("id", lead.id);

        // Update campaign emails_sent
        if (draft.campaign_id) {
          const { data: campaign } = await supabase.from("outreach_campaigns").select("emails_sent").eq("id", draft.campaign_id).single();
          if (campaign) {
            await supabase.from("outreach_campaigns").update({ emails_sent: (campaign.emails_sent || 0) + 1 }).eq("id", draft.campaign_id);
          }
        }
      } catch (err) {
        errors.push(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // Track usage
    if (sentCount > 0) {
      const { data: existing } = await supabase.from("outreach_daily_usage").select("id, usage_count").eq("usage_date", today).eq("usage_type", "emails_sent").is("inbox_id", null).single();
      if (existing) {
        await supabase.from("outreach_daily_usage").update({ usage_count: existing.usage_count + sentCount }).eq("id", existing.id);
      } else {
        await supabase.from("outreach_daily_usage").insert({ usage_date: today, usage_type: "emails_sent", usage_count: sentCount });
      }
    }

    // ── Notify admin of email send failures ──
    const failedCount = errors.length;
    if (failedCount > 0) {
      try {
        await supabase.from("notification_log").insert({
          admin_user_id: null,
          event_type: "alert",
          entity_type: "outreach_email",
          entity_id: null,
          message: `${failedCount} outreach email(s) failed to send`,
          status: "pending",
        });
      } catch (notifyErr) {
        console.error("Email failure notification failed:", notifyErr);
      }
    }

    return new Response(
      JSON.stringify({ sent: sentCount, dry_run: dryRun, dry_run_count: dryRunCount, total: draftsToSend.length, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("outreach-send-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
