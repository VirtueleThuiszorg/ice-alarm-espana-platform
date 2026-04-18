import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface UpdatePayload {
  token: string;
  member: {
    nie_dni?: string;
    phone?: string;
    address_line_2?: string;
  };
  medical: {
    blood_type?: string;
    doctor_name?: string;
    doctor_phone?: string;
    hospital_preference?: string;
    allergies?: string[];
    medications?: string[];
    medical_conditions?: string[];
    additional_notes?: string;
  };
  emergencyContacts: Array<{
    id?: string;
    contact_name: string;
    relationship: string;
    phone: string;
    email?: string;
    priority_order: number;
    is_primary: boolean;
    speaks_spanish?: boolean;
    notes?: string;
  }>;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: UpdatePayload = await req.json();
    const { token, member, medical, emergencyContacts } = payload;

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "token_missing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token again
    const { data: tokenData, error: tokenError } = await supabase
      .from("member_update_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ success: false, error: "token_invalid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tokenData.used_at) {
      return new Response(
        JSON.stringify({ success: false, error: "token_used" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "token_expired" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const memberId = tokenData.member_id;

    // Update member profile
    if (member && Object.keys(member).length > 0) {
      const { error: memberError } = await supabase
        .from("members")
        .update({
          ...member,
          updated_at: new Date().toISOString(),
        })
        .eq("id", memberId);

      if (memberError) {
        console.error("Error updating member:", memberError);
        throw new Error("Failed to update member profile");
      }
    }

    // Update or create medical information
    if (medical && Object.keys(medical).length > 0) {
      const { data: existingMedical } = await supabase
        .from("medical_information")
        .select("id")
        .eq("member_id", memberId)
        .maybeSingle();

      if (existingMedical) {
        const { error: medicalError } = await supabase
          .from("medical_information")
          .update({
            ...medical,
            updated_at: new Date().toISOString(),
          })
          .eq("member_id", memberId);

        if (medicalError) {
          console.error("Error updating medical info:", medicalError);
          throw new Error("Failed to update medical information");
        }
      } else {
        const { error: medicalError } = await supabase
          .from("medical_information")
          .insert({
            member_id: memberId,
            ...medical,
          });

        if (medicalError) {
          console.error("Error creating medical info:", medicalError);
          throw new Error("Failed to create medical information");
        }
      }
    }

    // Update emergency contacts
    if (emergencyContacts && emergencyContacts.length > 0) {
      for (const contact of emergencyContacts) {
        if (contact.id) {
          // Update existing contact
          const { error: contactError } = await supabase
            .from("emergency_contacts")
            .update({
              contact_name: contact.contact_name,
              relationship: contact.relationship,
              phone: contact.phone,
              email: contact.email,
              priority_order: contact.priority_order,
              is_primary: contact.is_primary,
              speaks_spanish: contact.speaks_spanish,
              notes: contact.notes,
            })
            .eq("id", contact.id)
            .eq("member_id", memberId);

          if (contactError) {
            console.error("Error updating contact:", contactError);
          }
        } else {
          // Create new contact
          const { error: contactError } = await supabase
            .from("emergency_contacts")
            .insert({
              member_id: memberId,
              contact_name: contact.contact_name,
              relationship: contact.relationship,
              phone: contact.phone,
              email: contact.email,
              priority_order: contact.priority_order,
              is_primary: contact.is_primary,
              speaks_spanish: contact.speaks_spanish,
              notes: contact.notes,
            });

          if (contactError) {
            console.error("Error creating contact:", contactError);
          }
        }
      }
    }

    // Mark token as used
    await supabase
      .from("member_update_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenData.id);

    // Log activity
    await supabase.from("activity_logs").insert({
      entity_type: "member",
      entity_id: memberId,
      action: "member_self_update",
      new_values: { updated_via: "member_update_link" },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Profile updated successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in submit-member-update:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
