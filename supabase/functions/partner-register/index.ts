import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { partnerRegisterSchema, validateRequest } from "../_shared/validation.ts";
import { PARTNER_TERMS_VERSION } from "../_shared/partnerTerms.ts";



interface PartnerRegistrationRequest {
  contact_name: string;
  last_name?: string;
  accept_terms: true;
  company_name?: string;
  email: string;
  phone?: string;
  preferred_language: "en" | "es";
  payout_beneficiary_name: string;
  payout_iban: string;
  password: string;
  // B2B fields
  partner_type?: "referral" | "care" | "residential" | "pharmacy" | "insurance" | "healthcare_provider" | "real_estate" | "expat_community" | "corporate_other";
  organization_type?: string;
  organization_registration?: string;
  organization_website?: string;
  estimated_monthly_referrals?: string;
  facility_address?: string;
  facility_resident_count?: number;
  // New fields
  region?: string;
  how_heard_about_us?: string;
  motivation?: string;
  additional_notes?: string;
  current_client_base?: string;
  position_title?: string;
}

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
  // Use company name if available, otherwise contact name (last name or first name)
  const baseName = (companyName || contactName)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  const suffix = PARTNER_TYPE_SUFFIXES[partnerType] || "REF";
  return `${baseName}-${suffix}`;
}

function generateVerificationToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const rawBody = await req.json();
    const validated = validateRequest(partnerRegisterSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;
    const data = validated.data as PartnerRegistrationRequest;

    // Check if email already exists in partners table.
    //
    // `status` and `user_id` are selected because the refusal below depends on
    // WHICH kind of row this is. The previous single message — that a partner with
    // this email was already on file — was true but useless: the largest group who
    // hit it are people who applied at /partner minutes earlier, and telling them
    // their email is taken reads as a rejection of a thing they just did
    // successfully.
    const { data: existingPartner } = await supabase
      .from("partners")
      .select("id, status, user_id")
      .eq("email", data.email)
      .maybeSingle();

    if (existingPartner) {
      // The two rows look identical on `status` alone. `partner-apply` (/partner)
      // writes `pending` with NO user_id — an application awaiting review.
      // `partner-register` (this function) writes `pending` WITH one. The same
      // distinction `decidePartnerInvite` relies on, used here for wording.
      const isUnclaimedApplication =
        existingPartner.status === "pending" && !existingPartner.user_id;

      const message = isUnclaimedApplication
        ? "You have already applied to the partner programme with this email. " +
          "Our team is reviewing it and will email you an invitation to set up your " +
          "account — there is nothing more you need to do right now."
        : existingPartner.status === "suspended"
          ? "This email belongs to a suspended partner account. Please contact support."
          : "An account already exists for this email. Please sign in instead, or use " +
            "the password reset link if you cannot remember your password.";

      return new Response(
        // `already_applied` lets the client distinguish "come back later" from
        // "go and sign in" without parsing prose.
        JSON.stringify({ error: message, already_applied: isUnclaimedApplication }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: false, // We'll verify via our custom flow
      user_metadata: {
        role: "partner",
        contact_name: data.contact_name
      }
    });

    if (authError) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate unique meaningful referral code
    const baseCode = generateMeaningfulReferralCode(
      data.contact_name,
      data.company_name || undefined,
      data.partner_type || "referral"
    );
    let referralCode = baseCode;
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from("partners")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();

      if (!existing) break;
      attempts++;
      referralCode = `${baseCode}-${attempts + 1}`;
    }

    // Create partner record with B2B fields and new fields
    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .insert({
        user_id: authData.user.id,
        contact_name: data.contact_name,
        last_name: data.last_name || null,
        company_name: data.company_name || null,
        email: data.email,
        phone: data.phone || null,
        preferred_language: data.preferred_language,
        payout_beneficiary_name: data.payout_beneficiary_name,
        payout_iban: data.payout_iban,
        referral_code: referralCode,
        status: "pending",
        // B2B fields
        partner_type: data.partner_type || "referral",
        organization_type: data.organization_type || "individual",
        organization_registration: data.organization_registration || null,
        organization_website: data.organization_website || null,
        estimated_monthly_referrals: data.estimated_monthly_referrals || null,
        facility_address: data.facility_address || null,
        facility_resident_count: data.facility_resident_count || null,
        // New fields
        region: data.region || null,
        how_heard_about_us: data.how_heard_about_us || null,
        motivation: data.motivation || null,
        additional_notes: data.additional_notes || null,
        current_client_base: data.current_client_base || null,
        position_title: data.position_title || null,
        // Legal record. Stamped here, server-side: the timestamp is ours (never a
        // client-supplied one) and the version is the server's own constant, so a
        // caller cannot record consent to a version it invented. The schema has
        // already required accept_terms === true to get this far.
        terms_accepted_at: new Date().toISOString(),
        terms_version: PARTNER_TERMS_VERSION,
      })
      .select()
      .single();

    if (partnerError) {
      // Log the real PostgREST error, not a summary. A generic message here is what
      // made an empty `partners` table take a production trace to diagnose: a schema
      // mismatch (PGRST204 "column ... does not exist") looked identical to any
      // other failure — and `message` carries the column name, so the diagnosis
      // survives.
      //
      // `details` is deliberately EXCLUDED. On a constraint violation Postgres puts
      // the offending value in it verbatim — "Key (email)=(someone@example.com)
      // already exists" — which would write an applicant's email address into
      // production logs. That is PII in logs (GOALS.md G2, CLAUDE.md "do not
      // console.log auth state or PII"). Its presence is recorded as a boolean so a
      // reader still knows the field existed.
      console.error("Partner creation error:", {
        code: partnerError.code,
        message: partnerError.message,
        hint: partnerError.hint,
        had_details: Boolean(partnerError.details),
      });

      // Roll back the auth user, and CHECK that it worked. An unchecked delete is
      // how an orphaned auth user survives a failed insert: no partners row, a live
      // auth user, and nothing anywhere saying the two diverged.
      const { error: cleanupError } = await supabase.auth.admin.deleteUser(authData.user.id);
      if (cleanupError) {
        console.error(
          "ORPHANED AUTH USER: partner insert failed and the auth user could not be " +
            "deleted. auth.users has a row with no matching partners row — this needs " +
            "manual cleanup.",
          { user_id: authData.user.id, cleanup_error: cleanupError.message }
        );
      }

      return new Response(
        JSON.stringify({
          error: "Failed to create partner record",
          // Surfaced so the cause is visible without shell access to the logs.
          // `message` only — never `details`, which can quote the submitted value.
          // A genuine duplicate is already answered with a 409 earlier, so what
          // reaches here is schema/plumbing rather than anything user-entered.
          reason: partnerError.message,
          orphaned_auth_user: cleanupError ? authData.user.id : undefined,
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create verification token
    const token = generateVerificationToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    const { error: tokenError } = await supabase
      .from("partner_verification_tokens")
      .insert({
        partner_id: partner.id,
        token: token,
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      console.error("Token creation error:", tokenError);
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      action: "partner_created",
      entity_type: "partner",
      entity_id: partner.id,
      new_values: { email: data.email, contact_name: data.contact_name }
    });

    // Log CRM event for partner_created
    await supabase.from("crm_events").insert({
      event_type: "partner_created",
      payload: {
        partner_id: partner.id,
        email: data.email,
        contact_name: data.contact_name,
        company_name: data.company_name || null,
        referral_code: referralCode,
      },
    });

    // Notify admin via WhatsApp
    try {
      await supabase.functions.invoke("notify-admin", {
        body: {
          event_type: "partner.joined",
          entity_type: "partner",
          entity_id: partner.id,
          payload: {
            contact_name: data.contact_name,
            company_name: data.company_name || null,
            partner_id: partner.id,
          },
        },
      });
    } catch (notifyError) {
      console.error("Admin notification failed (non-blocking):", notifyError);
    }

    // Get base URL from request origin, SITE_URL, or the canonical launch domain
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://icealarm.es";
    const verificationUrl = `${origin}/partner/verify?token=${token}`;

    // Send verification email
    const emailContent = data.preferred_language === "es" 
      ? {
          subject: "Verifica tu cuenta de socio - ICE Alarm España",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #1a365d;">¡Bienvenido a ICE Alarm España!</h1>
              <p>Hola ${data.contact_name},</p>
              <p>Gracias por registrarte como socio. Por favor verifica tu dirección de correo electrónico haciendo clic en el botón de abajo:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" style="background-color: #C8102E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Verificar Mi Cuenta
                </a>
              </div>
              <p>Este enlace expirará en 24 horas.</p>
              <p>Tu código de referido es: <strong>${referralCode}</strong></p>
              <p>Saludos,<br>El equipo de ICE Alarm España</p>
            </div>
          `
        }
      : {
          subject: "Verify your partner account - ICE Alarm España",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #1a365d;">Welcome to ICE Alarm España!</h1>
              <p>Hello ${data.contact_name},</p>
              <p>Thank you for registering as a partner. Please verify your email address by clicking the button below:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" style="background-color: #C8102E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Verify My Account
                </a>
              </div>
              <p>This link will expire in 24 hours.</p>
              <p>Your referral code is: <strong>${referralCode}</strong></p>
              <p>Best regards,<br>The ICE Alarm España Team</p>
            </div>
          `
        };

    try {
      const emailResult = await sendEmail(
        data.email,
        emailContent.subject,
        emailContent.html
      );
      
      if (!emailResult.success) {
        console.error("Email sending failed:", emailResult.error);
      } else {
        // The partner id, not the address. Logging the email would put PII in
        // production logs (G2); the id is enough to trace a send.
        console.log("Verification email sent for partner:", partner.id);
      }
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      // Don't fail the registration if email fails - they can request resend
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Registration successful. Please check your email to verify your account.",
        partner_id: partner.id 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    console.error("Registration error:", error);
    const message = error instanceof Error ? error.message : "Registration failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
