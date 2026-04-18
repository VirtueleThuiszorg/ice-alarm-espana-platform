import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
import { registrationSchema, validateRequest } from "../_shared/validation.ts";



// Build registration confirmation email HTML
function buildRegistrationConfirmationEmail(
  firstName: string,
  membershipType: string,
  total: number,
  hasPendant: boolean,
  pendantCount: number,
  language: "en" | "es"
): string {
  const pendantInfo = hasPendant
    ? (language === "es"
      ? `✓ Colgante GPS (×${pendantCount})`
      : `✓ GPS Pendant (×${pendantCount})`)
    : "";

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

        <h2 style="color: #1f2937;">¡Tu registro está casi completo!</h2>

        <p>Hola ${firstName},</p>

        <p>¡Gracias por comenzar tu registro en ICE Alarm! Tu inscripción está casi lista.</p>

        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e;">
            <strong>⚠️ Importante:</strong> Por favor completa el pago para activar tu membresía.
          </p>
        </div>

        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Resumen del Pedido:</h3>
          <p style="margin: 5px 0;">✓ Membresía ${membershipType === "couple" ? "Pareja" : "Individual"}</p>
          ${pendantInfo ? `<p style="margin: 5px 0;">${pendantInfo}</p>` : ""}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;">
          <p style="margin: 5px 0; font-size: 18px;"><strong>Total: €${total.toFixed(2)}</strong></p>
        </div>

        <p>Si no completaste el pago, puedes volver en cualquier momento para finalizarlo.</p>

        <p>¿Tienes preguntas? Responde a este email o llámanos.</p>

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

      <h2 style="color: #1f2937;">Your registration is almost complete!</h2>

      <p>Hello ${firstName},</p>

      <p>Thank you for starting your ICE Alarm registration! Your enrollment is almost ready.</p>

      <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; color: #92400e;">
          <strong>⚠️ Important:</strong> Please complete your payment to activate your membership.
        </p>
      </div>

      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1f2937;">Order Summary:</h3>
        <p style="margin: 5px 0;">✓ ${membershipType === "couple" ? "Couple" : "Individual"} Membership</p>
        ${pendantInfo ? `<p style="margin: 5px 0;">${pendantInfo}</p>` : ""}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;">
        <p style="margin: 5px 0; font-size: 18px;"><strong>Total: €${total.toFixed(2)}</strong></p>
      </div>

      <p>If you didn't complete the payment, you can return anytime to finalize it.</p>

      <p>Have questions? Reply to this email or give us a call.</p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

      <p style="color: #6b7280; font-size: 14px;">
        Best regards,<br>
        The ICE Alarm Team
      </p>
    </body>
    </html>
  `;
}

interface MemberDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  nieDni: string;
  preferredLanguage: "en" | "es";
  preferredContactMethod?: "whatsapp" | "phone" | "email";
  preferredContactTime?: "morning" | "afternoon" | "evening" | "anytime";
  specialInstructions?: string;
}

interface AddressDetails {
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

interface MedicalDetails {
  bloodType: string;
  allergies: string[];
  medications: string[];
  medicalConditions: string[];
  doctorName: string;
  doctorPhone: string;
  hospitalPreference: string;
  additionalNotes: string;
}

interface EmergencyContact {
  contactName: string;
  relationship: string;
  phone: string;
  email: string;
  speaksSpanish: boolean;
  notes: string;
}

interface RegistrationRequest {
  membershipType: "single" | "couple";
  primaryMember: MemberDetails;
  partnerMember?: MemberDetails;
  address: AddressDetails;
  medicalInfo: MedicalDetails;
  partnerMedicalInfo?: MedicalDetails;
  emergencyContacts: EmergencyContact[];
  includePendant: boolean;
  pendantCount: number;
  billingFrequency: "monthly" | "annual";
  partnerRef?: string; // Partner referral code for attribution
  refPostId?: string; // Post ID from partner share link for attribution
  utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
  };
  testMode?: boolean; // If true, skip Stripe and mark everything as completed
}

// Pricing constants (NET prices)
const PRICING = {
  single: { monthlyNet: 24.99 },  // 10% IVA
  couple: { monthlyNet: 34.99 },  // 10% IVA
  annualMonths: 10,               // Pay for 10 months (2 free)
  pendantNet: 125.00,             // 21% IVA
  pendantTaxRate: 0.21,
  subscriptionTaxRate: 0.10,
  registrationFee: 59.99,         // No IVA
  shipping: 14.99,                // IVA included
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { allowed } = checkRateLimit(getClientIp(req), 5, 60_000);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rawBody = await req.json();
    const validated = validateRequest(registrationSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;
    const body: RegistrationRequest = validated.data as RegistrationRequest;
    console.log("Processing registration for:", body.primaryMember.email);

    // Fetch registration fee settings from database
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["registration_fee_enabled", "registration_fee_discount", "settings_active_payment_gateway"]);

    const settingsMap = (settingsData || []).reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);

    const registrationFeeEnabled = settingsMap.registration_fee_enabled !== "false";
    const registrationFeeDiscount = parseFloat(settingsMap.registration_fee_discount || "0");
    const activeGateway = settingsMap.settings_active_payment_gateway || "stripe";

    // Calculate pricing with correct IVA rates
    const monthlyNetPrice = body.membershipType === "single"
      ? PRICING.single.monthlyNet
      : PRICING.couple.monthlyNet;

    // Subscription: net price × months (10 for annual, 1 for monthly) + 10% IVA
    const subscriptionNet = body.billingFrequency === "monthly"
      ? monthlyNetPrice
      : monthlyNetPrice * PRICING.annualMonths;
    const subscriptionTax = subscriptionNet * PRICING.subscriptionTaxRate;
    const subscriptionFinal = subscriptionNet + subscriptionTax;

    // FIXED: Respect user's pendantCount (1-4), with validation
    // Only apply defaults if pendantCount is not provided or invalid
    let pendantCount = 0;
    if (body.includePendant) {
      const requestedCount = body.pendantCount;

      // Validate: pendantCount must be between 1 and 4
      if (typeof requestedCount === 'number' && requestedCount >= 1 && requestedCount <= 4) {
        pendantCount = Math.floor(requestedCount); // Ensure integer
      } else {
        // Apply defaults only if invalid or missing
        pendantCount = body.membershipType === "couple" ? 2 : 1;
      }

      console.log(`Pendant count: requested=${requestedCount}, validated=${pendantCount}`);
    }

    const pendantNet = pendantCount * PRICING.pendantNet;
    const pendantTax = pendantNet * PRICING.pendantTaxRate;
    const pendantFinal = pendantNet + pendantTax;

    // Registration: apply enabled/discount settings
    let registrationFee = 0;
    if (registrationFeeEnabled) {
      registrationFee = PRICING.registrationFee * (1 - registrationFeeDiscount / 100);
    }

    // Shipping: IVA included (only if pendant ordered)
    const shipping = pendantCount > 0 ? PRICING.shipping : 0;

    // Totals
    const total = subscriptionFinal + pendantFinal + registrationFee + shipping;

    // ─── ATOMIC DATABASE TRANSACTION ────────────────────────────────────
    // All database inserts wrapped in a single Postgres transaction.
    // If ANY step fails, everything rolls back — no orphaned records.
    const rpcPayload = {
      membershipType: body.membershipType,
      primaryMember: body.primaryMember,
      partnerMember: body.partnerMember || null,
      address: body.address,
      medicalInfo: body.medicalInfo,
      partnerMedicalInfo: body.partnerMedicalInfo || null,
      emergencyContacts: body.emergencyContacts,
      billingFrequency: body.billingFrequency,
      includePendant: body.includePendant,
      activeGateway,
      pendantCount,
      testMode: body.testMode || false,
      partnerRef: body.partnerRef || null,
      refPostId: body.refPostId || null,
      utmParams: body.utmParams || null,
      // Pre-calculated pricing
      subscriptionNet,
      subscriptionTax,
      subscriptionFinal,
      pendantNet,
      pendantTax,
      pendantFinal,
      registrationFee,
      registrationFeeDiscount,
      registrationFeeEnabled,
      shipping,
      total,
      subscriptionTaxRate: PRICING.subscriptionTaxRate,
      pendantTaxRate: PRICING.pendantTaxRate,
    };

    const { data: result, error: rpcError } = await supabase.rpc(
      "submit_registration_atomic",
      { payload: rpcPayload }
    );

    if (rpcError) {
      console.error("Atomic registration failed:", rpcError);
      throw new Error(`Registration failed: ${rpcError.message}`);
    }

    console.log("Atomic registration completed:", result);

    // ─── NON-TRANSACTIONAL: Send confirmation email ─────────────────────
    // Email is intentionally outside the transaction — a failed email
    // should not roll back a successful registration.
    if (body.primaryMember.email) {
      try {
        const emailHtml = buildRegistrationConfirmationEmail(
          body.primaryMember.firstName,
          body.membershipType,
          total,
          body.includePendant,
          pendantCount,
          body.primaryMember.preferredLanguage
        );

        const emailSubject = body.primaryMember.preferredLanguage === "es"
          ? "Completa tu registro en ICE Alarm"
          : "Complete Your ICE Alarm Registration";

        const emailResult = await sendEmail(body.primaryMember.email, emailSubject, emailHtml);

        if (!emailResult.success) {
          console.error("Error sending registration confirmation email:", emailResult.error);
        } else {
          console.log("Registration confirmation email sent to:", body.primaryMember.email);
        }
      } catch (emailErr) {
        console.error("Failed to send registration confirmation email:", emailErr);
        // Don't fail registration, email is non-critical
      }
    }

    // Return all IDs needed for checkout
    return new Response(
      JSON.stringify({
        success: true,
        memberId: result.memberId,
        partnerMemberId: result.partnerMemberId || null,
        partnerSubscriptionId: result.partnerSubscriptionId || null,
        subscriptionId: result.subscriptionId,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        paymentId: result.paymentId,
        total: result.total,
        testMode: result.testMode || false,
        lineItems: [
          {
            name: `${body.membershipType === "couple" ? "Couple" : "Individual"} Membership - ${body.billingFrequency === "annual" ? "Annual" : "Monthly"}`,
            amount: subscriptionFinal,
            quantity: 1,
          },
          ...(pendantCount > 0 ? [{
            name: `GPS Safety Pendant${pendantCount > 1 ? ` (×${pendantCount})` : ""}`,
            amount: pendantFinal / pendantCount,
            quantity: pendantCount,
          }] : []),
          ...(registrationFeeEnabled && registrationFee > 0 ? [{
            name: registrationFeeDiscount > 0
              ? `Registration Fee (${registrationFeeDiscount}% off)`
              : "Registration Fee",
            amount: registrationFee,
            quantity: 1,
          }] : []),
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Registration error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
