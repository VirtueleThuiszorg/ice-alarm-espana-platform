/**
 * partner-apply — server-side partner APPLICATION intake.
 *
 * Fixes the /partner onboarding failure: the page did an ANONYMOUS
 * client-side INSERT into `partners`, which RLS correctly denies (the only
 * write policy is staff-manage — by design). Same bug class, same fix
 * pattern as complete-member-registration (#38): route through a strictly
 * scoped service-role function, ZERO policy changes.
 *
 * Deliberately does NOT create an auth account (that's partner-register,
 * used by the invited /partner/join flow). An application is just a pending
 * `partners` row + an admin heads-up.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { sendEmail } from "../_shared/email.ts";

const APPLICATION_FIELDS = {
  contact_name: { max: 200, required: true },
  email: { max: 320, required: true },
  phone: { max: 40, required: false },
  preferred_language: { max: 5, required: false },
  region: { max: 120, required: false },
  how_heard_about_us: { max: 500, required: false },
} as const;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jh });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`partner-apply:${ip}`, 5, 60_000).allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: jh });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Whitelist + validate — nothing else reaches the row.
    const values: Record<string, string> = {};
    for (const [field, rule] of Object.entries(APPLICATION_FIELDS)) {
      const v = typeof body[field] === "string" ? body[field].trim() : "";
      if (rule.required && !v) {
        return new Response(JSON.stringify({ error: `${field} is required` }), { status: 400, headers: jh });
      }
      if (v.length > rule.max) {
        return new Response(JSON.stringify({ error: `${field} too long` }), { status: 400, headers: jh });
      }
      if (v) values[field] = v;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers: jh });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Dedup by email — an existing partner or application never gets a second row.
    const { data: existing } = await admin
      .from("partners")
      .select("id, status")
      .ilike("email", values.email)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "duplicate", duplicate: true }), { status: 409, headers: jh });
    }

    const baseName = values.contact_name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "PARTNER";
    const { data: partner, error: insertError } = await admin
      .from("partners")
      .insert({
        ...values,
        preferred_language: values.preferred_language || "en",
        referral_code: `${baseName}-REF`,
        partner_type: "referral",
        status: "pending",
        payout_method: "bank_transfer",
      })
      .select("id")
      .single();
    if (insertError) {
      console.error("[partner-apply] insert failed:", insertError.message);
      // Unique-violation on referral_code → retry once with a random suffix.
      if (insertError.code === "23505") {
        const { data: retry, error: retryError } = await admin
          .from("partners")
          .insert({
            ...values,
            preferred_language: values.preferred_language || "en",
            referral_code: `${baseName}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
            partner_type: "referral",
            status: "pending",
            payout_method: "bank_transfer",
          })
          .select("id")
          .single();
        if (retryError) throw new Error("Application could not be saved");
        return await respondCreated(retry.id, values, admin, jh);
      }
      throw new Error("Application could not be saved");
    }

    return await respondCreated(partner.id, values, admin, jh);
  } catch (error) {
    console.error("[partner-apply] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: jh },
    );
  }
});

async function respondCreated(
  partnerId: string,
  values: Record<string, string>,
  admin: ReturnType<typeof createClient>,
  jh: Record<string, string>,
): Promise<Response> {
  // Admin heads-up moves server-side (was a client-side fire-and-forget).
  try {
    await admin.functions.invoke("notify-admin", {
      body: {
        event_type: "partner.application",
        entity_type: "partner",
        entity_id: partnerId,
        payload: { contact_name: values.contact_name },
      },
    });
  } catch (e) {
    console.error("[partner-apply] notify-admin failed (application saved):", e);
  }

  // Applicant confirmation with the COMMISSION TERMS (Lee, 2026-07-24):
  // €50 per pendant sold, FLAT — no volume tiers, no discounts. The public
  // page deliberately shows no figures; this email is where terms are stated.
  // Non-blocking: the application is already saved; a transport failure is
  // logged loudly, never hidden behind a fake success.
  try {
    const emailResult = await sendEmail(
      values.email,
      confirmationSubject(values.preferred_language),
      confirmationHtml(values),
    );
    if (!emailResult.success) {
      console.error("[partner-apply] confirmation email FAILED (application saved):", emailResult.error);
    }
  } catch (e) {
    console.error("[partner-apply] confirmation email FAILED (application saved):", e);
  }

  return new Response(JSON.stringify({ success: true, partner_id: partnerId }), {
    status: 200,
    headers: jh,
  });
}

function confirmationSubject(lang?: string): string {
  return lang === "es"
    ? "Hemos recibido tu solicitud de colaborador — ICE Alarm España"
    : "We've received your partner application — ICE Alarm España";
}

function confirmationHtml(values: Record<string, string>): string {
  const name = values.contact_name;
  if (values.preferred_language === "es") {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">ICE Alarm España</h1>
          <p style="color: #bfdbfe; margin: 8px 0 0 0;">Programa de Colaboradores</p>
        </div>
        <div style="padding: 30px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1f2937; margin-top: 0;">¡Hola ${name}!</h2>
          <p style="color: #4b5563;">Hemos recibido tu solicitud para ser colaborador de ICE Alarm España. Nuestro equipo la revisará y te avisaremos en cuanto tu cuenta esté activada.</p>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #1e40af; font-weight: bold; margin: 0 0 8px 0;">Condiciones de comisión</p>
            <p style="color: #1f2937; margin: 0;">Ganas <strong>50 € por cada colgante vendido</strong> a través de tu enlace de referido. Es una <strong>tarifa fija</strong>: sin escalas por volumen y sin descuentos por vender más.</p>
          </div>
          <p style="color: #4b5563;">Próximos pasos: revisamos tu solicitud → activamos tu cuenta → recibes tu enlace de colaborador.</p>
          <p style="color: #9ca3af; font-size: 13px;">Si no has enviado esta solicitud, puedes ignorar este correo.</p>
        </div>
      </div>
    `;
  }
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">ICE Alarm España</h1>
        <p style="color: #bfdbfe; margin: 8px 0 0 0;">Partner Programme</p>
      </div>
      <div style="padding: 30px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <h2 style="color: #1f2937; margin-top: 0;">Hello ${name}!</h2>
        <p style="color: #4b5563;">We've received your application to become a ICE Alarm España partner. Our team will review it and let you know as soon as your account is activated.</p>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="color: #1e40af; font-weight: bold; margin: 0 0 8px 0;">Commission terms</p>
          <p style="color: #1f2937; margin: 0;">You earn <strong>€50 for every pendant sold</strong> through your referral link. This is a <strong>flat rate</strong> — no volume tiers, and no discounts for selling more.</p>
        </div>
        <p style="color: #4b5563;">Next steps: we review your application → your account is activated → you receive your partner link.</p>
        <p style="color: #9ca3af; font-size: 13px;">If you didn't submit this application, you can ignore this email.</p>
      </div>
    </div>
  `;
}
