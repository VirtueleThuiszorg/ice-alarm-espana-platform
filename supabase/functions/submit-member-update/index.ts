import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  decideSubmitOutcome,
  tokenRefusal,
  type SubmitResult,
  type SubmitRoute,
} from "../_shared/member-update-outcome.ts";

const FN = "submit-member-update";

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

/**
 * Which route this submission came by — DERIVED from who authenticated, never taken from the
 * payload. A client-supplied route would be client-writable provenance on health data, which is
 * golden rule 3's reasoning applied to attribution: anything writable is eventually written by
 * the wrong actor.
 *
 * An operator calls this with their own staff JWT (the admin UI's session). A member calls it
 * anonymously with only the token. So the presence of a JWT that `is_staff` accepts IS the
 * distinction, and there is nothing to spoof from the browser.
 */
async function resolveRoute(
  req: Request,
  supabaseUrl: string,
): Promise<{ route: SubmitRoute; staffId: string | null }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  // The member route sends the anon key (or nothing) — not a user session.
  if (!jwt || jwt === anonKey) return { route: "member_link", staffId: null };

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return { route: "member_link", staffId: null };

    // Service-role client for the lookup: `staff` is not readable by the caller in every case,
    // and this must not depend on the caller's own visibility.
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: staff } = await admin
      .from("staff")
      .select("id")
      .eq("user_id", uid)
      .eq("is_active", true)
      .maybeSingle();

    if (staff?.id) return { route: "operator_assisted", staffId: staff.id };
    // An authenticated member using their own session plus the token is still the member route.
    return { route: "member_link", staffId: null };
  } catch (_err) {
    // Never upgrade an unreadable identity into an operator attribution.
    return { route: "member_link", staffId: null };
  }
}

/** One place that turns a result into a response, so no branch can drift back to success. */
function respond(result: SubmitResult, corsHeaders: Record<string, string>): Response {
  // Status stays 200 for every outcome, deliberately. MemberUpdatePage calls this through
  // supabase.functions.invoke, which turns any non-2xx into a thrown `error` and loses the body
  // — the member would then see a generic failure instead of "this link has expired". The body
  // is unambiguous (`success` is false and `outcome` names the reason), which is the property
  // that was missing; the status code was never the lie.
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    if (!token) return respond(tokenRefusal("token_missing"), corsHeaders);

    // Validate token again
    const { data: tokenData, error: tokenError } = await supabase
      .from("member_update_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenData) return respond(tokenRefusal("token_invalid"), corsHeaders);
    if (tokenData.used_at) return respond(tokenRefusal("token_used"), corsHeaders);
    if (new Date(tokenData.expires_at) < new Date()) {
      return respond(tokenRefusal("token_expired"), corsHeaders);
    }

    const memberId = tokenData.member_id;
    const requestedFields: string[] = tokenData.requested_fields ?? [];
    const { route, staffId } = await resolveRoute(req, supabaseUrl);

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

    // Update or create medical information. Provenance is stamped explicitly because this runs
    // as service_role, where auth.uid() is NULL and the trigger cannot infer the route.
    let medicalAttempted = false;
    let medicalError = false;
    if (medical && Object.keys(medical).length > 0) {
      medicalAttempted = true;
      const { data: existingMedical } = await supabase
        .from("medical_information")
        .select("id")
        .eq("member_id", memberId)
        .maybeSingle();

      if (existingMedical) {
        const { error: medErr } = await supabase
          .from("medical_information")
          .update({
            ...medical,
            recorded_via: route,
            recorded_by_staff: staffId,
            updated_at: new Date().toISOString(),
          })
          .eq("member_id", memberId);

        if (medErr) {
          console.error(JSON.stringify({ fn: FN, event: "medical_update_failed", member_id: memberId, error: medErr.message }));
          medicalError = true;
        }
      } else {
        const { error: medErr } = await supabase
          .from("medical_information")
          .insert({
            member_id: memberId,
            ...medical,
            recorded_via: route,
            recorded_by_staff: staffId,
          });

        if (medErr) {
          console.error(JSON.stringify({ fn: FN, event: "medical_insert_failed", member_id: memberId, error: medErr.message }));
          medicalError = true;
        }
      }
    }

    // Update emergency contacts. The per-contact errors below used to be console.error'd and
    // dropped, so a submission where every insert failed still returned success. They are now
    // counted and the count decides the outcome.
    let contactsAttempted = 0;
    let contactErrors = 0;
    if (emergencyContacts && emergencyContacts.length > 0) {
      for (const contact of emergencyContacts) {
        contactsAttempted++;
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
              recorded_via: route,
              recorded_by_staff: staffId,
            })
            .eq("id", contact.id)
            .eq("member_id", memberId);

          if (contactError) {
            console.error(JSON.stringify({ fn: FN, event: "contact_update_failed", member_id: memberId, error: contactError.message }));
            contactErrors++;
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
              recorded_via: route,
              recorded_by_staff: staffId,
            });

          if (contactError) {
            console.error(JSON.stringify({ fn: FN, event: "contact_insert_failed", member_id: memberId, error: contactError.message }));
            contactErrors++;
          }
        }
      }
    }

    const result = decideSubmitOutcome({
      requestedFields,
      contactsAttempted,
      contactErrors,
      medicalAttempted,
      medicalError,
      route,
    });

    // The token is burned ONLY on a clean write. A failed or empty submission leaves the link
    // usable so the member can come back — previously it was spent either way, which meant a
    // silent failure locked them out of the only route to being monitoring-ready.
    if (result.burnToken) {
      await supabase
        .from("member_update_tokens")
        .update({
          used_at: new Date().toISOString(),
          submitted_via: route,
          submitted_by_staff: staffId,
        })
        .eq("id", tokenData.id);
    }

    // The action and the route are recorded from the DERIVED route, not hardcoded. This log used
    // to say "member_update_link" even when an operator keyed the data.
    await supabase.from("activity_logs").insert({
      entity_type: "member",
      entity_id: memberId,
      action: route === "operator_assisted" ? "member_update_operator_assisted" : "member_self_update",
      new_values: {
        updated_via: route,
        recorded_by_staff: staffId,
        outcome: result.outcome,
        contacts_written: result.contactsWritten,
        medical_written: result.medicalWritten,
      },
    });

    console.log(JSON.stringify({ fn: FN, event: "submit_complete", outcome: result.outcome, route, member_id: memberId }));
    return respond(result, corsHeaders);
  } catch (error) {
    console.error("Error in submit-member-update:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
