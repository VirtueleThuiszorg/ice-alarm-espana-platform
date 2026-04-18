import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { partnerCompleteInviteSchema, validateRequest } from "../_shared/validation.ts";

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const validated = validateRequest(partnerCompleteInviteSchema, rawBody, corsHeaders);
    if (validated.error) return validated.error;

    const { token, password, profile } = validated.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validate the invite token
    const { data: invite, error: inviteError } = await adminClient
      .from("partner_admin_invites")
      .select("id, partner_id, status, expires_at")
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
        .from("partner_admin_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ success: false, error: "token_expired" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch the partner record
    const { data: partnerRecord, error: partnerError } = await adminClient
      .from("partners")
      .select("id, user_id, email, contact_name")
      .eq("id", invite.partner_id)
      .single();

    if (partnerError || !partnerRecord) {
      return new Response(
        JSON.stringify({ success: false, error: "Partner record not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create auth user (partner invite flow has no pre-existing auth user)
    let authUserId: string;

    if (partnerRecord.user_id) {
      // Edge case: user_id already set (shouldn't happen but handle gracefully)
      const { error: passwordError } = await adminClient.auth.admin.updateUser(
        partnerRecord.user_id,
        { password }
      );

      if (passwordError) {
        console.error("Error setting password on existing user:", passwordError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to set password" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      authUserId = partnerRecord.user_id;
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: partnerRecord.email,
        password,
        email_confirm: true,
        user_metadata: {
          role: "partner",
          contact_name: partnerRecord.contact_name,
        },
      });

      if (authError || !authData?.user) {
        // Handle orphaned auth user (email already exists)
        if (authError?.code === "email_exists" || authError?.message?.includes("already been registered")) {
          const { data: existingUsers } = await adminClient.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find(
            (u) => u.email?.toLowerCase() === partnerRecord.email.toLowerCase()
          );

          if (!existingUser) {
            return new Response(
              JSON.stringify({ success: false, error: "Email exists but could not find user" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Reset password on orphaned user
          const { error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
            password,
            email_confirm: true,
            user_metadata: { role: "partner", contact_name: partnerRecord.contact_name },
          });

          if (updateError) {
            console.error("Error updating orphaned auth user:", updateError);
            return new Response(
              JSON.stringify({ success: false, error: "Failed to set up account" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          authUserId = existingUser.id;
        } else {
          console.error("Error creating auth user:", authError);
          return new Response(
            JSON.stringify({ success: false, error: authError?.message || "Failed to create account" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        authUserId = authData.user.id;
      }
    }

    // 4. Update partner record with wizard data + activate
    const updates: Record<string, unknown> = {
      user_id: authUserId,
      status: "active",
    };

    const allowedProfileFields = [
      "phone", "company_name", "position_title",
      "organization_type", "organization_registration", "organization_website",
      "estimated_monthly_referrals",
      "payout_beneficiary_name", "payout_iban",
      "region",
    ];

    for (const field of allowedProfileFields) {
      const value = (profile as Record<string, unknown>)[field];
      if (value !== undefined && value !== null && value !== "") {
        updates[field] = value;
      }
    }

    const { error: updateError } = await adminClient
      .from("partners")
      .update(updates)
      .eq("id", partnerRecord.id);

    if (updateError) {
      console.error("Error updating partner record:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Mark invite as completed
    await adminClient.from("partner_admin_invites").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", invite.id);

    // 6. Sign in the user to return a session
    const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
      email: partnerRecord.email,
      password,
    });

    if (signInError) {
      console.error("Error signing in:", signInError);
      // Account is activated, just can't auto-sign-in
    }

    // 7. Log activity
    await adminClient.from("activity_logs").insert({
      action: "partner_invite_completed",
      entity_type: "partner",
      entity_id: partnerRecord.id,
      new_values: {
        completed_fields: Object.keys(profile).filter(
          (k) => (profile as Record<string, unknown>)[k]
        ),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        session: signInData?.session
          ? {
              access_token: signInData.session.access_token,
              refresh_token: signInData.session.refresh_token,
            }
          : null,
        redirectTo: "/partner-dashboard",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in partner-complete-invite function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
