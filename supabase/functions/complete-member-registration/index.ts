/**
 * Complete Member Registration — links an authenticated user to their EXISTING
 * member record (created server-side by the paid join flow) and updates their
 * profile. Fixes the production RLS failure where /complete-registration tried
 * a DIRECT client-side INSERT into members, which Row-Level Security correctly
 * denies (members INSERT is staff/service-role only — golden rule #4: members
 * are created by the payment flow, never by client code).
 *
 * POST { profile: { first_name, last_name, phone, ... } }
 * Auth: Bearer token (authenticated user with a CONFIRMED email).
 *
 * Flow (service-role, but strictly scoped):
 * 1. The caller's email must be confirmed — linking is by email match, so an
 *    unconfirmed email must never claim a member row (account-takeover guard).
 * 2. Find the members row whose email equals the caller's verified email:
 *    - already linked to THIS user  → idempotent: update profile, done
 *    - user_id IS NULL              → link it (set user_id) + update profile
 *    - linked to a DIFFERENT user   → 409, never re-link
 *    - no row                       → { no_membership: true } — the client
 *      sends them to /join. This function NEVER creates a member row:
 *      membership comes from the paid join flow only (golden rule #4).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FN = "complete-member-registration";

// Profile fields the form may update — nothing else is written.
const PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "date_of_birth",
  "nie_dni",
  "address_line_1",
  "address_line_2",
  "city",
  "province",
  "postal_code",
  "preferred_language",
  "special_instructions",
] as const;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const jh = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jh });
  }

  try {
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jh });
    }

    // Account-takeover guard: linking is by email match, so the email MUST be verified.
    if (!user.email_confirmed_at && !user.confirmed_at) {
      return new Response(
        JSON.stringify({ error: "Email not confirmed", email_not_confirmed: true }),
        { status: 403, headers: jh },
      );
    }

    const body = await req.json().catch(() => ({}));
    const profileInput = (body?.profile ?? {}) as Record<string, unknown>;
    const profileUpdates: Record<string, unknown> = {};
    for (const field of PROFILE_FIELDS) {
      if (field in profileInput && profileInput[field] !== undefined) {
        const v = profileInput[field];
        profileUpdates[field] = typeof v === "string" && v.trim() === "" ? null : v;
      }
    }

    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Case-insensitive exact email match (ilike without wildcards).
    const { data: member, error: findError } = await sbAdmin
      .from("members")
      .select("id, user_id, email")
      .ilike("email", user.email)
      .maybeSingle();

    if (findError) {
      console.error(`[${FN}] member lookup failed:`, findError);
      return new Response(JSON.stringify({ error: "Lookup failed" }), { status: 500, headers: jh });
    }

    if (!member) {
      // No membership for this email — the paid join flow is the only way to
      // become a member. Client redirects to /join.
      return new Response(JSON.stringify({ no_membership: true }), { headers: jh });
    }

    if (member.user_id && member.user_id !== user.id) {
      console.error(`[${FN}] email ${user.email} already linked to a different auth user`);
      return new Response(
        JSON.stringify({ error: "This membership is already linked to another account" }),
        { status: 409, headers: jh },
      );
    }

    // Link (if needed) + profile update, scoped to this exact member row.
    const { error: updateError } = await sbAdmin
      .from("members")
      .update({ ...profileUpdates, user_id: user.id })
      .eq("id", member.id);

    if (updateError) {
      console.error(`[${FN}] link/update failed:`, updateError);
      return new Response(JSON.stringify({ error: "Failed to complete registration" }), { status: 500, headers: jh });
    }

    console.log(`[${FN}] member ${member.id} linked to auth user (was ${member.user_id ? "already linked" : "unlinked"})`);
    return new Response(JSON.stringify({ linked: true, member_id: member.id }), { headers: jh });
  } catch (error) {
    console.error(`[${FN}] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jh },
    );
  }
});
