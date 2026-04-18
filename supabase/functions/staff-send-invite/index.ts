import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

function getRoleDisplayName(role: string): string {
  switch (role) {
    case "admin": return "Admin";
    case "call_centre_supervisor": return "Call Centre Supervisor";
    case "call_centre": return "Call Centre Agent";
    default: return role;
  }
}

function getRoleDisplayNameEs(role: string): string {
  switch (role) {
    case "admin": return "Administrador";
    case "call_centre_supervisor": return "Supervisor del Centro de Llamadas";
    case "call_centre": return "Agente del Centro de Llamadas";
    default: return role;
  }
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the caller is an admin
    const jwtToken = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(jwtToken);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUserId = claimsData.claims.sub;

    const { data: callerStaff, error: callerError } = await userClient
      .from("staff")
      .select("id, role")
      .eq("user_id", callerUserId)
      .eq("is_active", true)
      .single();

    if (callerError || !callerStaff) {
      return new Response(
        JSON.stringify({ error: "Not authorized - staff record not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["admin", "super_admin"].includes(callerStaff.role)) {
      return new Response(
        JSON.stringify({ error: "Only admins can send staff invitations" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { staff_id } = await req.json();

    if (!staff_id) {
      return new Response(
        JSON.stringify({ error: "staff_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the staff member
    const { data: staffMember, error: staffError } = await adminClient
      .from("staff")
      .select("id, email, first_name, last_name, role, preferred_language, status")
      .eq("id", staff_id)
      .single();

    if (staffError || !staffMember) {
      return new Response(
        JSON.stringify({ error: "Staff member not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (staffMember.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Can only send invitations to pending staff members" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Revoke any existing pending invites for this staff member
    await adminClient
      .from("staff_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("staff_id", staff_id)
      .eq("status", "pending");

    // Generate a secure invite token (64-char hex = 32 bytes of entropy)
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const inviteToken = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

    // Insert invite record
    const { data: invite, error: inviteError } = await adminClient
      .from("staff_invites")
      .insert({
        staff_id,
        token: inviteToken,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        created_by: callerStaff.id,
      })
      .select("id")
      .single();

    if (inviteError || !invite) {
      console.error("Error creating invite:", inviteError);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log activity
    await adminClient.from("staff_activity_log").insert({
      staff_id,
      action: "invite_sent",
      details: { invite_id: invite.id, sent_by: callerStaff.id },
      performed_by: callerStaff.id,
    });

    // Send invite email
    try {
      const baseUrl = req.headers.get("origin") || "https://icealarm.es";
      const inviteLink = `${baseUrl}/staff/invite?token=${inviteToken}`;
      const lang = staffMember.preferred_language || "en";
      const roleDisplay = lang === "es"
        ? getRoleDisplayNameEs(staffMember.role)
        : getRoleDisplayName(staffMember.role);

      const emailContent = lang === "es"
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">ICE Alarm España</h1>
              <p style="color: #bfdbfe; margin: 8px 0 0 0;">Portal de Personal</p>
            </div>
            <div style="padding: 30px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1f2937; margin-top: 0;">¡Hola ${staffMember.first_name}!</h2>
              <p style="color: #4b5563;">Has sido invitado/a a unirte al equipo de ICE Alarm como <strong>${roleDisplay}</strong>.</p>
              <p style="color: #4b5563;">Haz clic en el botón de abajo para configurar tu cuenta y empezar.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" style="background-color: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Configurar Mi Cuenta</a>
              </div>
              <p style="color: #9ca3af; font-size: 13px;">Este enlace expira en 7 días. Si tienes alguna pregunta, contacta con tu supervisor.</p>
            </div>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">ICE Alarm España</h1>
              <p style="color: #bfdbfe; margin: 8px 0 0 0;">Staff Portal</p>
            </div>
            <div style="padding: 30px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1f2937; margin-top: 0;">Hello ${staffMember.first_name}!</h2>
              <p style="color: #4b5563;">You have been invited to join the ICE Alarm team as a <strong>${roleDisplay}</strong>.</p>
              <p style="color: #4b5563;">Click the button below to set up your account and get started.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" style="background-color: #3b82f6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Set Up My Account</a>
              </div>
              <p style="color: #9ca3af; font-size: 13px;">This link expires in 7 days. If you have any questions, please contact your supervisor.</p>
            </div>
          </div>
        `;

      const emailSubject = lang === "es"
        ? "Invitación al Portal de Personal de ICE Alarm"
        : "Invitation to ICE Alarm Staff Portal";

      const emailResult = await sendEmail(staffMember.email, emailSubject, emailContent);

      if (emailResult.success) {
        console.log("Invite email sent successfully to:", staffMember.email);
      } else {
        console.error("Failed to send invite email:", emailResult.error);
      }
    } catch (emailError) {
      console.error("Failed to send invite email:", emailError);
      // Don't fail the request — the invite record was created successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        invite_id: invite.id,
        message: "Invitation sent successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in staff-send-invite function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
