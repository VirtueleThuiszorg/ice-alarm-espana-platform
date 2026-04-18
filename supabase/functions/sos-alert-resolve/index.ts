/**
 * SOS Alert Resolve — closes out an SOS alert, conference, and notifies contacts.
 *
 * POST { alert_id, resolution_notes, is_false_alarm, resolution_type? }
 * Auth: Bearer token (authenticated staff)
 *
 * 1. Updates alert to resolved
 * 2. Ends the Twilio conference (if active)
 * 3. Marks all conference participants as left
 * 4. Updates conference_rooms to ended
 * 5. If not a false alarm, notifies emergency contacts who were involved
 * 6. Logs resolution in isabella_assessment_notes
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  loadTwilioCredentials,
  twilioAuth,
} from "../_shared/twilio-credentials.ts";

const FN = "sos-alert-resolve";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jh });
  }

  try {
    // Verify authenticated staff
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jh });
    }

    // Service role client
    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { alert_id, resolution_notes, is_false_alarm, resolution_type } = await req.json();

    if (!alert_id || !resolution_notes) {
      return new Response(
        JSON.stringify({ error: "alert_id and resolution_notes are required" }),
        { status: 400, headers: jh },
      );
    }

    // 1. Update alert to resolved
    const now = new Date().toISOString();
    const { error: alertError } = await sbAdmin
      .from("alerts")
      .update({
        status: "resolved",
        resolved_at: now,
        resolution_notes,
        is_false_alarm: is_false_alarm || false,
      })
      .eq("id", alert_id);

    if (alertError) {
      console.error(`[${FN}] Alert update error:`, alertError);
      return new Response(JSON.stringify({ error: "Failed to resolve alert" }), { status: 500, headers: jh });
    }

    console.log(`[${FN}] Alert ${alert_id} resolved. False alarm: ${is_false_alarm}`);

    // 2. End the conference
    const { data: conference } = await sbAdmin
      .from("conference_rooms")
      .select("id, twilio_conference_sid, conference_name")
      .eq("alert_id", alert_id)
      .eq("status", "active")
      .maybeSingle();

    if (conference) {
      // End Twilio conference via API if we have the SID
      if (conference.twilio_conference_sid) {
        try {
          const creds = await loadTwilioCredentials(sbAdmin);
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Conferences/${conference.twilio_conference_sid}.json`;
          await fetch(twilioUrl, {
            method: "POST",
            headers: {
              Authorization: `Basic ${twilioAuth(creds.accountSid, creds.authToken)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ Status: "completed" }),
          });
          console.log(`[${FN}] Twilio conference ${conference.twilio_conference_sid} ended`);
        } catch (e) {
          console.error(`[${FN}] Error ending Twilio conference:`, e);
        }
      }

      // 3. Mark all participants as left
      await sbAdmin
        .from("conference_participants")
        .update({ left_at: now })
        .eq("conference_id", conference.id)
        .is("left_at", null);

      // 4. Update conference room to ended
      await sbAdmin
        .from("conference_rooms")
        .update({ status: "ended", ended_at: now })
        .eq("id", conference.id);

      console.log(`[${FN}] Conference ${conference.id} ended, all participants marked left`);
    }

    // 5. Log resolution in isabella_assessment_notes
    await sbAdmin.from("isabella_assessment_notes").insert({
      alert_id,
      note_type: "triage_decision",
      content: is_false_alarm
        ? `Alert resolved as FALSE ALARM. Notes: ${resolution_notes}`
        : `Alert resolved. Type: ${resolution_type || "other"}. Notes: ${resolution_notes}`,
      is_critical: false,
    });

    // 6. If not a false alarm, notify emergency contacts who were involved
    if (!is_false_alarm) {
      // Find contacts who were called or added to conference
      const { data: involvedContacts } = await sbAdmin
        .from("conference_participants")
        .select("phone_number, participant_name, emergency_contact_id")
        .eq("conference_id", conference?.id || "")
        .eq("participant_type", "emergency_contact")
        .not("phone_number", "is", null);

      // Also check escalation records for level 5 (emergency contact calls)
      const { data: escalatedContacts } = await sbAdmin
        .from("alert_escalations")
        .select("target_phone")
        .eq("alert_id", alert_id)
        .eq("escalation_level", 5)
        .not("target_phone", "is", null);

      // Collect unique phones
      const notifiedPhones = new Set<string>();
      for (const p of involvedContacts || []) {
        if (p.phone_number) notifiedPhones.add(p.phone_number);
      }
      for (const e of escalatedContacts || []) {
        if (e.target_phone) notifiedPhones.add(e.target_phone);
      }

      if (notifiedPhones.size > 0) {
        // Get member name for the notification
        const { data: alert } = await sbAdmin
          .from("alerts")
          .select("member_id")
          .eq("id", alert_id)
          .maybeSingle();

        if (alert) {
          const { data: member } = await sbAdmin
            .from("members")
            .select("first_name, last_name")
            .eq("id", alert.member_id)
            .maybeSingle();
          const memberName = member ? `${member.first_name} ${member.last_name}` : "Member";

          console.log(`[${FN}] Notifying ${notifiedPhones.size} contacts about resolution for ${memberName}`);

          // Send SMS notifications via Twilio
          try {
            const creds = await loadTwilioCredentials(sbAdmin);
            const outboundNumber = Deno.env.get("TWILIO_OUTBOUND_NUMBER") || creds.sosNumber;

            for (const phone of notifiedPhones) {
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
              await fetch(twilioUrl, {
                method: "POST",
                headers: {
                  Authorization: `Basic ${twilioAuth(creds.accountSid, creds.authToken)}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  To: phone,
                  From: outboundNumber,
                  Body: `ICE Alarm update: The emergency alert for ${memberName} has been resolved. ${resolution_type === "ambulance_dispatched" ? "An ambulance was dispatched." : "The situation has been handled."} Thank you for your assistance.`,
                }),
              });
            }
          } catch (e) {
            console.error(`[${FN}] Error sending SMS notifications:`, e);
          }
        }
      }
    }

    // 7. Auto-schedule courtesy call for the next day (if not a false alarm)
    if (!is_false_alarm) {
      const { data: alertForCourtesy } = await sbAdmin
        .from("alerts")
        .select("member_id")
        .eq("id", alert_id)
        .maybeSingle();

      if (alertForCourtesy) {
        const { data: memberForCourtesy } = await sbAdmin
          .from("members")
          .select("id, first_name, last_name, phone")
          .eq("id", alertForCourtesy.member_id)
          .maybeSingle();

        if (memberForCourtesy) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0); // 10 AM next day

          const memberFullName = `${memberForCourtesy.first_name} ${memberForCourtesy.last_name}`;

          // Create courtesy call task for member
          await sbAdmin.from("tasks").insert({
            title: `Post-SOS courtesy call: ${memberFullName}`,
            description: `Follow-up call after SOS alert resolved on ${new Date().toLocaleDateString()}. Check how ${memberFullName} is feeling. Resolution: ${resolution_type || "other"}.`,
            task_type: "courtesy_call",
            due_date: tomorrow.toISOString(),
            member_id: alertForCourtesy.member_id,
            status: "pending",
          });

          // If ambulance was dispatched, also create a courtesy call to primary emergency contact
          if (resolution_type === "ambulance_dispatched") {
            const { data: primaryEC } = await sbAdmin
              .from("emergency_contacts")
              .select("id, contact_name, phone")
              .eq("member_id", alertForCourtesy.member_id)
              .order("priority_order")
              .limit(1)
              .maybeSingle();

            if (primaryEC) {
              await sbAdmin.from("tasks").insert({
                title: `Post-SOS contact call: ${primaryEC.contact_name} (re: ${memberFullName})`,
                description: `Follow-up call to ${primaryEC.contact_name} (${primaryEC.phone}) after ambulance was dispatched for ${memberFullName}. Check on member's status.`,
                task_type: "courtesy_call",
                due_date: tomorrow.toISOString(),
                member_id: alertForCourtesy.member_id,
                status: "pending",
              });
            }
          }

          console.log(`[${FN}] Courtesy call tasks created for ${memberFullName}`);
        }
      }
    }

    return new Response(JSON.stringify({ resolved: true, alert_id }), { headers: jh });
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jh },
    );
  }
});
