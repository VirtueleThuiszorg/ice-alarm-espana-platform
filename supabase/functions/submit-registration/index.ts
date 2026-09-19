import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
import { registrationSchema, validateRequest } from "../_shared/validation.ts";
import { calculateOrder, buildPricingConfig } from "../_shared/pricing-calc.ts";
import { toE164 } from "../_shared/phone.ts";
import { leadJoinedMessage, matchLeadToRegistration } from "../_shared/lead-conversion.ts";



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
          <h1 style="color: #C8102E;">ICE Alarm España</h1>
        </div>

        <h2 style="color: #1f2937;">¡Tu registro está casi completo!</h2>

        <p>Hola ${firstName},</p>

        <p>¡Gracias por comenzar tu registro en ICE Alarm España! Tu inscripción está casi lista.</p>

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
          El Equipo de ICE Alarm España
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
        <h1 style="color: #C8102E;">ICE Alarm España</h1>
      </div>

      <h2 style="color: #1f2937;">Your registration is almost complete!</h2>

      <p>Hello ${firstName},</p>

      <p>Thank you for starting your ICE Alarm España registration! Your enrollment is almost ready.</p>

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
        The ICE Alarm España Team
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
  // Absent from a /join registration: contacts and medical data are collected after payment
  // (ONBOARDING_SPLIT.md). Kept on the type because an admin-side caller may still send them,
  // and the atomic RPC already guards every use with `IS NOT NULL`.
  medicalInfo?: MedicalDetails;
  partnerMedicalInfo?: MedicalDetails;
  emergencyContacts?: EmergencyContact[];
  includePendant: boolean;
  pendantCount: number;
  billingFrequency: "monthly" | "annual";
  // Nullable, not merely absent: the browser sends null when the visitor arrived with no
  // referral code, and every read below coalesces with `|| null`.
  partnerRef?: string | null; // Partner referral code for attribution
  /**
   * `?lead=` from a personal join link a staff member sent. Evidence that this registration
   * belongs to a particular lead, and to the operator who found them.
   */
  leadToken?: string | null;
  refPostId?: string | null; // Post ID from partner share link for attribution
  utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
  };
  /**
   * IGNORED. Accepted only so an older client does not fail validation; the
   * value is never read for a decision. Test mode comes from
   * system_settings.registration_test_mode_enabled. See the note below.
   */
  testMode?: boolean;
}

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
      .in("key", [
        "registration_fee_enabled",
        "registration_fee_discount",
        "registration_test_mode_enabled",
        "settings_active_payment_gateway",
      ]);

    const settingsMap = (settingsData || []).reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);

    const registrationFeeEnabled = settingsMap.registration_fee_enabled !== "false";
    const registrationFeeDiscount = parseFloat(settingsMap.registration_fee_discount || "0");
    // ─── THE GATEWAY IS RESOLVED STRICTLY, WITH NO DEFAULT. ──────────────
    // This used to be `settingsMap.settings_active_payment_gateway || "stripe"`.
    // The seed migration writes 'stripe' and the row is never touched again
    // unless an admin changes it, so a missing row, an empty string, a typo, or
    // a failed settings query all resolved to Stripe — the gateway we are
    // leaving. The failure is silent and expensive: the registration is created,
    // the customer is sent to a Stripe checkout nobody is watching, and the
    // member never activates because the Mollie webhook that activates them is
    // never called.
    //
    // There is no safe default here, so there is no default. An unrecognised
    // value stops the request before a single row is written.
    const KNOWN_GATEWAYS = ["stripe", "mollie"] as const;
    const activeGateway = settingsMap.settings_active_payment_gateway?.trim();
    if (!activeGateway || !KNOWN_GATEWAYS.includes(activeGateway as typeof KNOWN_GATEWAYS[number])) {
      console.error(
        `[submit-registration] settings_active_payment_gateway is ` +
        `${activeGateway === undefined ? "missing" : `"${activeGateway}"`}; ` +
        `expected one of ${KNOWN_GATEWAYS.join(", ")}. Refusing the registration.`,
      );
      return new Response(
        JSON.stringify({
          error: "Payment gateway is not configured",
          code: "GATEWAY_NOT_CONFIGURED",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── TEST MODE IS SERVER-DECIDED. ────────────────────────────────────
    // This used to be `body.testMode`, taken straight from the request. The RPC
    // acts on it by marking the payment completed, the order completed, the
    // subscription active with registration_fee_paid = true, and the member(s)
    // active — a fully paid-up membership with a monitored device allocation and
    // no money collected. This function runs with verify_jwt = false, so anyone
    // who could read the site's JavaScript could POST that flag and mint one.
    //
    // It is now read from system_settings and the request field is ignored
    // entirely. FAIL CLOSED: anything other than the exact string "true" — a
    // missing row, a null, a failed settings query — means live mode, which
    // charges rather than gives away. Pinned by src/test/testModeServerSide.test.ts.
    const testMode = settingsMap.registration_test_mode_enabled === "true";
    if (body.testMode !== undefined && body.testMode !== testMode) {
      console.warn(
        `[submit-registration] ignoring client testMode=${body.testMode}; ` +
          `server setting is ${testMode}`,
      );
    }

    // ── SINGLE SOURCE OF TRUTH: fetch canonical pricing from the DB. ──
    // Server-authoritative: we recompute the total here from DB prices and the request
    // options ONLY. No client-supplied total is ever read. FAIL CLOSED if pricing is missing.
    const [{ data: planRows, error: planErr }, { data: priceSettingRows }] = await Promise.all([
      supabase.from("pricing_plans").select("plan_key, monthly_net, annual_months, subscription_tax_rate, is_active"),
      supabase.from("pricing_settings").select("key, value"),
    ]);
    if (planErr || !planRows || planRows.length === 0) {
      throw new Error("Pricing not configured (pricing_plans empty) — refusing to compute a charge");
    }
    // STRICT / FAIL CLOSED: no hardcoded fallback is passed, so buildPricingConfig
    // THROWS if any required plan (single/couple) or setting (pendant_net,
    // pendant_tax_rate, shipping_amount, registration_base, registration_tax_rate)
    // is missing from the DB — the charge path can never fall back to baked-in
    // prices (golden rule #4). Display surfaces keep their own display fallback.
    const pricingConfig = buildPricingConfig(
      (planRows as Array<{ plan_key: string; monthly_net: number; annual_months: number; subscription_tax_rate: number; is_active?: boolean | null }>).filter((p) => p.is_active !== false),
      (priceSettingRows as Array<{ key: string; value: number }>) || [],
    );

    const order = calculateOrder(pricingConfig, {
      membershipType: body.membershipType,
      billingFrequency: body.billingFrequency,
      includePendant: !!body.includePendant,
      pendantCount: body.pendantCount,
      includeShipping: true,
      registrationFeeEnabled,
      registrationFeeDiscount,
    });

    const {
      subscriptionNet, subscriptionTax, subscriptionFinal,
      pendantNet, pendantTax, pendantFinal, pendantCount,
      registrationFee, shipping,
      grandTotal: total,
    } = order;
    console.log(`Server-computed total €${total.toFixed(2)} (pendantCount=${pendantCount}) from DB pricing`);

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
      testMode,
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
      subscriptionTaxRate: pricingConfig[body.membershipType as "single" | "couple"].subscriptionTaxRate,
      pendantTaxRate: pricingConfig.pendantTaxRate,
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
          ? "Completa tu registro en ICE Alarm España"
          : "Complete Your ICE Alarm España Registration";

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

    /*
      ─── NON-TRANSACTIONAL: the lead this registration came from ────────────

      OUTSIDE THE TRANSACTION, for the same reason the email above is. If marking a lead failed
      inside `submit_registration_atomic` — a constraint, a lock, anything — the REGISTRATION
      would roll back. Losing a paying member because a lead row could not be updated is a trade
      nobody would make on purpose, so a failure here is logged and the registration stands.

      The cost is honest and small: a lead left on `join_link_sent` for a day until somebody
      notices, against a registration that never happened.
    */
    try {
      const identity = {
        token: body.leadToken ?? null,
        phone: toE164(body.primaryMember.phone ?? ""),
        email: (body.primaryMember.email ?? "").trim().toLowerCase() || null,
      };

      if (identity.token || identity.phone || identity.email) {
        const filters: string[] = [];
        if (identity.token) filters.push(`join_token.eq.${identity.token}`);
        if (identity.phone) filters.push(`phone.eq.${identity.phone}`);
        if (identity.email) filters.push(`email.eq.${identity.email}`);

        const { data: candidates } = await supabase
          .from("leads")
          .select("id, status, join_token, join_token_expires_at, phone, email, first_name, assigned_to")
          .or(filters.join(","))
          .limit(10);

        const match = matchLeadToRegistration(candidates ?? [], identity, new Date());

        if (match.matched) {
          const lead = (candidates ?? []).find((l) => l.id === match.leadId);
          const { error: convertErr } = await supabase
            .from("leads")
            .update({
              status: "joined",
              converted_member_id: result.memberId,
              converted_at: new Date().toISOString(),
            })
            .eq("id", match.leadId);

          if (convertErr) {
            console.error("Lead conversion failed (registration stands):", convertErr.message);
          } else {
            console.log(`Lead ${match.leadId} marked joined, matched by ${match.by}`);

            /*
              THE BELL GOES TO THE PERSON WHO FOUND THEM, and to the admins. Targeted rows, not
              a broadcast: a broadcast row is SHARED, so the first person to mark it read clears
              it for the operator who had not seen it yet — which is the one person it is for.
            */
            const message = leadJoinedMessage((lead?.first_name as string) ?? "");
            const recipients = new Set<string>();
            if (lead?.assigned_to) {
              const { data: owner } = await supabase
                .from("staff").select("user_id").eq("id", lead.assigned_to).maybeSingle();
              if (owner?.user_id) recipients.add(owner.user_id as string);
            }
            const { data: admins } = await supabase
              .from("staff").select("user_id").in("role", ["admin", "super_admin"]).eq("is_active", true);
            for (const a of admins ?? []) if (a.user_id) recipients.add(a.user_id as string);

            if (recipients.size > 0) {
              await supabase.from("notification_log").insert(
                [...recipients].map((userId) => ({
                  admin_user_id: userId,
                  event_type: "message",
                  entity_type: "lead",
                  entity_id: match.leadId,
                  message,
                  status: "pending",
                })),
              );
            }
          }
        } else if (match.reason !== "no_candidate") {
          // `already_joined` is a retry and `token_expired` is a link older than 30 days —
          // both are ordinary, and neither is an error. Logged so the conversion rate can be
          // read honestly rather than looking like leads that never converted.
          console.log(`Lead not converted: ${match.reason}`);
        }
      }
    } catch (leadErr) {
      console.error("Lead conversion threw (registration stands):", leadErr);
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
