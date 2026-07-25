/**
 * member-self-service — server-side writes for the three member-portal
 * features that RLS (correctly) denies client-side. Same pattern as
 * complete-member-registration / partner-apply (#38/#51): strictly scoped
 * service-role routing, ZERO policy changes.
 *
 * Broken features this fixes (2026-07-24 night audit):
 *  - submit_feedback   → activity_logs INSERT is staff-only, so every member
 *                        NPS/feedback submission failed.
 *  - notify_staff      → notification_log INSERT is service/staff-only, so
 *                        staff were never notified of new member messages.
 *  - save_medical_info → medical_information has member UPDATE but NO member
 *                        INSERT policy, so a member's FIRST medical-info save
 *                        always failed (PHI feature dead for new members).
 *
 * Every action requires an authenticated caller that resolves to a members
 * row (user_id match). Closed action set — anything else is refused.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const MEDICAL_FIELDS = [
  "blood_type",
  "doctor_name",
  "doctor_phone",
  "hospital_preference",
  "additional_notes",
  "medical_conditions",
  "medications",
  "allergies",
] as const;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jh });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jh });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: jh });
    }
    const user = userData.user;

    if (!checkRateLimit(`member-self-service:${user.id}`, 30, 60_000).allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: jh });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Every action is scoped to the caller's OWN member row.
    const { data: member } = await admin
      .from("members")
      .select("id, first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) {
      return new Response(JSON.stringify({ error: "No membership for this account" }), { status: 403, headers: jh });
    }

    const body = await req.json().catch(() => ({}));

    switch (body.action) {
      case "submit_feedback": {
        const rating = Number(body.rating);
        if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
          return new Response(JSON.stringify({ error: "rating must be an integer 0-10" }), { status: 400, headers: jh });
        }
        const comment = typeof body.comment === "string" ? body.comment.slice(0, 2000) : null;
        const category = typeof body.category === "string" ? body.category.slice(0, 50) : "general";
        const { error } = await admin.from("activity_logs").insert({
          user_id: user.id,
          entity_type: "feedback",
          entity_id: member.id,
          action: "feedback_submitted",
          details: {
            rating,
            comment,
            category,
            nps_category: rating >= 9 ? "promoter" : rating >= 7 ? "passive" : "detractor",
            submitted_at: new Date().toISOString(),
          },
        });
        if (error) throw new Error(`feedback insert failed: ${error.message}`);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: jh });
      }

      case "notify_staff": {
        // Broadcast a staff notification about the caller's OWN conversation.
        const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
        const kind = body.kind === "reply" ? "reply" : "new";
        const subject = (typeof body.subject === "string" ? body.subject : "").slice(0, 200);
        if (!conversationId) {
          return new Response(JSON.stringify({ error: "conversation_id is required" }), { status: 400, headers: jh });
        }
        // The conversation must belong to the caller — never let a member
        // emit notifications about someone else's thread.
        const { data: conv } = await admin
          .from("conversations")
          .select("id, member_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv || conv.member_id !== member.id) {
          return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers: jh });
        }
        const memberName = [member.first_name, member.last_name].filter(Boolean).join(" ") || "Member";
        const { error } = await admin.from("notification_log").insert({
          admin_user_id: null, // staff broadcast
          event_type: "message",
          message:
            kind === "reply"
              ? `${memberName} replied in: ${subject}`
              : `New message from ${memberName}: ${subject}`,
          entity_type: "conversation",
          entity_id: conversationId,
          status: "pending",
        });
        if (error) throw new Error(`notification insert failed: ${error.message}`);
        // Members have no UPDATE policy on conversations (by design), so the
        // recency bump that keeps the staff inbox sorted happens here.
        const { error: bumpError } = await admin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);
        if (bumpError) console.error("[member-self-service] recency bump failed:", bumpError.message);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: jh });
      }

      case "mark_read": {
        // Members have no UPDATE policy on messages (by design) — marking
        // staff messages read in the caller's OWN conversation happens here.
        const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
        if (!conversationId) {
          return new Response(JSON.stringify({ error: "conversation_id is required" }), { status: 400, headers: jh });
        }
        const { data: conv } = await admin
          .from("conversations")
          .select("id, member_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv || conv.member_id !== member.id) {
          return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers: jh });
        }
        const { error } = await admin
          .from("messages")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("sender_type", "staff")
          .eq("is_read", false);
        if (error) throw new Error(`mark read failed: ${error.message}`);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: jh });
      }

      case "save_medical_info": {
        // Whitelisted upsert on the caller's own medical_information row.
        // RLS deliberately has no member INSERT policy — first-time saves
        // happen HERE, identity-scoped, never client-side.
        const values: Record<string, unknown> = {};
        for (const field of MEDICAL_FIELDS) {
          if (field in body) {
            const v = body[field];
            if (v === null) {
              values[field] = null;
            } else if (["medical_conditions", "medications", "allergies"].includes(field)) {
              if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x.length > 500) || v.length > 100) {
                return new Response(JSON.stringify({ error: `${field} must be an array of strings` }), { status: 400, headers: jh });
              }
              values[field] = v;
            } else {
              if (typeof v !== "string" || v.length > 2000) {
                return new Response(JSON.stringify({ error: `${field} must be a string` }), { status: 400, headers: jh });
              }
              values[field] = v;
            }
          }
        }
        if (Object.keys(values).length === 0) {
          return new Response(JSON.stringify({ error: "No medical fields provided" }), { status: 400, headers: jh });
        }
        const { data: existing } = await admin
          .from("medical_information")
          .select("id")
          .eq("member_id", member.id)
          .maybeSingle();
        const write = existing
          ? admin.from("medical_information").update(values).eq("member_id", member.id)
          : admin.from("medical_information").insert({ member_id: member.id, ...values });
        const { error } = await write;
        if (error) throw new Error(`medical info save failed: ${error.message}`);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: jh });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: jh });
    }
  } catch (error) {
    console.error("[member-self-service] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: jh },
    );
  }
});
