import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

/**
 * GDPR Article 17 — Right to Erasure
 *
 * Anonymises/deletes member data, cancels subscriptions, removes medical info,
 * logs the deletion in audit trail, and sends confirmation email.
 *
 * Called by the client-side useGdprDeletion hook.
 * Requires authenticated request — the user can only delete their own data.
 */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the member record for this auth user
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, email, first_name, last_name, preferred_language")
      .eq("user_id", user.id)
      .single();

    if (memberError || !member) {
      // Try by email as fallback
      const { data: memberByEmail } = await supabase
        .from("members")
        .select("id, email, first_name, last_name, preferred_language")
        .eq("email", user.email)
        .single();

      if (!memberByEmail) {
        return new Response(JSON.stringify({ error: "Member not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Use memberByEmail
      Object.assign(member || {}, memberByEmail);
    }

    const memberId = member!.id;
    const memberEmail = member!.email;
    const memberLang = member!.preferred_language || "es";
    const now = new Date().toISOString();

    console.log("GDPR deletion requested for member:", memberId);

    // 1. Cancel active subscriptions
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: now })
      .eq("member_id", memberId)
      .in("status", ["active", "pending", "past_due"]);

    // 2. Delete medical information
    await supabase
      .from("medical_information")
      .delete()
      .eq("member_id", memberId);

    // 3. Delete emergency contacts
    await supabase
      .from("emergency_contacts")
      .delete()
      .eq("member_id", memberId);

    // 4. Anonymise alerts (keep for safety records but remove PII)
    await supabase
      .from("alerts")
      .update({ message: "[GDPR DELETED]", location_address: null })
      .eq("member_id", memberId);

    // 5. Delete CRM profile
    await supabase
      .from("crm_profiles")
      .delete()
      .eq("member_id", memberId);

    // 5b. Revoke outstanding record-update tokens.
    //
    // `member_update_tokens` rows carry a bearer token that grants read AND write
    // access to this member's profile, medical information and emergency contacts
    // with no second factor — anyone holding the email holds the data.
    //
    // They are NOT cleaned up by the anonymisation in step 6. The table declares
    // `member_id ... ON DELETE CASCADE`, but step 6 UPDATEs the member row rather
    // than deleting it ("keep for referential integrity"), so the cascade never
    // fires. Before this, an unexpired token issued shortly before an erasure
    // request stayed valid afterwards and still resolved to the member — a live
    // access path to health data surviving the request to erase it.
    //
    // Deleted rather than marked used: under data minimisation there is no reason
    // to retain a token for a member who has asked to be erased, and a deleted row
    // cannot be un-marked. `created_by` / `created_at` audit of the *request* lives
    // in activity_logs, which is handled separately below.
    const { error: tokenError, count: tokensRevoked } = await supabase
      .from("member_update_tokens")
      .delete({ count: "exact" })
      .eq("member_id", memberId);

    if (tokenError) {
      // Loud, not silent: leaving a live data-access path behind is exactly the
      // failure this step exists to prevent, so an operator has to see it.
      console.error("GDPR: FAILED to revoke member_update_tokens", {
        member_id: memberId,
        code: tokenError.code,
        message: tokenError.message,
      });
      throw new Error("GDPR deletion aborted: update tokens could not be revoked");
    }

    console.log("GDPR: revoked update tokens", { member_id: memberId, count: tokensRevoked ?? 0 });

    // 6. Anonymise the member record (keep for referential integrity)
    await supabase
      .from("members")
      .update({
        first_name: "DELETED",
        last_name: "DELETED",
        email: `deleted_${memberId}@gdpr.local`,
        phone: "",
        date_of_birth: null,
        nie_dni: null,
        address_line_1: "",
        address_line_2: null,
        city: "",
        province: "",
        postal_code: "",
        special_instructions: null,
        status: "deleted",
      })
      .eq("id", memberId);

    // 7. Log audit trail
    await supabase.from("activity_logs").insert({
      action: "gdpr_deletion_completed",
      entity_type: "member",
      entity_id: memberId,
      new_values: {
        user_id: user.id,
        original_email: memberEmail,
        completed_at: now,
        reason: "GDPR Article 17 - Right to erasure",
      },
    });

    // 8. Send confirmation email to original address
    if (memberEmail) {
      const subject = memberLang === "es"
        ? "Confirmación de eliminación de datos - Care Conneqt"
        : "Data Deletion Confirmation - Care Conneqt";

      const html = memberLang === "es"
        ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#dc2626;">Care Conneqt</h2>
            <p>Hemos procesado su solicitud de eliminación de datos de acuerdo con el RGPD (Artículo 17).</p>
            <p>Sus datos personales, información médica y contactos de emergencia han sido eliminados de nuestros sistemas.</p>
            <p>Si tiene alguna pregunta, puede contactarnos en cualquier momento.</p>
            <p style="color:#6b7280;font-size:12px;margin-top:30px;">Care Conneqt</p>
          </div>`
        : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#dc2626;">Care Conneqt</h2>
            <p>We have processed your data deletion request in accordance with GDPR (Article 17).</p>
            <p>Your personal data, medical information, and emergency contacts have been removed from our systems.</p>
            <p>If you have any questions, you can contact us at any time.</p>
            <p style="color:#6b7280;font-size:12px;margin-top:30px;">Care Conneqt</p>
          </div>`;

      await sendEmail(memberEmail, subject, html);
    }

    console.log("GDPR deletion completed for member:", memberId);

    return new Response(
      JSON.stringify({ success: true, message: "Data deletion completed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("GDPR deletion error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
