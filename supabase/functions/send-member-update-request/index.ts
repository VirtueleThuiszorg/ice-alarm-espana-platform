import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { planChannels, type DeliveryOutcome } from "../_shared/delivery.ts";
import {
  buildUpdateLink,
  memberUpdateEmail,
  memberUpdateSms,
  updateLanguage,
  updateTokenExpiry,
} from "../_shared/member-update-request.ts";

const FN = "send-member-update-request";

interface RequestPayload {
  memberId: string;
  /** Who staff chose to write to — the member, or one of their contacts. */
  recipientEmail?: string | null;
  requestedFields: string[];
  memberName?: string;
  preferredLanguage?: string;
}

interface DeliveryReport {
  channel: string;
  to: string | null;
  outcome: DeliveryOutcome;
  detail?: string;
}

/**
 * WHAT THIS RETURNS IS THE LINK. Delivery is reported beside it, never instead of it.
 *
 * Before: a failed email threw, so the staff member was told the request had failed while an
 * unexpired token sat in the table — and on success the URL was never returned at all, so
 * there was nothing to read out to a member who does not use email. Both are the same mistake:
 * treating the transport as the outcome.
 */
const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const { data: staffData } = await admin
      .from("staff")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!staffData) return json(403, { error: "Not authorized - staff only" });

    const payload: RequestPayload = await req.json();
    const { memberId, requestedFields } = payload;

    if (!memberId) return json(400, { error: "Missing memberId" });
    if (!Array.isArray(requestedFields) || requestedFields.length === 0) {
      // A token that asks for nothing produces a page with no fields on it.
      return json(400, { error: "No fields requested" });
    }

    /*
      THE MEMBER'S OWN DETAILS ARE READ HERE, not taken from the payload.

      The phone number the SMS goes to decides who receives a link that writes to this member's
      record. A client-supplied number would make that a client-writable destination, which is
      golden rule 3's reasoning applied to delivery. The EMAIL may still be chosen by staff —
      picking a daughter's address is the point of that control — but it is only ever used as
      an address, never as authority.
    */
    const { data: member } = await admin
      .from("members")
      .select("first_name, last_name, email, phone, preferred_language")
      .eq("id", memberId)
      .maybeSingle();

    if (!member) return json(404, { error: "Member not found" });

    const memberName =
      payload.memberName?.trim() || `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();
    const language = updateLanguage(payload.preferredLanguage ?? member.preferred_language);
    const recipientEmail = payload.recipientEmail?.trim() || member.email || null;

    // Generate secure token (32 bytes = 64 hex characters)
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expiresAt = updateTokenExpiry(new Date());

    const { error: insertError } = await admin.from("member_update_tokens").insert({
      member_id: memberId,
      token,
      requested_fields: requestedFields,
      expires_at: expiresAt.toISOString(),
      created_by: staffData.id,
    });

    // THIS is the failure that fails the request: with no token there is no link, and there is
    // nothing for a staff member to do with the answer.
    if (insertError) {
      console.error(
        JSON.stringify({ fn: FN, event: "token_insert_failed", error: insertError.message }),
      );
      return json(500, { error: "Failed to create update link" });
    }

    const baseUrl = Deno.env.get("SITE_URL") || "https://icealarm.es";
    const updateLink = buildUpdateLink(baseUrl, token);
    const message = { memberName, url: updateLink, language };

    const [{ data: smsFlag }, { data: emailProvider }] = await Promise.all([
      admin.from("system_settings").select("value").eq("key", "notify_channel_sms").maybeSingle(),
      admin
        .from("system_settings")
        .select("value")
        .eq("key", "settings_email_provider")
        .maybeSingle(),
    ]);

    const decisions = planChannels({
      smsChannelOn: smsFlag?.value === "true",
      emailConfigured: Boolean(emailProvider?.value),
      phone: member.phone,
      email: recipientEmail,
    });

    const delivery: DeliveryReport[] = [];
    for (const decision of decisions) {
      if (!decision.attempt) {
        delivery.push({ channel: decision.channel, to: decision.to, outcome: decision.outcome! });
        continue;
      }

      if (decision.channel === "sms") {
        try {
          const { error } = await admin.functions.invoke("twilio-sms", {
            body: { to: decision.to, message: memberUpdateSms(message), recipientType: "member" },
            headers: { Authorization: authHeader },
          });
          delivery.push({
            channel: "sms",
            to: decision.to,
            outcome: error ? "failed" : "sent",
            detail: error?.message,
          });
        } catch (e) {
          delivery.push({
            channel: "sms",
            to: decision.to,
            outcome: "failed",
            detail: e instanceof Error ? e.message : "unknown",
          });
        }
        continue;
      }

      const mail = memberUpdateEmail(message);
      const result = await sendEmail(decision.to!, mail.subject, mail.html);
      delivery.push({
        channel: "email",
        to: decision.to,
        outcome: result.success ? "sent" : "failed",
        detail: result.error,
      });
    }

    // What was asked for AND what actually left the building. A row saying "a request was sent"
    // without saying whether it reached anybody is the shape of failure this whole change is
    // about.
    await admin.from("activity_logs").insert({
      entity_type: "member",
      entity_id: memberId,
      action: "member_update_request_sent",
      staff_id: staffData.id,
      new_values: {
        requested_fields: requestedFields,
        expires_at: expiresAt.toISOString(),
        delivery,
      },
    });

    // No address, no name, no token in the log line — the outcomes are what an operator needs
    // and the rest is PII in a place nobody controls the retention of.
    console.log(
      JSON.stringify({
        fn: FN,
        event: "update_request_created",
        member_id: memberId,
        fields: requestedFields.length,
        delivery: delivery.map((d) => `${d.channel}:${d.outcome}`),
      }),
    );

    return json(200, {
      success: true,
      updateLink,
      expiresAt: expiresAt.toISOString(),
      requestedFields,
      delivery,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        fn: FN,
        event: "unhandled_error",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return json(500, { error: error instanceof Error ? error.message : "Internal server error" });
  }
};

serve(handler);
