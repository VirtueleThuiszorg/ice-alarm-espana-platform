import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";



interface RequestPayload {
  memberId: string;
  recipientEmail: string;
  requestedFields: string[];
  memberName: string;
  preferredLanguage: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user is staff
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is staff
    const { data: staffData } = await supabaseClient
      .from("staff")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffData) {
      return new Response(JSON.stringify({ error: "Not authorized - staff only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: RequestPayload = await req.json();
    const { memberId, recipientEmail, requestedFields, memberName, preferredLanguage } = payload;

    if (!memberId || !recipientEmail) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate secure token (32 bytes = 64 hex characters)
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Set expiry to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store token in database
    const { error: insertError } = await supabaseClient
      .from("member_update_tokens")
      .insert({
        member_id: memberId,
        token,
        requested_fields: requestedFields,
        expires_at: expiresAt.toISOString(),
        created_by: staffData.id,
      });

    if (insertError) {
      console.error("Error inserting token:", insertError);
      throw new Error("Failed to create update token");
    }

    // Build the update link
    const baseUrl = Deno.env.get("SITE_URL") || "https://shelter-span.lovable.app";
    const updateLink = `${baseUrl}/member-update?token=${token}`;

    // Send bilingual email via Gmail SMTP
    const isSpanish = preferredLanguage === "es";

    const emailSubject = isSpanish 
      ? "Por favor actualice su información - ICE Alarm España"
      : "Please Update Your Information - ICE Alarm España";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
    .divider { border-top: 1px dashed #d1d5db; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">ICE Alarm España</h1>
  </div>
  <div class="content">
    <h2>${isSpanish ? "Hola" : "Hello"} ${memberName},</h2>
    
    <p><strong>${isSpanish ? "Español:" : "English:"}</strong></p>
    <p>${isSpanish 
      ? "Necesitamos información adicional para poder asistirle mejor en caso de emergencia. Por favor haga clic en el botón de abajo para actualizar su información."
      : "We need some additional information to ensure we can best assist you in an emergency. Please click the button below to update your profile."}</p>
    
    <div style="text-align: center;">
      <a href="${updateLink}" class="button">
        ${isSpanish ? "Actualizar Mi Información" : "Update My Information"}
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280;">
      ${isSpanish 
        ? "Este enlace caduca en 7 días."
        : "This link expires in 7 days."}
    </p>
    
    <div class="divider"></div>
    
    <p><strong>${isSpanish ? "English:" : "Español:"}</strong></p>
    <p>${isSpanish 
      ? "We need some additional information to ensure we can best assist you in an emergency. Please click the button above to update your profile."
      : "Necesitamos información adicional para poder asistirle mejor en caso de emergencia. Por favor haga clic en el botón de arriba para actualizar su información."}</p>
    
    <div class="footer">
      <p>ICE Alarm España - ${isSpanish ? "Protegiendo a nuestros mayores" : "Protecting our elderly"}</p>
      <p>${isSpanish 
        ? "Si no solicitó esta actualización, por favor ignore este correo."
        : "If you did not request this update, please ignore this email."}</p>
    </div>
  </div>
</body>
</html>`;

    const emailResult = await sendEmail(recipientEmail, emailSubject, emailHtml);

    if (!emailResult.success) {
      throw new Error(`Email sending failed: ${emailResult.error}`);
    }

    console.log("Email sent successfully to:", recipientEmail);

    // Log activity
    await supabaseClient.from("activity_logs").insert({
      entity_type: "member",
      entity_id: memberId,
      action: "member_update_request_sent",
      staff_id: staffData.id,
      new_values: { recipient_email: recipientEmail, requested_fields: requestedFields },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Update request sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-member-update-request:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
