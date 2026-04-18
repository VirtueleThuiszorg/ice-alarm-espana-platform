import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface AlertNotifyRequest {
  alert_id: string;
  member_id: string;
}

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { alert_id, member_id }: AlertNotifyRequest = await req.json();

    if (!alert_id || !member_id) {
      return new Response(
        JSON.stringify({ error: "alert_id and member_id are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing alert notifications for alert ${alert_id}, member ${member_id}`);

    // Get alert details
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .select("*")
      .eq("id", alert_id)
      .single();

    if (alertError || !alert) {
      console.error("Alert not found:", alertError);
      return new Response(
        JSON.stringify({ error: "Alert not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get member details
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("first_name, last_name, phone")
      .eq("id", member_id)
      .single();

    if (memberError || !member) {
      console.error("Member not found:", memberError);
      return new Response(
        JSON.stringify({ error: "Member not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find all partner alert subscriptions for this member
    const { data: subscriptions, error: subError } = await supabase
      .from("partner_alert_subscriptions")
      .select(`
        id,
        partner_id,
        notify_email,
        notify_sms,
        partner:partners!inner(
          id,
          contact_name,
          email,
          phone,
          preferred_language,
          alert_visibility_enabled
        )
      `)
      .eq("member_id", member_id);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No partner subscriptions found for this member");
      return new Response(
        JSON.stringify({ success: true, notifications_sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const notifications: { partner_id: string; method: string; success: boolean }[] = [];

    for (const sub of subscriptions) {
      const partner = sub.partner as any;
      
      // Skip if partner doesn't have alert visibility enabled
      if (!partner.alert_visibility_enabled) {
        console.log(`Skipping partner ${partner.id} - alert visibility not enabled`);
        continue;
      }

      // Send email notification
      if (sub.notify_email && partner.email && RESEND_API_KEY) {
        try {
          const emailContent = partner.preferred_language === "es"
            ? {
                subject: `🚨 Alerta de ${member.first_name} ${member.last_name}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #dc2626;">🚨 Alerta Activada</h1>
                    <p>Hola ${partner.contact_name},</p>
                    <p>Se ha activado una alerta para un residente bajo su supervisión:</p>
                    <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 5px 0;"><strong>Residente:</strong> ${member.first_name} ${member.last_name}</p>
                      <p style="margin: 5px 0;"><strong>Tipo de Alerta:</strong> ${alert.alert_type}</p>
                      <p style="margin: 5px 0;"><strong>Hora:</strong> ${new Date(alert.received_at).toLocaleString('es-ES')}</p>
                      ${alert.location_address ? `<p style="margin: 5px 0;"><strong>Ubicación:</strong> ${alert.location_address}</p>` : ''}
                    </div>
                    <p>Nuestro equipo de respuesta está gestionando esta alerta.</p>
                    <p>Saludos,<br>El equipo de ICE Alarm</p>
                  </div>
                `
              }
            : {
                subject: `🚨 Alert from ${member.first_name} ${member.last_name}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #dc2626;">🚨 Alert Activated</h1>
                    <p>Hello ${partner.contact_name},</p>
                    <p>An alert has been triggered for a resident under your care:</p>
                    <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 5px 0;"><strong>Resident:</strong> ${member.first_name} ${member.last_name}</p>
                      <p style="margin: 5px 0;"><strong>Alert Type:</strong> ${alert.alert_type}</p>
                      <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date(alert.received_at).toLocaleString('en-GB')}</p>
                      ${alert.location_address ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${alert.location_address}</p>` : ''}
                    </div>
                    <p>Our response team is handling this alert.</p>
                    <p>Best regards,<br>The ICE Alarm Team</p>
                  </div>
                `
              };

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "ICE Alarm Alerts <alerts@icealarm.es>",
              to: [partner.email],
              subject: emailContent.subject,
              html: emailContent.html,
            }),
          });

          const emailSuccess = emailRes.ok;
          notifications.push({ partner_id: partner.id, method: "email", success: emailSuccess });

          // Log the notification
          await supabase.from("partner_alert_notifications").insert({
            partner_id: partner.id,
            alert_id: alert_id,
            member_id: member_id,
            notification_method: "email",
          });

          console.log(`Email notification to ${partner.email}: ${emailSuccess ? 'sent' : 'failed'}`);
        } catch (emailError) {
          console.error(`Email error for partner ${partner.id}:`, emailError);
          notifications.push({ partner_id: partner.id, method: "email", success: false });
        }
      }

      // Log dashboard notification (always created for partners with visibility)
      await supabase.from("partner_alert_notifications").insert({
        partner_id: partner.id,
        alert_id: alert_id,
        member_id: member_id,
        notification_method: "dashboard",
      });
      notifications.push({ partner_id: partner.id, method: "dashboard", success: true });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        notifications_sent: notifications.filter(n => n.success).length,
        details: notifications
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    console.error("Alert notification error:", error);
    const message = error instanceof Error ? error.message : "Notification failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
