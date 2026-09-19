import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { identifyNotifyCaller, STAFF_CALLER_ROLES } from "../_shared/admin-caller.ts";
import { renderTemplate } from "../_shared/notify-fulfilment.ts";
import {
  buildJoinLink,
  joinTokenExpiry,
  leadEventKey,
  leadLanguage,
  leadTemplateVars,
  mintJoinToken,
  planLeadChannels,
  type LeadChannel,
  type LeadMessageKind,
} from "../_shared/lead-message.ts";

const FN = "send-lead-message";

const TRANSPORT: Record<LeadChannel, string> = {
  sms: "twilio-sms",
  whatsapp: "twilio-whatsapp",
  email: "send-email",
};

/**
 * INTRODUCING ICE ALARM TO A LEAD, and writing down what actually happened.
 *
 * ── WHAT THIS RETURNS IS THE LINK ───────────────────────────────────────────
 *
 * Delivery is reported BESIDE it, never instead of it — the shape
 * `send-member-update-request` and `send-payment-link` already use. Every channel here can be
 * off, unconfigured or addressless, and the staff member still needs the URL to read out over
 * the telephone or paste into WhatsApp themselves. That is not a fallback: it is how most of
 * these links will actually be delivered for as long as the channels are off.
 *
 * ── PREVIEW IS THE SAME CODE PATH ───────────────────────────────────────────
 *
 * `preview: true` runs everything except the transports and the log. If the preview were built
 * separately it would eventually show text the send does not use, which is worse than no
 * preview: a staff member who has read the message believes they know what was sent.
 *
 * ── THE TOKEN IS MINTED ONCE ────────────────────────────────────────────────
 *
 * A lead keeps one join token. Minting a new one per message would mean the SMS from Tuesday
 * stops working when Thursday's email goes out — and the person most likely to click the old
 * one is the one who took three days to get round to it.
 */
