import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface InboundEmailEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    in_reply_to?: string;
    references?: string;
  };
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

    // Parse webhook payload
    // Note: This is a simplified handler. Resend webhooks have a specific format.
    // For production, you'd validate the webhook signature.
    const event: InboundEmailEvent = await req.json();

    console.log("Inbound email webhook received:", event.type);

    if (event.type !== "email.received" && event.type !== "email.delivered") {
      // We're mainly interested in inbound emails
      return new Response(
        JSON.stringify({ success: true, message: "Event type ignored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailData = event.data;

    // Extract first recipient
    const toEmail = emailData.to?.[0] || "";
    
    // Try to find the original outbound email if this is a reply
    let originalEmailLogId: string | null = null;
    let moduleMatched: string | null = null;
    let linkedEntityId: string | null = null;
    let linkedEntityType: string | null = null;
    let isReply = false;

    // Check In-Reply-To header to link to original email
    if (emailData.in_reply_to || emailData.references) {
      const replyToId = emailData.in_reply_to || emailData.references?.split(" ")[0];
      
      if (replyToId) {
        // Look up original email by provider_message_id
        const { data: originalEmail } = await supabase
          .from("email_log")
          .select("id, module, related_entity_id, related_entity_type")
          .eq("provider_message_id", replyToId.replace(/[<>]/g, ""))
          .maybeSingle();

        if (originalEmail) {
          isReply = true;
          originalEmailLogId = originalEmail.id;
          moduleMatched = originalEmail.module;
          linkedEntityId = originalEmail.related_entity_id;
          linkedEntityType = originalEmail.related_entity_type;
          console.log("Linked to original email:", originalEmail.id);
        }
      }
    }

    // Also check custom headers from our outbound emails
    if (emailData.headers) {
      if (!moduleMatched && emailData.headers["X-ICE-Module"]) {
        moduleMatched = emailData.headers["X-ICE-Module"];
      }
      if (!linkedEntityId && emailData.headers["X-ICE-Entity-ID"]) {
        linkedEntityId = emailData.headers["X-ICE-Entity-ID"];
      }
      if (!linkedEntityType && emailData.headers["X-ICE-Entity-Type"]) {
        linkedEntityType = emailData.headers["X-ICE-Entity-Type"];
      }
    }

    // Create snippet from text content (first 500 chars)
    const bodySnippet = emailData.text?.substring(0, 500) || 
                        emailData.html?.replace(/<[^>]*>/g, "").substring(0, 500) || 
                        null;

    // Store in inbound_email_log
    const { data: inboundLog, error: insertError } = await supabase
      .from("inbound_email_log")
      .insert({
        from_email: emailData.from,
        to_email: toEmail,
        subject: emailData.subject,
        body_snippet: bodySnippet,
        body_html: emailData.html,
        provider_message_id: emailData.email_id,
        provider_thread_id: emailData.references?.split(" ")[0] || null,
        received_at: event.created_at || new Date().toISOString(),
        module_matched: moduleMatched,
        linked_entity_id: linkedEntityId,
        linked_entity_type: linkedEntityType,
        is_reply: isReply,
        original_email_log_id: originalEmailLogId,
        processed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting inbound email log:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Inbound email logged:", inboundLog?.id);

    // If this is a reply to an outreach email, we could trigger additional actions
    // For example, update the outreach lead status
    if (moduleMatched === "outreach" && linkedEntityId) {
      // Mark lead as having responded
      await supabase
        .from("outreach_raw_leads")
        .update({ 
          status: "replied",
          updated_at: new Date().toISOString(),
        })
        .eq("id", linkedEntityId);

      console.log("Updated outreach lead status to replied:", linkedEntityId);
    }

    return new Response(
      JSON.stringify({ success: true, inbound_id: inboundLog?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in email-inbound-webhook:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
