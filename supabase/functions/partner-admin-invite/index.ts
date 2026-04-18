import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { partnerAdminInviteSchema, validateRequest } from "../_shared/validation.ts";

const PARTNER_TYPE_SUFFIXES: Record<string, string> = {
  referral: "REF",
  care: "CARE",
  residential: "RES",
  pharmacy: "PHARM",
  insurance: "INS",
  healthcare_provider: "HEALTH",
  real_estate: "PROP",
  expat_community: "EXPAT",
  corporate_other: "CORP",
};

function generateMeaningfulReferralCode(
  contactName: string,
  partnerType: string
): string {
  const baseName = contactName
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  const suffix = PARTNER_TYPE_SUFFIXES[partnerType] || "REF";
  return `${baseName}-${suffix}`;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the caller is an admin
    const jwtToken = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(jwtToken);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUserId = claimsData.claims.sub;

    const { data: callerStaff, error: callerError } = await userClient
      .from("staff")
      .select("id, role")
      .eq("user_id", callerUserId)
      .eq("is_active", true)
      .single();

    if (callerError || !callerStaff) {
      return new Response(
        JSON.stringify({ error: "Not authorized - staff record not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["admin", "super_admin"].includes(callerStaff.role)) {
      return new Response(
        JSON.stringify({ error: "Only admins can send partner invitations" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    const rawBody = await req.json();
    const validated = validateRequest(partnerAdminInviteSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;

    const { contact_name, email, preferred_language, partner_type } = validated.data;
    const normalizedEmail = email.toLowerCase().trim();
    const lang = preferred_language || "es";
    const type = partner_type || "referral";

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check for existing partner with this email
    const { data: existingPartner } = await adminClient
      .from("partners")
      .select("id, status")
      .eq("email", normalizedEmail)
      .maybeSingle();

    let partnerId: string;

    if (existingPartner) {
      // Allow re-invite if status is "invited" (never completed)
      if (existingPartner.status !== "invited") {
        return new Response(
          JSON.stringify({ error: "A partner with this email already exists" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      partnerId = existingPartner.id;

      // Update the existing invited partner record
      await adminClient
        .from("partners")
        .update({ contact_name, preferred_language: lang, partner_type: type })
        .eq("id", partnerId);
    } else {
      // Generate unique referral code
      const baseCode = generateMeaningfulReferralCode(contact_name, type);
      let referralCode = baseCode;
      let codeAttempts = 0;
      while (codeAttempts < 10) {
        const { data: existingCode } = await adminClient
          .from("partners")
          .select("id")
          .eq("referral_code", referralCode)
          .maybeSingle();
        if (!existingCode) break;
        codeAttempts++;
        referralCode = `${baseCode}-${codeAttempts + 1}`;
      }

      // Create partner record with status "invited" (no auth user yet)
      const { data: partnerData, error: partnerError } = await adminClient
        .from("partners")
        .insert({
          contact_name,
          email: normalizedEmail,
          preferred_language: lang,
          partner_type: type,
          referral_code: referralCode,
          status: "invited",
          payout_method: "bank_transfer",
          organization_type: "individual",
          billing_model: "commission",
        })
        .select("id")
        .single();

      if (partnerError || !partnerData) {
        console.error("Error creating partner:", partnerError);
        return new Response(
          JSON.stringify({ error: "Failed to create partner record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      partnerId = partnerData.id;
    }

    // Revoke any existing pending invites for this partner
    await adminClient
      .from("partner_admin_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("partner_id", partnerId)
      .eq("status", "pending");

    // Generate secure 64-char hex token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const inviteToken = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

    // Insert invite record
    const { data: invite, error: inviteError } = await adminClient
      .from("partner_admin_invites")
      .insert({
        partner_id: partnerId,
        token: inviteToken,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        created_by: callerStaff.id,
      })
      .select("id")
      .single();

    if (inviteError || !invite) {
      console.error("Error creating invite:", inviteError);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log activity
    await adminClient.from("activity_logs").insert({
      action: "partner_invite_sent",
      entity_type: "partner",
      entity_id: partnerId,
      new_values: {
        email: normalizedEmail,
        contact_name,
        invite_id: invite.id,
        sent_by: callerStaff.id,
      },
    });

    // Send invite email
    try {
      const baseUrl = req.headers.get("origin") || "https://icealarm.es";
      const inviteLink = `${baseUrl}/partner/invite?token=${inviteToken}`;

      const emailContent = lang === "es"
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #dc2626, #ef4444); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">ICE Alarm España</h1>
              <p style="color: #fecaca; margin: 8px 0 0 0;">Programa de Socios</p>
            </div>
            <div style="padding: 30px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1f2937; margin-top: 0;">¡Hola ${contact_name}!</h2>
              <p style="color: #4b5563;">Has sido invitado/a a unirte al <strong>Programa de Socios de ICE Alarm España</strong>.</p>
              <p style="color: #4b5563;">Como socio, podrás referir clientes, ganar comisiones y acceder a tu propio panel de control con herramientas de marketing y seguimiento.</p>
              <p style="color: #4b5563;">Haz clic en el botón de abajo para configurar tu cuenta y empezar.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" style="background-color: #dc2626; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Configurar Mi Cuenta</a>
              </div>
              <p style="color: #9ca3af; font-size: 13px;">Este enlace expira en 7 días. Si tienes alguna pregunta, contacta con nuestro equipo.</p>
            </div>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #dc2626, #ef4444); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">ICE Alarm España</h1>
              <p style="color: #fecaca; margin: 8px 0 0 0;">Partner Program</p>
            </div>
            <div style="padding: 30px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1f2937; margin-top: 0;">Hello ${contact_name}!</h2>
              <p style="color: #4b5563;">You have been invited to join the <strong>ICE Alarm España Partner Program</strong>.</p>
              <p style="color: #4b5563;">As a partner, you'll be able to refer clients, earn commissions, and access your own dashboard with marketing tools and tracking.</p>
              <p style="color: #4b5563;">Click the button below to set up your account and get started.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" style="background-color: #dc2626; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Set Up My Account</a>
              </div>
              <p style="color: #9ca3af; font-size: 13px;">This link expires in 7 days. If you have any questions, please contact our team.</p>
            </div>
          </div>
        `;

      const emailSubject = lang === "es"
        ? "Invitación al Programa de Socios de ICE Alarm"
        : "You're Invited to Join ICE Alarm Partner Program";

      const emailResult = await sendEmail(normalizedEmail, emailSubject, emailContent);

      if (emailResult.success) {
        console.log("Partner invite email sent successfully to:", normalizedEmail);
      } else {
        console.error("Failed to send partner invite email:", emailResult.error);
      }
    } catch (emailError) {
      console.error("Failed to send partner invite email:", emailError);
      // Don't fail the request — the invite record was created successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        partner_id: partnerId,
        invite_id: invite.id,
        message: "Invitation sent successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in partner-admin-invite function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
