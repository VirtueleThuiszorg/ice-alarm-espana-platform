import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: "token_missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch token record
    const { data: tokenData, error: tokenError } = await supabase
      .from("member_update_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ valid: false, error: "token_invalid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is already used
    if (tokenData.used_at) {
      return new Response(
        JSON.stringify({ valid: false, error: "token_used" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ valid: false, error: "token_expired" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch member data
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("*")
      .eq("id", tokenData.member_id)
      .single();

    if (memberError || !memberData) {
      return new Response(
        JSON.stringify({ valid: false, error: "member_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch medical information
    const { data: medicalData } = await supabase
      .from("medical_information")
      .select("*")
      .eq("member_id", tokenData.member_id)
      .maybeSingle();

    // Fetch emergency contacts
    const { data: contactsData } = await supabase
      .from("emergency_contacts")
      .select("*")
      .eq("member_id", tokenData.member_id)
      .order("priority_order", { ascending: true });

    return new Response(
      JSON.stringify({
        valid: true,
        requestedFields: tokenData.requested_fields,
        member: {
          id: memberData.id,
          first_name: memberData.first_name,
          last_name: memberData.last_name,
          email: memberData.email,
          phone: memberData.phone,
          nie_dni: memberData.nie_dni,
          address_line_1: memberData.address_line_1,
          address_line_2: memberData.address_line_2,
          city: memberData.city,
          province: memberData.province,
          postal_code: memberData.postal_code,
          country: memberData.country,
          date_of_birth: memberData.date_of_birth,
          preferred_language: memberData.preferred_language,
        },
        medical: medicalData || null,
        emergencyContacts: contactsData || [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in validate-member-update-token:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
