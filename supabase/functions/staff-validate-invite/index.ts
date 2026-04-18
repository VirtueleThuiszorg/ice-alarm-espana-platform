import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const WIZARD_COLLECTABLE_FIELDS = [
  "phone", "personal_mobile", "date_of_birth", "nationality",
  "nie_number", "social_security_number",
  "address_line1", "address_line2", "city", "province", "postal_code", "country",
  "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
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
      .from("staff_invites")
      .select("id, staff_id, status, expires_at")
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
        .from("staff_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ valid: false, error: "token_expired" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the staff record
    const { data: staff, error: staffError } = await adminClient
      .from("staff")
      .select("id, first_name, last_name, email, role, preferred_language, phone, personal_mobile, date_of_birth, nationality, nie_number, social_security_number, address_line1, address_line2, city, province, postal_code, country, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship")
      .eq("id", invite.staff_id)
      .single();

    if (staffError || !staff) {
      return new Response(
        JSON.stringify({ valid: false, error: "token_invalid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute which fields are missing and can be collected by the wizard
    const missingFields = WIZARD_COLLECTABLE_FIELDS.filter((field) => {
      const value = (staff as Record<string, unknown>)[field];
      return value === null || value === undefined || value === "";
    });

    return new Response(
      JSON.stringify({
        valid: true,
        staff: {
          id: staff.id,
          first_name: staff.first_name,
          last_name: staff.last_name,
          email: staff.email,
          role: staff.role,
          preferred_language: staff.preferred_language,
        },
        missingFields,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in staff-validate-invite function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ valid: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
