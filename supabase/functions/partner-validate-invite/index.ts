import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const WIZARD_COLLECTABLE_FIELDS = [
  "phone", "company_name", "position_title",
  "organization_type", "organization_registration", "organization_website",
  "estimated_monthly_referrals",
  "payout_beneficiary_name", "payout_iban",
  "region",
];

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: "token_missing" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the invite
    const { data: invite, error: inviteError } = await adminClient
      .from("partner_admin_invites")
      .select("id, partner_id, status, expires_at")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ valid: false, error: "token_invalid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.status === "completed") {
      return new Response(
        JSON.stringify({ valid: false, error: "token_used" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.status === "revoked") {
      return new Response(
        JSON.stringify({ valid: false, error: "token_invalid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      // Mark as expired
      await adminClient
        .from("partner_admin_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ valid: false, error: "token_expired" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the partner record
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id, contact_name, email, partner_type, preferred_language, phone, company_name, position_title, organization_type, organization_registration, organization_website, estimated_monthly_referrals, payout_beneficiary_name, payout_iban, region")
      .eq("id", invite.partner_id)
      .single();

    if (partnerError || !partner) {
      return new Response(
        JSON.stringify({ valid: false, error: "token_invalid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute which fields are missing and can be collected by the wizard
    const missingFields = WIZARD_COLLECTABLE_FIELDS.filter((field) => {
      const value = (partner as Record<string, unknown>)[field];
      return value === null || value === undefined || value === "";
    });

    return new Response(
      JSON.stringify({
        valid: true,
        partner: {
          id: partner.id,
          contact_name: partner.contact_name,
          email: partner.email,
          partner_type: partner.partner_type,
          preferred_language: partner.preferred_language,
        },
        missingFields,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in partner-validate-invite function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ valid: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
