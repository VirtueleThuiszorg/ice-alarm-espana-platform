import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";



interface PartnerCreateRequest {
  contact_name: string;
  last_name?: string;
  company_name?: string;
  email: string;
  phone?: string;
  preferred_language: "en" | "es";
  payout_beneficiary_name?: string;
  payout_iban?: string;
  notes_internal?: string;
  cif_nif?: string;
  // B2B fields
  partner_type?: "referral" | "care" | "residential" | "pharmacy" | "insurance" | "healthcare_provider" | "real_estate" | "expat_community" | "corporate_other";
  organization_type?: string;
  organization_registration?: string;
  organization_website?: string;
  estimated_monthly_referrals?: string;
  facility_address?: string;
  facility_resident_count?: number;
  alert_visibility_enabled?: boolean;
  billing_model?: "commission" | "per_resident" | "custom";
  custom_rate_monthly?: number;
  // New fields
  region?: string;
  how_heard_about_us?: string;
  motivation?: string;
  additional_notes?: string;
  current_client_base?: string;
  position_title?: string;
}

// Generate a secure temporary password
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Generate a meaningful referral code based on name and partner type
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
  companyName: string | undefined,
  partnerType: string
): string {
  const baseName = (companyName || contactName)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  const suffix = PARTNER_TYPE_SUFFIXES[partnerType] || "REF";
  return `${baseName}-${suffix}`;
}

