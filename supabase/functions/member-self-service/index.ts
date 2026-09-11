/**
 * member-self-service — server-side writes for the three member-portal
 * features that RLS (correctly) denies client-side. Same pattern as
 * complete-member-registration / partner-apply, since retired (#38/#51): strictly scoped
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
 * Added 2026-09-10:
 *  - save_home_location → the member confirms their own front door. `members`
 *                        DOES have a member UPDATE policy, so this one is not
 *                        here because RLS denies it — it is here because the
 *                        write has to be WHITELISTED and its PROVENANCE
 *                        STAMPED from a verified caller identity, and it has
 *                        to land an activity_logs row (staff-INSERT-only).
 *                        A member must not be able to record their guess as a
 *                        staff correction, backdate it, or attribute it to
 *                        somebody else. guard_member_home_location() on the
 *                        table enforces the same rule for any caller that
 *                        goes round this function.
 *
 * Every action requires an authenticated caller that resolves to a members
 * row (user_id match). Closed action set — anything else is refused.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

/**
 * EVERY member-editable column on `medical_information`. Sixteen, not eight.
 *
 * The eight that were missing — where the medication is kept and any notes about it, mobility,
 * hearing, sight, the medical centre, the private insurer and the policy number — meant the page
 * could not save them even once it started rendering them. A field a member can type into and
 * not save is worse than a field that is absent.
 *
 * DELIBERATELY NOT DERIVED. This runs on Deno and cannot import from `src/`, so the list is
 * written out — and `src/test/medicalInfoFields.test.ts` asserts it matches
 * `src/lib/medicalFields.ts` exactly, in both directions. Two lists that must agree, with a test
 * that fails when they do not, beats one list neither side can reach.
 *
 * `recorded_via` and `recorded_by_staff` stay OFF this list. They are provenance — how the
 * information was collected and by whom — and a member's own save must not be able to claim it
 * came in by phone from a staff member.
 */
const MEDICAL_FIELDS = [
  "medical_conditions",
  "medications",
  "meds_location",
  "meds_notes",
  "allergies",
  "mobility",
  "hearing_notes",
  "vision_notes",
  "doctor_name",
  "doctor_phone",
  "doctor_location",
  "hospital_preference",
  "blood_type",
  "private_insurer",
  "private_policy_number",
  "additional_notes",
] as const;

/** The `text[]` columns, validated as arrays rather than as strings. */
const MEDICAL_LIST_FIELDS = ["medical_conditions", "medications", "allergies"] as const;

/**
 * EVERY column a member's own home-location save may touch. Six, and not one more.
 *
 * The whitelist is the point. `.from("members").update({ ...body })` on a service-role client
 * is the shape of defect #297 fixed on submit-member-update: an interface named three fields
 * and the runtime accepted every column on the table. So the values written below are BUILT
 * here from validated primitives and the body is never spread.
 *
 * Three of the six are provenance and are stamped, never accepted from the caller:
 * `home_location_source` is narrowed to the two a member may legitimately claim,
 * `home_location_set_at` is this server's clock, and `home_location_set_by` is the id the
 * bearer token resolved to.
 */
const HOME_LOCATION_COLUMNS = [
  "home_lat",
  "home_lng",
  "home_location_accuracy_m",
  "home_location_source",
  "home_location_set_at",
  "home_location_set_by",
] as const;

/** The only two sources a member may claim. `staff_pin`, `geocoded` and `imported` are not theirs. */
const MEMBER_LOCATION_SOURCES = ["member_pin", "member_gps"] as const;

/**
 * The worst browser accuracy we will store as somebody's front door, in metres.
 *
 * DELIBERATELY DUPLICATED, like MEDICAL_FIELDS above and for the same reason: this runs on Deno
 * and cannot import from `src/`. `src/test/memberHomeLocationWrite.test.ts` asserts it equals
 * `MEMBER_GPS_MAX_ACCURACY_M` in `src/lib/homeLocation.ts`, and the CHECK constraint
 * `members_home_location_gps_accuracy` carries the same number in the database. Three copies
 * with a test that fails when they disagree beats one copy that two of the three cannot reach.
 */
