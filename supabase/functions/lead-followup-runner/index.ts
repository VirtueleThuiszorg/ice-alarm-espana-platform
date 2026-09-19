import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { identifyNotifyCaller, STAFF_CALLER_ROLES } from "../_shared/admin-caller.ts";
import { followUpMessage, leadsToRemind } from "../_shared/lead-followup.ts";

const FN = "lead-followup-runner";
const DEFAULT_DAYS = 3;

/**
 * ONE BELL, TO THE PERSON WHO OWNS THE LEAD, WHEN IT HAS GONE QUIET.
 *
 * Run daily by pg_cron. The decision is in `_shared/lead-followup.ts`; this reads, writes and
 * reports.
 *
 * ── THE MARK IS SET IN THE SAME PASS, AND THAT IS THE POINT ─────────────────
 *
 * `followup_bell_sent_at` is what makes this once and not daily. It is cleared by the database
 * trigger the moment anybody actually contacts the lead, so the sequence is: quiet → one bell →
 * somebody writes to them → quiet again → one more bell. A daily reminder about the same lead is
 * a notification people learn to dismiss, and somebody who has learned to dismiss one bell
 * dismisses the next — including the one about a payment that failed.
 *
 * ── IT REPORTS WHAT IT DID, AND SAYS SO WHEN IT DID NOTHING ─────────────────
 *
 * "0 reminders" and "the runner did not run" look identical from outside, and the second one is
 * the failure that goes unnoticed for a month. The response distinguishes them.
 */
const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

  // pg_cron calls with the service-role key; a staff member may also run it by hand to see what
  // it would do. Both go through the same guard rather than this function having a second door.
  const caller = await identifyNotifyCaller(
    db,
    req.headers.get("Authorization"),
    serviceKey,
    STAFF_CALLER_ROLES,
  );
  if (!caller.ok) return json(caller.status, { error: caller.error });

  const { data: setting } = await db
    .from("system_settings").select("value").eq("key", "lead_followup_days").maybeSingle();
  const parsed = Number(setting?.value);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAYS;

  const { data: leads, error } = await db
    .from("leads")
    .select("id, status, do_not_contact, last_contacted_at, created_at, followup_bell_sent_at, assigned_to, first_name")
    .in("status", ["new", "contacted", "interested", "join_link_sent"])
    .is("followup_bell_sent_at", null)
    .not("assigned_to", "is", null)
    .limit(500);

  if (error) {
    console.error(`[${FN}] could not read leads:`, error.message);
    return json(500, { error: "Could not read the leads" });
  }

  const due = leadsToRemind(leads ?? [], days, new Date());
  if (due.length === 0) {
    return json(200, { ok: true, days, examined: leads?.length ?? 0, reminded: 0 });
  }

  // The staff rows, so a bell can be addressed to an auth user rather than a staff id.
  const { data: staffRows } = await db
    .from("staff")
    .select("id, user_id")
    .in("id", [...new Set(due.map((d) => d.staffId))]);
  const userIdOf = new Map((staffRows ?? []).map((s) => [s.id as string, s.user_id as string | null]));

  let reminded = 0;
  for (const item of due) {
    const userId = userIdOf.get(item.staffId);
    // A staff row with no auth user cannot be belled. The lead stays UNMARKED so it is picked up
    // again once that person has a login, rather than being silently skipped for ever.
    if (!userId) continue;

    const { error: bellErr } = await db.from("notification_log").insert({
      admin_user_id: userId,
      event_type: "message",
      entity_type: "lead",
      entity_id: item.leadId,
      message: followUpMessage(item.firstName, days),
      status: "pending",
    });
    if (bellErr) {
      console.error(`[${FN}] bell failed for lead ${item.leadId}:`, bellErr.message);
      continue;
    }

    /*
      MARKED ONLY AFTER THE BELL IS WRITTEN. The other order — mark, then bell — loses the
      reminder entirely if the insert fails, and the lead would never be considered again
      because the mark is only cleared by an actual contact.
    */
    const { error: markErr } = await db
      .from("leads")
      .update({ followup_bell_sent_at: new Date().toISOString() })
      .eq("id", item.leadId);
    if (markErr) {
      console.error(`[${FN}] could not mark lead ${item.leadId}:`, markErr.message);
    }
    reminded += 1;
  }

  console.log(`[${FN}] ${reminded} reminder(s) from ${leads?.length ?? 0} open leads, ${days}d`);
  return json(200, { ok: true, days, examined: leads?.length ?? 0, reminded });
};

serve(handler);