// Build welcome email HTML
function buildWelcomeEmail(
  contactName: string,
  email: string,
  tempPassword: string,
  referralCode: string,
  language: "en" | "es",
  loginUrl: string
): string {
  if (language === "es") {
    return `
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
        
        <h2 style="color: #1f2937;">¡Bienvenido al Programa de Socios!</h2>
        
        <p>Hola ${contactName},</p>
        
        <p>¡Tu cuenta de socio ha sido creada por nuestro equipo de administración! Ahora formas parte del Programa de Socios de ICE Alarm.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Tus credenciales de acceso:</h3>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 5px 0;"><strong>Contraseña temporal:</strong> ${tempPassword}</p>
          <p style="margin: 5px 0;"><strong>Tu código de referido:</strong> <span style="font-size: 18px; font-weight: bold; color: #dc2626;">${referralCode}</span></p>
        </div>
        
        <p style="color: #dc2626; font-weight: bold;">⚠️ Por favor, inicia sesión y cambia tu contraseña inmediatamente.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Iniciar Sesión</a>
        </div>
        
        <p>Si tienes alguna pregunta, no dudes en contactar con nuestro equipo.</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #6b7280; font-size: 14px;">
          Saludos cordiales,<br>
          El Equipo de ICE Alarm
        </p>
      </body>
      </html>
    `;
  }

  // English version
  return `
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
      
      <h2 style="color: #1f2937;">Welcome to the Partner Program!</h2>
      
      <p>Hello ${contactName},</p>
      
      <p>Your partner account has been created by our admin team! You are now part of the ICE Alarm Partner Program.</p>
      
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1f2937;">Your login credentials:</h3>
        <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p style="margin: 5px 0;"><strong>Your Referral Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #dc2626;">${referralCode}</span></p>
      </div>
      
      <p style="color: #dc2626; font-weight: bold;">⚠️ Please log in and change your password immediately.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to Partner Portal</a>
      </div>
      
      <p>If you have any questions, don't hesitate to contact our team.</p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      
      <p style="color: #6b7280; font-size: 14px;">
        Best regards,<br>
        The ICE Alarm Team
      </p>
    </body>
    </html>
  `;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate admin caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the caller is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: staffData } = await supabaseAdmin
      .from("staff")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .single();

    if (!staffData || !["admin", "super_admin"].includes(staffData.role)) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: PartnerCreateRequest = await req.json();
    const email = body.email.toLowerCase().trim();

    // Validate required fields
    if (!body.contact_name || !email) {
      return new Response(
        JSON.stringify({ error: "Contact name and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Creating partner account for:", email);

    // Check if email already exists in partners
    const { data: existingPartner } = await supabaseAdmin
      .from("partners")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingPartner) {
      return new Response(
        JSON.stringify({ error: "A partner with this email already exists" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate credentials
    const tempPassword = generateTempPassword();
    const baseCode = generateMeaningfulReferralCode(
      body.contact_name,
      body.company_name,
      body.partner_type || "referral"
    );
    let referralCode = baseCode;
    let codeAttempts = 0;
    while (codeAttempts < 10) {
      const { data: existingCode } = await supabaseAdmin
        .from("partners")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();
      if (!existingCode) break;
      codeAttempts++;
      referralCode = `${baseCode}-${codeAttempts + 1}`;
    }

    // Try to create auth user, or reuse existing orphaned user
    let authUserId: string | undefined;
    

    const { data: authUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        contact_name: body.contact_name,
        role: "partner",
      },
    });

    if (createAuthError) {
      // Check if this is an "email exists" error - try to reuse the orphaned auth user
      if (createAuthError.code === "email_exists" || 
          createAuthError.message?.includes("already been registered")) {
        console.log("Auth user exists, checking if orphaned (no partner record)...");
        
        // Find the existing auth user by email
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email);
        
        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: "Email exists but could not find user. Please contact support." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if this user already has a partner record
        const { data: existingPartnerCheck } = await supabaseAdmin
          .from("partners")
          .select("id")
          .eq("user_id", existingUser.id)
          .maybeSingle();

        if (existingPartnerCheck) {
          return new Response(
            JSON.stringify({ error: "This email is already associated with an active partner account." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Orphaned auth user - reset password and reuse
        console.log("Found orphaned auth user, resetting password and reusing:", existingUser.id);
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            contact_name: body.contact_name,
            role: "partner",
          },
        });

        if (updateError) {
          console.error("Error updating orphaned auth user:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to reuse existing account. Please contact support." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        authUserId = existingUser.id;
        console.log("Reusing orphaned auth user:", authUserId);
      } else {
        console.error("Error creating auth user:", createAuthError);
        return new Response(
          JSON.stringify({ error: createAuthError.message || "Failed to create user account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (authUser?.user) {
      authUserId = authUser.user.id;
      console.log("Auth user created:", authUserId);
    } else {
      return new Response(
        JSON.stringify({ error: "Failed to create user account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create partner record with B2B fields and new fields
    const { data: partnerData, error: partnerError } = await supabaseAdmin
      .from("partners")
      .insert({
        user_id: authUserId,
        contact_name: body.contact_name,
        last_name: body.last_name || null,
        company_name: body.company_name || null,
        email: email,
        phone: body.phone || null,
        preferred_language: body.preferred_language || "es",
        payout_beneficiary_name: body.payout_beneficiary_name || null,
        payout_iban: body.payout_iban || null,
        notes_internal: body.notes_internal || null,
        referral_code: referralCode,
        status: "active",
        payout_method: "bank_transfer",
        // B2B fields
        partner_type: body.partner_type || "referral",
        organization_type: body.organization_type || "individual",
        organization_registration: body.organization_registration || null,
        organization_website: body.organization_website || null,
        estimated_monthly_referrals: body.estimated_monthly_referrals || null,
        facility_address: body.facility_address || null,
        facility_resident_count: body.facility_resident_count || null,
        alert_visibility_enabled: body.alert_visibility_enabled || false,
        billing_model: body.billing_model || "commission",
        custom_rate_monthly: body.custom_rate_monthly || null,
        // New fields
        region: body.region || null,
        how_heard_about_us: body.how_heard_about_us || null,
        motivation: body.motivation || null,
        additional_notes: body.additional_notes || null,
        current_client_base: body.current_client_base || null,
        position_title: body.position_title || null,
      })
      .select()
      .single();

    if (partnerError) {
      console.error("Error creating partner:", partnerError);
      // Try to clean up auth user only if we created it new (not reused)
      if (authUserId) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
      return new Response(
        JSON.stringify({ error: partnerError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Partner created:", partnerData.id);

    // Log activity
    await supabaseAdmin.from("activity_logs").insert({
      action: "partner_created_by_admin",
      entity_type: "partner",
      entity_id: partnerData.id,
      staff_id: staffData ? userData.user.id : null,
      new_values: {
        email: email,
        contact_name: body.contact_name,
        referral_code: referralCode,
      },
    });

    // Send welcome email via Gmail SMTP
    const loginUrl = `${req.headers.get("origin") || "https://icealarm.es"}/partner/login`;
    
    const emailHtml = buildWelcomeEmail(
      body.contact_name,
      email,
      tempPassword,
      referralCode,
      body.preferred_language || "es",
      loginUrl
    );

    const emailSubject = body.preferred_language === "en" 
      ? "Welcome to ICE Alarm Partner Program - Your Login Credentials"
      : "Bienvenido al Programa de Socios ICE Alarm - Tus Credenciales";

    const emailResult = await sendEmail(email, emailSubject, emailHtml);

    if (!emailResult.success) {
      console.error("Error sending welcome email:", emailResult.error);
      // Don't fail the request, partner is still created
    } else {
      console.log("Welcome email sent to:", email);
    }

    return new Response(
      JSON.stringify({
        success: true,
        partner_id: partnerData.id,
        referral_code: referralCode,
        message: "Partner created successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Partner creation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
