/**
 * The single outbound-email transport for every transactional function
 * (staff/partner invites, registration, member-update requests, GDPR,
 * emergency-contact email, auth emails, partner applications).
 *
 * Provider is chosen by `email_settings.provider` (admin → Settings →
 * Email), the same switch the generic send-email function honours:
 *
 *  - "gmail"  (table default) → Gmail SMTP via nodemailer,
 *    GMAIL_APP_PASSWORD + SENDER_EMAIL. The development transport.
 *  - "resend" → Resend API, RESEND_API_KEY, from address from
 *    email_settings.from_email. The go-live transport — flip the provider
 *    in admin ONLY after icealarm.es is verified in Resend (DKIM/SPF
 *    aligned); until then Resend can't send from the domain.
 *
 * Fail-safe: if the settings lookup fails for any reason, we fall back to
 * Gmail (the historical behaviour) — a settings hiccup must never take
 * down email that used to work. Every failure returns {success:false,
 * error} for the caller to report honestly; nothing here throws.
 */
import nodemailer from "npm:nodemailer@6.9.16";
import { createClient } from "npm:@supabase/supabase-js@2";

interface EmailProviderSettings {
  provider: string;
  from_name: string | null;
  from_email: string | null;
  reply_to_email: string | null;
}

async function getProviderSettings(): Promise<EmailProviderSettings | null> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return null;
    const admin = createClient(url, key);
    const { data, error } = await admin
      .from("email_settings")
      .select("provider, from_name, from_email, reply_to_email")
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as EmailProviderSettings;
  } catch {
    return null;
  }
}

async function sendViaResend(
  settings: EmailProviderSettings,
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const fromName = settings.from_name || Deno.env.get("SENDER_NAME") || "ICE Alarm España";
  const fromEmail = settings.from_email || "noreply@icealarm.es";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
        ...(settings.reply_to_email ? { reply_to: settings.reply_to_email } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Resend send error:", res.status, body);
      return { success: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { success: true };
  } catch (error: unknown) {
    console.error("Resend send error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

async function sendViaGmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; error?: string }> {
  const appPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  const senderEmail =
    Deno.env.get("SENDER_EMAIL") || "icealarmespana@gmail.com";
  const senderName =
    Deno.env.get("SENDER_NAME") || "ICE Alarm España";

  if (!appPassword) {
    return { success: false, error: "GMAIL_APP_PASSWORD not configured" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: senderEmail, pass: appPassword },
    });

    await transporter.sendMail({
      from: `${senderName} <${senderEmail}>`,
      to,
      subject,
      html,
    });

    return { success: true };
  } catch (error: unknown) {
    console.error("Email send error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const settings = await getProviderSettings();

  if (settings?.provider === "resend") {
    return sendViaResend(settings, to, subject, html);
  }

  // "gmail", unknown provider, or settings lookup failure → Gmail (fail-safe)
  return sendViaGmail(to, subject, html);
}