const MEMBER_GPS_MAX_ACCURACY_M = 100;

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

      case "details_completed": {
        /*
          THE MEMBER HAS FILLED IN WHAT WE ASKED FOR — tell somebody.

          WHY THIS IS AN EVENT AND NOT JUST A SAVE. The point of chasing a member's details is
          that a record becomes usable in an emergency; the moment it does is worth a staff
          member knowing, because it is the moment a readiness queue entry can be cleared and a
          courtesy call can be made. Without it the writes land silently and the chase carries
          on — somebody rings a member who has already answered.

          NO CLIENT-SUPPLIED IDENTITY. The member id comes from `member` above, resolved from the
          caller's own `user_id`, so this cannot be used to emit an event about somebody else.
          The COUNT is client-supplied and is therefore treated as a hint for the message text
          only: it is clamped and never used to decide anything.
        */
        const filled = Number(body.filled);
        const remaining = Number(body.remaining);
        const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(99, Math.trunc(n))) : 0);
        const memberName =
          [member.first_name, member.last_name].filter(Boolean).join(" ") || "A member";

        const { error } = await admin.from("notification_log").insert({
          admin_user_id: null, // staff broadcast, like `notify_staff` below
          event_type: "member.details_completed",
          message:
            clamp(remaining) > 0
              ? `${memberName} filled in ${clamp(filled)} of their missing details — ${clamp(remaining)} still outstanding`
              : `${memberName} completed their details`,
          entity_type: "member",
          entity_id: member.id,
          status: "pending",
        });
        if (error) throw new Error(`notification insert failed: ${error.message}`);

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
            } else if ((MEDICAL_LIST_FIELDS as readonly string[]).includes(field)) {
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

      case "save_home_location": {
        /*
          THE MEMBER'S OWN FRONT DOOR, and the only route by which one is recorded as
          member-confirmed.

          NEVER STORED EXCEPT AT THIS MOMENT. There is no tracking here and no history table:
          one row, overwritten when the member presses Save, and nothing is written on any
          other request. The dialog asks the browser for a position only while it is open.
        */
        const lat = typeof body.lat === "number" ? body.lat : Number.NaN;
        const lng = typeof body.lng === "number" ? body.lng : Number.NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)
            || lat < -90 || lat > 90 || lng < -180 || lng > 180
            // 0,0 is a real place in the Gulf of Guinea and also what an uninitialised field
            // and a failed parse both look like. No member of a Spanish alarm service lives there.
            || (lat === 0 && lng === 0)) {
          return new Response(JSON.stringify({ error: "lat and lng must be a real coordinate" }), { status: 400, headers: jh });
        }

        const source = (MEMBER_LOCATION_SOURCES as readonly string[]).includes(body.source)
          ? (body.source as string)
          : null;
        if (!source) {
          return new Response(
            JSON.stringify({ error: `source must be one of ${MEMBER_LOCATION_SOURCES.join(", ")}` }),
            { status: 400, headers: jh },
          );
        }

        /*
          THE 100 m REFUSAL, SERVER-SIDE. The dialog refuses it too and says "please stand at
          your front door and try again" — but a rule that lives only in a dialog is a rule the
          next caller does not have. A wifi-grade fix of several hundred metres is a fix on the
          wrong street, and a confident pin on the wrong street is worse than no pin at all.

          A dragged pin (member_pin) has no accuracy figure and must not be given a fake one.
        */
        let accuracyM: number | null = null;
        if (source === "member_gps") {
          const reported = typeof body.accuracy_m === "number" ? body.accuracy_m : Number.NaN;
          if (!Number.isFinite(reported) || reported <= 0 || reported > MEMBER_GPS_MAX_ACCURACY_M) {
            return new Response(
              JSON.stringify({
                error: "accuracy_too_low",
                accuracy_m: Number.isFinite(reported) ? reported : null,
                max_accuracy_m: MEMBER_GPS_MAX_ACCURACY_M,
              }),
              { status: 400, headers: jh },
            );
          }
          accuracyM = reported;
        }

        // Read first, so the audit row can say whether this replaced an earlier pin. A member
        // moving their door 40 km is worth an operator noticing.
        const { data: before } = await admin
          .from("members")
          .select("home_location_source, home_location_set_at")
          .eq("id", member.id)
          .maybeSingle();

        const setAt = new Date().toISOString();
        // Built from validated primitives, key by key. The body is never spread.
        const values: Record<string, unknown> = {
          home_lat: lat,
          home_lng: lng,
          home_location_accuracy_m: accuracyM,
          home_location_source: source,
          home_location_set_at: setAt,
          home_location_set_by: user.id,
        };
        for (const key of Object.keys(values)) {
          if (!(HOME_LOCATION_COLUMNS as readonly string[]).includes(key)) {
            throw new Error(`refusing to write ${key}: not on the home-location whitelist`);
          }
        }

        const { error } = await admin.from("members").update(values).eq("id", member.id);
        if (error) throw new Error(`home location save failed: ${error.message}`);

        /*
          NO COORDINATES IN THE AUDIT ROW. Where a vulnerable person lives is on their member
          row, where RLS governs who may read it; copying it into activity_logs would put the
          same fact in a second table with a different audience and a different retention. What
          the audit trail needs is WHO set it, WHEN, HOW, and whether it replaced something —
          all of which is here. Members hold no INSERT on activity_logs, which is why this
          cannot be done client-side.
        */
        const { error: logError } = await admin.from("activity_logs").insert({
          user_id: user.id,
          entity_type: "member",
          entity_id: member.id,
          action: "home_location_set",
          details: {
            source,
            accuracy_m: accuracyM,
            set_at: setAt,
            replaced_source: before?.home_location_source ?? null,
            replaced_set_at: before?.home_location_set_at ?? null,
          },
        });
        // Loud, not silent: the save succeeded and the operator-facing record of it did not.
        if (logError) console.error("[member-self-service] home location audit insert failed:", logError.message);

        return new Response(
          JSON.stringify({ success: true, source, set_at: setAt, accuracy_m: accuracyM }),
          { status: 200, headers: jh },
        );
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
