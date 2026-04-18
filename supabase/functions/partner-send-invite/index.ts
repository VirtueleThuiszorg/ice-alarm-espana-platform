import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";



interface PresentationAttachment {
  name: string;
  url: string;
}

interface InviteRequest {
  inviteId: string;
  channel: "email" | "sms" | "whatsapp";
  recipient: string;
  message: string;
  language: "en" | "es";
  includeQrCode?: boolean;
  presentations?: PresentationAttachment[];
  referralCode?: string;
  referralLink?: string;
}

// Generate QR code URL using a reliable external service
function getQrCodeUrl(data: string, size: number = 200): string {
  const encodedData = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedData}&format=png`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the request is from an authenticated partner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Verify user is a partner
    const { data: partner, error: partnerError } = await supabaseClient
      .from("partners")
      .select("id, status")
      .eq("user_id", user.id)
      .single();

    if (partnerError || !partner || partner.status !== "active") {
      throw new Error("User is not an active partner");
    }

    const { 
      inviteId, 
      channel, 
      recipient, 
      message, 
      language,
      includeQrCode = false,
      presentations = [],
      referralLink = "",
    }: InviteRequest = await req.json();

    if (!inviteId || !channel || !recipient || !message) {
      throw new Error("Missing required fields");
    }

    // Verify invite belongs to this partner
    const { data: invite, error: inviteError } = await supabaseClient
      .from("partner_invites")
      .select("id, partner_id")
      .eq("id", inviteId)
      .single();

    if (inviteError || !invite || invite.partner_id !== partner.id) {
      throw new Error("Invite not found or unauthorized");
    }

    // Generate QR code URL if requested
    const qrCodeUrl = includeQrCode && referralLink ? getQrCodeUrl(referralLink, 180) : "";

    let success = false;

    if (channel === "email") {
      // Send via Gmail SMTP
      const subject = language === "es" 
        ? "Invitación a ICE Alarm España" 
        : "Invitation to ICE Alarm Spain";

      // Build presentations HTML section
      let presentationsHtml = "";
      if (presentations.length > 0) {
        const linksHtml = presentations.map(p => 
          `<li style="margin: 8px 0;"><a href="${p.url}" style="color: #2563eb; text-decoration: none;">${p.name}</a></li>`
        ).join("");
        
        presentationsHtml = `
          <div style="margin-top: 30px; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
            <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">
              ${language === "es" ? "📎 Materiales Informativos" : "📎 Learn More"}
            </h3>
            <ul style="margin: 0; padding-left: 20px; list-style: none;">
              ${linksHtml}
            </ul>
          </div>
        `;
      }

      // Build QR code HTML section
      let qrCodeHtml = "";
      if (qrCodeUrl) {
        qrCodeHtml = `
          <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
            <img src="${qrCodeUrl}" alt="QR Code" style="max-width: 180px; margin-bottom: 10px;" />
            <p style="margin: 0; font-size: 14px; color: #666;">
              ${language === "es" ? "Escanea para registrarte" : "Scan to sign up"}
            </p>
          </div>
        `;
      }

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">${language === "es" ? "Invitación a ICE Alarm" : "ICE Alarm Invitation"}</h2>
          <div style="white-space: pre-wrap; line-height: 1.6; color: #555;">
            ${message.replace(/\n/g, "<br>")}
          </div>
          ${qrCodeHtml}
          ${presentationsHtml}
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #999;">
            ${language === "es" 
              ? "Este correo fue enviado por un socio de ICE Alarm España." 
              : "This email was sent by an ICE Alarm Spain partner."}
          </p>
        </div>
      `;

      const emailResult = await sendEmail(recipient, subject, emailHtml);

      if (!emailResult.success) {
        throw new Error(`Email sending failed: ${emailResult.error}`);
      }

      success = true;
    } else if (channel === "sms" || channel === "whatsapp") {
      // Build message with additional content for SMS/WhatsApp
      let fullMessage = message;

      // Add presentations as links
      if (presentations.length > 0) {
        const presentationLinks = presentations.map(p => `📎 ${p.name}: ${p.url}`).join("\n");
        fullMessage += `\n\n${language === "es" ? "Más información:" : "Learn more:"}\n${presentationLinks}`;
      }

      // Note: For SMS/WhatsApp, QR codes cannot be embedded directly
      // But we include the referral link which is already in the message

      // Send via Twilio
      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
      const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
      const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
      const TWILIO_WHATSAPP_NUMBER = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        // If Twilio is not configured, still mark as success but log warning
        console.warn("Twilio not configured - invite recorded but message not sent");
        success = true;
      } else {
        const from = channel === "whatsapp" 
          ? `whatsapp:${TWILIO_WHATSAPP_NUMBER}`
          : TWILIO_PHONE_NUMBER;
        
        const to = channel === "whatsapp" 
          ? `whatsapp:${recipient}`
          : recipient;

        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
            },
            body: new URLSearchParams({
              From: from || "",
              To: to,
              Body: fullMessage,
            }),
          }
        );

        if (!twilioRes.ok) {
          const error = await twilioRes.text();
          throw new Error(`SMS/WhatsApp sending failed: ${error}`);
        }

        success = true;
      }
    } else {
      throw new Error("Invalid channel");
    }

    // Log CRM event for invite_sent
    await supabaseClient.from("crm_events").insert({
      event_type: "invite_sent",
      payload: {
        invite_id: inviteId,
        partner_id: partner.id,
        channel,
        recipient,
        language,
        included_qr_code: includeQrCode,
        attached_presentations: presentations.length,
      },
    });

    return new Response(
      JSON.stringify({ success, message: "Invite sent successfully" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in partner-send-invite:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
