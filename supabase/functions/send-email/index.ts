import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
import { sendEmailSchema, validateRequest } from "../_shared/validation.ts";

const SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

interface SendEmailRequest {
  to: string;
  subject: string;
  html_body: string;
  text_body?: string;
  module: "member" | "outreach" | "support" | "system";
  related_entity_id?: string;
  related_entity_type?: string;
  template_slug?: string;
  template_variables?: Record<string, string>;
  language?: "en" | "es";
  reply_to?: string;
  in_reply_to?: string;
  thread_id?: string;
}

// Replace template variables in a string
function replaceVariables(text: string, variables: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return result;
}

// Send email via Resend
async function sendViaResend(
  settings: any,
  to: string,
  subject: string,
  html: string,
  text: string | undefined,
  customHeaders: Record<string, string>,
  replyTo?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const resend = new Resend(resendApiKey);
  const fromName = settings.from_name || "ICE Alarm España";
  const fromEmail = settings.from_email || "onboarding@resend.dev";

  const emailPayload: any = {
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject,
    html,
    headers: customHeaders,
  };

  if (text) {
    emailPayload.text = text;
  }

  if (replyTo || settings.reply_to_email) {
    emailPayload.reply_to = replyTo || settings.reply_to_email;
  }

  const { data, error } = await resend.emails.send(emailPayload);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, messageId: data?.id };
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { allowed } = checkRateLimit(getClientIp(req), 10, 60_000);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get email settings
    const { data: settings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", SINGLETON_ID)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ success: false, error: "Email settings not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request
    const rawPayload = await req.json();
    const validated = validateRequest(sendEmailSchema, rawPayload, corsHeaders);
    if (validated.error) return validated.error;
    const payload = validated.data as SendEmailRequest;
    const { 
      to, 
      module, 
      related_entity_id, 
      related_entity_type,
      template_slug,
      template_variables = {},
      language = "es",
      reply_to,
      in_reply_to,
      thread_id,
    } = payload;

    let { subject, html_body, text_body } = payload;

    if (!to || !module) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: to, module" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check email toggle for module
    const toggleMap: Record<string, keyof typeof settings> = {
      member: "enable_member_emails",
      outreach: "enable_outreach_emails",
      support: "enable_system_emails",
      system: "enable_system_emails",
    };

    const toggleKey = toggleMap[module];
    if (toggleKey && !settings[toggleKey]) {
      return new Response(
        JSON.stringify({ success: false, error: `Emails for module '${module}' are disabled` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check send limits
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Hourly limit check
    if (settings.hourly_send_limit > 0) {
      const { count: hourlyCount } = await supabase
        .from("email_log")
        .select("*", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", hourAgo.toISOString());

      if ((hourlyCount || 0) >= settings.hourly_send_limit) {
        return new Response(
          JSON.stringify({ success: false, error: "Hourly send limit reached" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Daily limit check
    if (settings.daily_send_limit > 0) {
      const { count: dailyCount } = await supabase
        .from("email_log")
        .select("*", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", dayStart.toISOString());

      if ((dailyCount || 0) >= settings.daily_send_limit) {
        return new Response(
          JSON.stringify({ success: false, error: "Daily send limit reached" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // If template_slug is provided, fetch and use template
    let templateId: string | null = null;
    if (template_slug) {
      const { data: template, error: templateError } = await supabase
        .from("email_templates")
        .select("*")
        .eq("slug", template_slug)
        .eq("is_active", true)
        .single();

      if (templateError || !template) {
        console.warn(`Template '${template_slug}' not found, using provided content`);
      } else {
        templateId = template.id;
        // Use language-specific template content
        subject = language === "es" ? template.subject_es : template.subject_en;
        html_body = language === "es" ? template.body_html_es : template.body_html_en;
        text_body = language === "es" ? template.body_text_es : template.body_text_en;

        // Replace variables
        subject = replaceVariables(subject, template_variables);
        html_body = replaceVariables(html_body, template_variables);
        if (text_body) {
          text_body = replaceVariables(text_body, template_variables);
        }
      }
    }

    // Validate we have content
    if (!subject || !html_body) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing subject or html_body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apply signature
    if (settings.signature_html) {
      html_body += `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">${settings.signature_html}</div>`;
    }

    // Build headers for routing (Stage 5)
    const customHeaders: Record<string, string> = {
      "X-ICE-Module": module,
    };

    if (related_entity_id) {
      customHeaders["X-ICE-Entity-ID"] = related_entity_id;
    }
    if (related_entity_type) {
      customHeaders["X-ICE-Entity-Type"] = related_entity_type;
    }
    if (in_reply_to) {
      customHeaders["In-Reply-To"] = in_reply_to;
    }
    if (thread_id) {
      customHeaders["References"] = thread_id;
    }

    // Determine provider and send
    const provider = settings.provider || "resend";
    let sendResult: { success: boolean; messageId?: string; error?: string };

    if (provider === "gmail") {
      console.log("Sending via Gmail SMTP...");
      sendResult = await sendEmail(
        to,
        subject,
        html_body
      );
    } else {
      console.log("Sending via Resend...");
      sendResult = await sendViaResend(
        settings,
        to,
        subject,
        html_body,
        text_body,
        customHeaders,
        reply_to
      );
    }

    // Determine from email for logging
    const fromEmail = settings.from_email || 
      (provider === "gmail" ? settings.gmail_smtp_user : "noreply@icealarm.es");

    // Log to email_log
    const logEntry = {
      to_email: to,
      from_email: fromEmail,
      subject,
      body_html: html_body,
      body_text: text_body,
      module,
      related_entity_id: related_entity_id || null,
      related_entity_type: related_entity_type || null,
      template_id: templateId,
      status: sendResult.success ? "sent" : "failed",
      provider_message_id: sendResult.messageId || null,
      error_message: sendResult.error || null,
      headers_json: { ...customHeaders, "X-ICE-Provider": provider },
      sent_at: sendResult.success ? new Date().toISOString() : null,
    };

    const { data: logData, error: logError } = await supabase
      .from("email_log")
      .insert(logEntry)
      .select("id")
      .single();

    if (logError) {
      console.error("Error logging email:", logError);
    }

    if (!sendResult.success) {
      console.error("Error sending email:", sendResult.error);
      return new Response(
        JSON.stringify({ success: false, error: sendResult.error, log_id: logData?.id }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Email sent successfully via ${provider}:`, sendResult.messageId || "no-id");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: sendResult.messageId,
        log_id: logData?.id,
        provider,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);