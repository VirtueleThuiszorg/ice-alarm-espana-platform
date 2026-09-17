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
 * ── THE FALL-THROUGH THAT STOPPED BEING A FAIL-SAFE ────────────────────────
 *
 * This used to end: "gmail", an unknown provider, or a settings lookup failure
 * all fall back to Gmail — described as a fail-safe, because a settings hiccup
 * must never take down email that used to work.
 *
 * That was true while Gmail worked. It is the opposite now. `GMAIL_APP_PASSWORD`
 * is not set in production and never will be (go-live runbook, S4), so the
 * fall-through routes to a transport that CANNOT send, and the caller is handed
 * "GMAIL_APP_PASSWORD not configured" — an error about a secret nobody intends to
 * set, for a lookup that actually failed somewhere else. A fail-safe that leads
 * everywhere to the same dead end is just a way of not saying what went wrong.
 *
 * So each failure now says which failure it is:
 *
 *   settings lookup failed   → refuse, and name THAT. Do not guess a provider.
 *   provider "gmail", no password → refuse, and name the fix (provider='resend').
 *   provider "gmail", password set → send. Local development still works.
 *   an unknown provider      → refuse, and name it. Never assume.
 *
 * Every failure still returns {success:false, error} and nothing here throws —
 * what changed is that the error is now true.
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

  if (!settings) {
    /*
      NOT a fall-through to Gmail. `getProviderSettings` returns null for three
      different reasons — SUPABASE_URL/SERVICE_ROLE_KEY missing from this
      function's environment, the query erroring, or the singleton row being
      absent — and each of them is a configuration fault worth seeing. Sending
      through a transport the row never asked for would hide it.
    */
    console.error(
      "email: email_settings could not be read — no provider chosen, nothing sent",
    );
    return {
      success: false,
      error:
        "email_settings could not be read, so no provider is known. Check this " +
        "function has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and that the " +
        "email_settings singleton row exists.",
    };
  }

  if (settings.provider === "resend") {
    return sendViaResend(settings, to, subject, html);
  }

  if (settings.provider === "gmail") {
    /*
      Gmail is the table DEFAULT and the development transport. In production it
      is a dead end: the runbook is explicit that GMAIL_APP_PASSWORD never needs
      setting. So the absence of that secret is what tells the two apart — no new
      environment flag to keep in step, and a developer who sets it keeps working.
    */
    if (!Deno.env.get("GMAIL_APP_PASSWORD")) {
      console.error(
        "email: provider is 'gmail' and GMAIL_APP_PASSWORD is unset — nothing sent. " +
          "Production sends through Resend; set email_settings.provider = 'resend'.",
      );
      return {
        success: false,
        error:
          "email_settings.provider is 'gmail' but GMAIL_APP_PASSWORD is not set. " +
          "This platform sends through Resend: set email_settings.provider = 'resend' " +
          "(Admin → Settings → Email) and add RESEND_API_KEY. Gmail is the local " +
          "development transport only.",
      };
    }
    return sendViaGmail(to, subject, html);
  }

  // An unknown provider is a typo or a half-finished migration. Either way, saying
  // so beats picking one on the caller's behalf.
  console.error(`email: unknown provider ${JSON.stringify(settings.provider)} — nothing sent`);
  return {
    success: false,
    error:
      `email_settings.provider is ${JSON.stringify(settings.provider)}, which is not a ` +
      `transport this platform has. Use 'resend' (production) or 'gmail' (local).`,
  };
}
