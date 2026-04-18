import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import nodemailer from "npm:nodemailer@6.9.16";
import { getCorsHeaders } from "../_shared/cors.ts";

const SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

// Send test email via Gmail SMTP
async function sendTestViaGmailSMTP(
  settings: any,
  toEmail: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string }> {
  const appPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  
  if (!appPassword) {
    return { success: false, error: "GMAIL_APP_PASSWORD secret is not configured. Add it in project secrets." };
  }

  if (!settings.gmail_smtp_user) {
    return { success: false, error: "Gmail SMTP user not configured in email settings" };
  }

  try {
    console.log("Gmail SMTP config:", {
      host: settings.gmail_smtp_host || "smtp.gmail.com",
      port: 465,
      user: settings.gmail_smtp_user,
    });

    // IMPORTANT: In this runtime, STARTTLS on 587 has proven unreliable.
    // Force implicit TLS over 465 for Gmail SMTP.
    const port = 465;
    const transporter = nodemailer.createTransport({
      host: settings.gmail_smtp_host || "smtp.gmail.com",
      port: port,
      secure: true,
      auth: {
        user: settings.gmail_smtp_user,
        pass: appPassword,
      },
    });

    const fromName = settings.from_name || "ICE Alarm España";
    const fromEmail = settings.from_email || settings.gmail_smtp_user;

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: toEmail,
      subject: "Test Email - ICE Alarm Email System",
      html: htmlContent,
      headers: {
        "X-ICE-Module": "system",
        "X-ICE-Type": "test",
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("Gmail SMTP error:", error);

    const message = error?.message || "SMTP connection failed";

    // Common Gmail auth failure: wrong app password, 2FA disabled, or user mismatch.
    if (typeof message === "string" && message.includes("535") && message.includes("BadCredentials")) {
      return {
        success: false,
        error:
          "Gmail rejected the credentials (535 BadCredentials). Please verify: (1) the account " +
          `\"${settings.gmail_smtp_user}\"` +
          " has 2-Step Verification enabled, (2) you generated a fresh App Password, and (3) the App Password belongs to THIS exact account (not an alias / different Gmail).",
      };
    }

    return { success: false, error: message };
  }
}

// Send test email via Resend
async function sendTestViaResend(
  settings: any,
  toEmail: string,
  htmlContent: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const resend = new Resend(resendApiKey);
  const fromName = settings.from_name || "ICE Alarm España";
  const fromEmail = settings.from_email || "onboarding@resend.dev";

  const { data, error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [toEmail],
    subject: "Test Email - ICE Alarm Email System",
    html: htmlContent,
    headers: {
      "X-ICE-Module": "system",
      "X-ICE-Type": "test",
    },
  });

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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is staff
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: staffData } = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .single();

    if (!staffData) {
      return new Response(
        JSON.stringify({ error: "Staff access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get email settings
    const { data: settings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", SINGLETON_ID)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "Email settings not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get recipient from request body
    const body = await req.json();
    const toEmail = body.to;

    if (!toEmail) {
      return new Response(
        JSON.stringify({ error: "Recipient email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format before attempting to send
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format. Please provide a valid email address." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine provider
    const provider = settings.provider || "resend";
    const fromName = settings.from_name || "ICE Alarm España";
    const fromEmail = settings.from_email || 
      (provider === "gmail" ? settings.gmail_smtp_user : "noreply@icealarm.es");
    const signature = settings.signature_html || "";

    // Build email content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc2626;">ICE Alarm España</h1>
        </div>
        
        <h2 style="color: #1f2937;">Test Email</h2>
        
        <p>This is a test email from your ICE Alarm email system.</p>
        
        <p>If you received this email, your email configuration is working correctly!</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Configuration Details:</h3>
          <p style="margin: 5px 0;"><strong>From Name:</strong> ${fromName}</p>
          <p style="margin: 5px 0;"><strong>From Email:</strong> ${fromEmail}</p>
          <p style="margin: 5px 0;"><strong>Provider:</strong> ${provider === "gmail" ? "Gmail SMTP" : "Resend"}</p>
          ${provider === "gmail" ? `<p style="margin: 5px 0;"><strong>SMTP Host:</strong> ${settings.gmail_smtp_host || "smtp.gmail.com"}</p>` : ""}
          <p style="margin: 5px 0;"><strong>Sent At:</strong> ${new Date().toISOString()}</p>
        </div>
        
        ${signature ? `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">${signature}</div>` : ""}
      </body>
      </html>
    `;

    // Send via appropriate provider
    let sendResult: { success: boolean; messageId?: string; error?: string };

    if (provider === "gmail") {
      console.log("Sending test email via Gmail SMTP...");
      sendResult = await sendTestViaGmailSMTP(settings, toEmail, htmlContent);
    } else {
      console.log("Sending test email via Resend...");
      sendResult = await sendTestViaResend(settings, toEmail, htmlContent);
    }

    // Log to email_log
    await supabase.from("email_log").insert({
      to_email: toEmail,
      from_email: fromEmail,
      subject: "Test Email - ICE Alarm Email System",
      body_html: htmlContent,
      module: "system",
      status: sendResult.success ? "sent" : "failed",
      error_message: sendResult.error || null,
      provider_message_id: sendResult.messageId || null,
      sent_at: sendResult.success ? new Date().toISOString() : null,
      headers_json: { 
        "X-ICE-Module": "system", 
        "X-ICE-Type": "test",
        "X-ICE-Provider": provider,
      },
    });

    if (!sendResult.success) {
      console.error("Error sending test email:", sendResult.error);
      return new Response(
        JSON.stringify({ error: sendResult.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Test email sent successfully via ${provider}:`, sendResult.messageId || "no-id");

    return new Response(
      JSON.stringify({ success: true, message_id: sendResult.messageId, provider }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-test-email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);