const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

  const caller = await identifyNotifyCaller(
    db,
    req.headers.get("Authorization"),
    serviceKey,
    STAFF_CALLER_ROLES,
  );
  if (!caller.ok) return json(caller.status, { error: caller.error });

  let payload: {
    leadId?: string;
    kind?: LeadMessageKind;
    channels?: LeadChannel[];
    preview?: boolean;
  };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid request" });
  }

  const leadId = payload.leadId;
  const kind: LeadMessageKind = payload.kind === "followup" ? "followup" : "intro";
  const preview = payload.preview === true;
  if (!leadId) return json(400, { error: "Invalid request" });

  const { data: lead, error: leadErr } = await db
    .from("leads")
    .select("id, first_name, last_name, email, phone, preferred_language, do_not_contact, " +
            "join_token, join_token_expires_at, ref_partner_id, status")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return json(404, { error: "Lead not found" });

  // ── the staff member, by the name they introduce themselves with ──────────
  const { data: staffRow } = await db
    .from("staff")
    .select("id, first_name, last_name")
    .eq("user_id", caller.userId)
    .maybeSingle();
  const staffId = staffRow?.id ?? null;
  const staffName = [staffRow?.first_name, staffRow?.last_name]
    .filter((p) => typeof p === "string" && p.trim())
    .join(" ")
    .trim() || "ICE Alarm España";

  // ── settings: the channel switches and the number every message carries ───
  const { data: settingsRows } = await db
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "notify_channel_sms",
      "notify_channel_whatsapp",
      "settings_emergency_phone",
      "settings_twilio_whatsapp_number",
    ]);
  const settings = new Map((settingsRows ?? []).map((r) => [r.key as string, r.value as string]));
  const on = (key: string) => settings.get(key) === "true";
  const phone24h = settings.get("settings_emergency_phone") ?? "";
  /*
    `PUBLIC_SITE_URL`, NOT A SETTINGS ROW. My first version read `settings_site_url`, and
    `settingsKeyParity.test.ts` caught it: nothing writes that row, so the read would always have
    fallen through to the default — working perfectly in production and silently wrong the first
    time anybody pointed the platform at a staging host. `post-payment.ts` and
    `notify-staff-runtime.ts` already use this variable; a second mechanism for "where does this
    platform live" is how the two would eventually disagree about a link somebody clicks.
  */
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://icealarm.es";

  // ── the token, minted once and reused ─────────────────────────────────────
  let token = lead.join_token as string | null;
  const expired =
    !lead.join_token_expires_at ||
    new Date(lead.join_token_expires_at as string).getTime() < Date.now();
  if (!preview && (!token || expired)) {
    token = mintJoinToken((n) => crypto.getRandomValues(new Uint8Array(n)));
    const { error: tokenErr } = await db
      .from("leads")
      .update({
        join_token: token,
        join_token_expires_at: joinTokenExpiry(new Date()).toISOString(),
      })
      .eq("id", leadId);
    if (tokenErr) {
      console.error(`[${FN}] could not mint a join token:`, tokenErr.message);
      return json(500, { error: "Could not prepare the join link" });
    }
  }
  // A preview before the first send has no token yet; it shows the shape rather than a lie.
  const linkToken = token ?? "PREVIEW";

  let partnerCode: string | null = null;
  if (lead.ref_partner_id) {
    const { data: partner } = await db
      .from("partners")
      .select("referral_code")
      .eq("id", lead.ref_partner_id)
      .maybeSingle();
    partnerCode = (partner?.referral_code as string) ?? null;
  }

  const joinLink = buildJoinLink(siteUrl, linkToken, partnerCode);
  const locale = leadLanguage(lead.preferred_language as string | null);
  const vars = leadTemplateVars({
    firstName: (lead.first_name as string) ?? "",
    staffName,
    joinLink,
    phone24h,
  });

  /*
    WHICH CHANNELS TO EVEN ATTEMPT. `planLeadChannels` applies the do_not_contact gate before
    anything else — it lives in the shared module precisely so a future caller cannot forget it.
  */
  const requested = payload.channels?.length
    ? payload.channels
    : (["sms", "whatsapp", "email"] as LeadChannel[]);

  const decisions = planLeadChannels({
    doNotContact: lead.do_not_contact === true,
    smsChannelOn: on("notify_channel_sms"),
    whatsapp: {
      channelOn: on("notify_channel_whatsapp"),
      configured: Boolean(settings.get("settings_twilio_whatsapp_number")),
    },
    emailConfigured: true,
    phone: lead.phone as string | null,
    email: lead.email as string | null,
  }).filter((d) => requested.includes(d.channel as LeadChannel));

  const report: Array<{
    channel: string;
    to: string | null;
    outcome: string;
    subject?: string;
    body?: string;
    detail?: string;
  }> = [];

  for (const decision of decisions) {
    const channel = decision.channel as LeadChannel;
    const eventKey = leadEventKey(kind, channel);

    const { data: tpl } = await db
      .from("notification_templates")
      .select("subject, body")
      .eq("event_key", eventKey)
      .eq("channel", channel)
      .eq("locale", locale)
      .eq("is_active", true)
      .maybeSingle();

    /*
      NO INLINE FALLBACK TEXT, deliberately — the same decision `notify-fulfilment` took. A
      hard-coded English sentence behind an editable Spanish template is how a member gets a
      message in the wrong language months after somebody "fixed" the wording in the table.
    */
    if (!tpl) {
      report.push({ channel, to: decision.to, outcome: "failed", detail: `no template ${eventKey}/${locale}` });
      if (!preview && staffId !== undefined) {
        await db.from("lead_communications").insert({
          lead_id: leadId, channel, template: eventKey, staff_id: staffId,
          outcome: "failed", detail: `no template ${eventKey}/${locale}`,
        });
      }
      continue;
    }

    const subject = tpl.subject ? renderTemplate(tpl.subject as string, vars) : undefined;
    const body = renderTemplate(tpl.body as string, vars);

    // PREVIEW STOPS HERE — after the same template read and the same render, before the
    // transport and before the log.
    if (preview) {
      report.push({ channel, to: decision.to, outcome: decision.outcome ?? "sent", subject, body });
      continue;
    }

    if (!decision.attempt) {
      report.push({ channel, to: decision.to, outcome: decision.outcome ?? "failed", subject, body });
      await db.from("lead_communications").insert({
        lead_id: leadId, channel, template: eventKey, staff_id: staffId,
        outcome: decision.outcome, detail: null,
      });
      continue;
    }

    const { data: sendData, error: sendError } = await db.functions.invoke(TRANSPORT[channel], {
      body: channel === "email"
        ? { to: decision.to, subject, html: body, language: locale, module: "leads",
            related_entity_id: leadId, related_entity_type: "lead" }
        : { to: decision.to, message: body, recipientType: "lead" },
    });

    const outcome = sendError ? "failed" : "sent";
    const providerId =
      (sendData as { sid?: string; id?: string } | null)?.sid ??
      (sendData as { sid?: string; id?: string } | null)?.id ?? null;

    report.push({
      channel, to: decision.to, outcome, subject, body,
      detail: sendError ? String(sendError.message ?? sendError) : undefined,
    });

    await db.from("lead_communications").insert({
      lead_id: leadId, channel, template: eventKey, staff_id: staffId,
      outcome, provider_id: providerId,
      detail: sendError ? String(sendError.message ?? sendError).slice(0, 500) : null,
    });
  }

  /*
    THE LADDER MOVES ITSELF WHEN A LINK ACTUALLY LEAVES. Not on a skip, and not on a preview —
    a lead marked `join_link_sent` who was never sent one drops out of the follow-up filter,
    which is the one place somebody would have noticed.
  */
  if (!preview && report.some((r) => r.outcome === "sent")) {
    const next = lead.status === "new" || lead.status === "contacted" || lead.status === "interested"
      ? "join_link_sent"
      : null;
    if (next) {
      await db.from("leads").update({
        status: next,
        status_changed_by: staffId,
        status_changed_at: new Date().toISOString(),
      }).eq("id", leadId);
    }
  }

  return json(200, { ok: true, joinLink, locale, preview, report });
};

serve(handler);
