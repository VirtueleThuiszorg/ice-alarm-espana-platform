import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { identifyNotifyCaller, STAFF_CALLER_ROLES } from "../_shared/admin-caller.ts";
import { decideStaffLead, duplicateKeys } from "../_shared/staff-lead.ts";

const FN = "staff-lead";

/**
 * ADDING A LEAD BY HAND — the one door, the same rules as the public form.
 *
 * Most of the people this product is for did not find the website. They met somebody at a
 * market stall, rang the office because a neighbour mentioned us, or were introduced by their
 * daughter. Until now there was nowhere to put them.
 *
 * ── WHY THIS IS A FUNCTION AND NOT AN INSERT FROM THE DIALOG ────────────────
 *
 * Three things have to be true of the row, and not one of them can be trusted to the browser:
 *
 *   `source = 'staff_manual'` and `created_by` — provenance. A row that can choose its own
 *   source can claim to be a contact-form enquiry, and the reports that count where members
 *   come from are then counting whatever the client said.
 *
 *   THE DUPLICATE CHECK reads `members`, which the operator's own token cannot read in full.
 *   Doing it client-side would either mean widening what a call-centre operator may read about
 *   every member, or not doing it — and not doing it means ringing an existing customer to
 *   introduce them to a product they already pay for.
 *
 *   THE PARTNER CODE decides whether somebody is owed €50. It is validated against `partners`
 *   here, so a typo is refused rather than stored and quietly never paid.
 *
 * The DECISION is in `_shared/staff-lead.ts` and unit-tested; this does the I/O.
 */
const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

  // Any ACTIVE staff member, not only an admin: adding a lead is ordinary call-centre work, and
  // requiring admin would mean the four people who speak to these customers could not use it.
  const caller = await identifyNotifyCaller(
    db,
    req.headers.get("Authorization"),
    serviceKey,
    STAFF_CALLER_ROLES,
  );
  if (!caller.ok) return json(caller.status, { error: caller.error, fields: [] });

  let payload: { fields?: Record<string, unknown>; consent?: boolean; partnerCode?: string | null };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid request", fields: [] });
  }

  const decision = decideStaffLead({
    fields: payload.fields ?? {},
    consent: payload.consent,
    partnerCode: payload.partnerCode,
  });
  if (!decision.ok) {
    return json(decision.status, {
      error: decision.reason === "consent_required"
        ? "The person must have agreed to be contacted"
        : "Invalid submission",
      reason: decision.reason,
      fields: decision.fields,
    });
  }

  const { values, partnerCode } = decision;
  const keys = duplicateKeys(values);

  /*
    ── THE DUPLICATE CHECK, AND WHY IT REFUSES RATHER THAN WARNS ─────────────

    A second record for somebody who is already a member is not a tidiness problem. It is two
    operators working the same person, a partner commission attached to the wrong row, and — the
    one that actually costs — a member being rung and introduced to the product they already pay
    for, by a company whose entire promise is that it knows who they are.

    So it refuses, and RETURNS THE EXISTING RECORD so the operator has somewhere to go. A refusal
    with no link is a dead end that gets worked around by typing the number in differently.

    MEMBERS FIRST: "they are already a member" is a more useful sentence than "there is already
    a lead", and when both are true the member is the one the operator needs.
  */
  const dupFilters: string[] = [];
  if (keys.phone) dupFilters.push(`phone.eq.${keys.phone}`);
  if (keys.email) dupFilters.push(`email.eq.${keys.email}`);

  if (dupFilters.length > 0) {
    const { data: member, error: memberErr } = await db
      .from("members")
      .select("id, first_name, last_name")
      .or(dupFilters.join(","))
      .limit(1)
      .maybeSingle();
    if (memberErr) {
      console.error(`[${FN}] member duplicate lookup failed:`, memberErr.message);
      return json(500, { error: "Could not check for an existing record", fields: [] });
    }
    if (member) {
      return json(409, {
        error: "This person is already a member",
        reason: "duplicate_member",
        fields: [],
        existing: { kind: "member", id: member.id, name: `${member.first_name} ${member.last_name}`.trim() },
      });
    }

    const { data: lead, error: leadErr } = await db
      .from("leads")
      .select("id, first_name, last_name, status, assigned_to")
      .or(dupFilters.join(","))
      .limit(1)
      .maybeSingle();
    if (leadErr) {
      console.error(`[${FN}] lead duplicate lookup failed:`, leadErr.message);
      return json(500, { error: "Could not check for an existing record", fields: [] });
    }
    if (lead) {
      return json(409, {
        error: "There is already a lead for this person",
        reason: "duplicate_lead",
        fields: [],
        existing: { kind: "lead", id: lead.id, name: `${lead.first_name} ${lead.last_name}`.trim(), status: lead.status },
      });
    }
  }

  /*
    THE PARTNER CODE IS RESOLVED, NOT STORED AS TYPED. `leads.ref_partner_id` is a foreign key;
    keeping the string instead would mean the commission path has to re-resolve it later, at
    which point a partner who has since changed their code is unfindable.

    There is no alias table in this schema — checked, not assumed — so the lookup is against
    `partners.referral_code` alone. An inactive partner's code is refused: attributing a lead to
    a partner who has left is worse than refusing the code, because it is invisible.
  */
  let refPartnerId: string | null = null;
  if (partnerCode) {
    const { data: partner } = await db
      .from("partners")
      .select("id")
      .eq("referral_code", partnerCode)
      .eq("status", "active")
      .maybeSingle();
    if (!partner) {
      return json(400, {
        error: "That partner code does not match an active partner",
        reason: "unknown_partner_code",
        fields: ["partner_code"],
      });
    }
    refPartnerId = partner.id;
  }

  // The operator's own staff row: who typed it in, and who works it until somebody reassigns it.
  const { data: staffRow } = await db
    .from("staff")
    .select("id")
    .eq("user_id", caller.userId)
    .maybeSingle();
  const staffId = staffRow?.id ?? null;

  const { data: inserted, error } = await db
    .from("leads")
    .insert({
      first_name: values.first_name,
      // NOT NULL on this table with no default, and the dialog does not insist on a surname.
      last_name: values.last_name ?? "",
      email: values.email ?? "",
      phone: values.phone,
      preferred_language: values.preferred_language ?? "en",
      enquiry_type: values.enquiry_type ?? "general",
      message: values.notes ?? null,
      heard_about: values.heard_about,
      // Chosen here, never read from the caller.
      source: "staff_manual",
      status: "new",
      created_by: staffId,
      // The person who took the call is the person who should follow it up, until somebody
      // decides otherwise. A lead that lands in a shared pile is a lead nobody rings.
      assigned_to: staffId,
      contact_consent_at: new Date().toISOString(),
      consent_source: values.heard_about,
      ref_partner_id: refPartnerId,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`[${FN}] insert failed:`, error.message);
    return json(500, { error: "Could not save this lead", fields: [] });
  }

  return json(200, { ok: true, id: inserted.id });
};

serve(handler);
