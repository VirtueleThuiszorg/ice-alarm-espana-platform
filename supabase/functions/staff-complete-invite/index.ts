import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { staffCompleteInviteSchema, validateRequest } from "../_shared/validation.ts";

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const validated = validateRequest(staffCompleteInviteSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;

    const { token, password, profile } = validated.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validate the invite token
    const { data: invite, error: inviteError } = await adminClient
      .from("staff_invites")
      .select("id, staff_id, status, expires_at")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ success: false, error: "token_invalid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.status === "completed") {
      return new Response(
        JSON.stringify({ success: false, error: "token_used" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.status === "revoked") {
      return new Response(
        JSON.stringify({ success: false, error: "token_invalid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      await adminClient
        .from("staff_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ success: false, error: "token_expired" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch the staff record
    const { data: staffRecord, error: staffError } = await adminClient
      .from("staff")
      .select("id, user_id, email, role")
      .eq("id", invite.staff_id)
      .single();

    if (staffError || !staffRecord) {
      return new Response(
        JSON.stringify({ success: false, error: "Staff record not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Set the password on the auth user
    const { error: passwordError } = await (adminClient.auth.admin as any).updateUser(
      staffRecord.user_id,
      { password }
    );

    if (passwordError) {
      console.error("Error setting password:", passwordError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to set password" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Update staff record with wizard data + activate
    const updates: Record<string, unknown> = { status: "active" };

    const allowedProfileFields = [
      "date_of_birth", "nationality", "nie_number", "social_security_number",
      "phone", "personal_mobile",
      "address_line1", "address_line2", "city", "province", "postal_code", "country",
      "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
    ];

    for (const field of allowedProfileFields) {
      const value = (profile as Record<string, unknown>)[field];
      if (value !== undefined && value !== null && value !== "") {
        updates[field] = value;
      }
    }

    const { error: updateError } = await adminClient
      .from("staff")
      .update(updates)
      .eq("id", staffRecord.id);

    if (updateError) {
      console.error("Error updating staff record:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Mark invite as completed
    await adminClient.from("staff_invites").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", invite.id);

    // 6. Sign in the user to return a session
    const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
      email: staffRecord.email,
      password,
    });

    if (signInError) {
      console.error("Error signing in:", signInError);
      // Account is activated, just can't auto-sign-in
      // Staff can log in manually
    }

    // 7. Log activity
    await adminClient.from("staff_activity_log").insert({
      staff_id: staffRecord.id,
      action: "invite_completed",
      details: { completed_fields: Object.keys(profile).filter((k) => (profile as Record<string, unknown>)[k]) },
      performed_by: staffRecord.id,
    });

    // 8. Determine redirect
    const redirectTo = ["admin", "super_admin"].includes(staffRecord.role)
      ? "/admin"
      : "/call-centre";

    return new Response(
      JSON.stringify({
        success: true,
        session: signInData?.session
          ? {
              access_token: signInData.session.access_token,
              refresh_token: signInData.session.refresh_token,
            }
          : null,
        redirectTo,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in staff-complete-invite function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
