import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";
/*
  THE WHOLE RUN IS IN `_shared/billing-migration-run.ts`, and that is not tidying.

  This file calls `serve()` at import time, so nothing inside it could be RUN — every assertion
  about the runner was a source scan. That is how three defects got in and stayed in: a sweep
  that was dead code, a renewal date that was never rolled forward, and a planner that refused
  the very members the ladder was for. Each written, each read, none executed.

  What is left here is who is allowed to call it, and `serve()`.
*/
import { runBillingMigration } from "../_shared/billing-migration-run.ts";

/**
 * THE DAILY WAKE-UP that paces the legacy→Stripe migration.
 *
 * 431 members move over months, each on the day Santander takes their money. pg_cron calls this
 * once a day; it asks `_shared/billing-migration-runner.ts` who is due, and does what it says.
 *
 * ── WHAT MAKES "JUST RUN IT AGAIN" A SAFE INSTRUCTION ─────────────────────────
 *
 * Every send is written to `notification_log` FIRST, carrying a dedupe key naming the member,
 * the renewal and the kind, against a unique index. `ON CONFLICT DO NOTHING` returns no row when
 * that send already happened, and the runner skips it. So a re-run, an overlapping run, and a
 * crash halfway through 431 members all resolve to the same outcome — and nobody gets a second
 * text about money that reads as though the first one failed.
 *
 * THE LOG ROW IS WRITTEN BEFORE THE SEND, DELIBERATELY. If the Stripe call then fails, the
 * member has a log row and no link: a gap somebody can see and fix. The other order — send, then
 * record — loses the record when the process dies between them, and the next run sends again.
 * On this cohort, "we might text them twice" is the worse of the two failures, and the one the
 * dedupe key exists to make impossible.
 *
 * ── AND IT REFUSES ITSELF ─────────────────────────────────────────────────────
 *
 * `billing_migration_enabled` seeds as `false`. The cron schedule exists from the day the
 * migration lands; the function reads the switch and does nothing until somebody decides.
 * A dry run plans the whole day and sends none of it, which is what the settings screen's
 * preview shows — the SAME computation, not a second description of it.
 *
 * ── TWO SWEEPS RUN WHETHER OR NOT ANYTHING IS BEING SENT ─────────────────────
 *
 * The switch above governs WRITING TO MEMBERS. It does not govern bookkeeping, and conflating
 * the two would strand people:
 *
 *   EXPIRING A LAPSED LINK. A member left in `switch_pending` is excluded from the Santander
 *   export — so if the migration is paused with links outstanding, and the expiry waited on the
 *   switch, those members would be collected from by NOBODY for as long as the pause lasted.
 *   The expiry is a safety sweep, not part of the migration.
 *
 *   ROLLING A PASSED RENEWAL FORWARD. `legacy_next_renewal` is one date, not a schedule, and
 *   every reader treats a past one as "nothing due" — the runner skips the member forever, the
 *   CSV blanks their collection date, and the dashboard's "due this month" empties. Santander
 *   collects again next month regardless, so the record has to say so.
 *
 * A DRY RUN WRITES NEITHER. It reports what both sweeps would do and touches nothing, because
 * an admin pressing "preview" has not decided anything yet.
 */

type Json = Record<string, unknown>;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (status: number, payload: Json) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    /*
      WHO MAY RUN IT. The cron job carries the service role key; an admin pressing "preview" on
      the settings screen carries their own session and may only DRY RUN. A preview cannot send
      anything, so there is nothing to gate beyond being staff — and the real run is reachable
      only by something holding the service key.
    */
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isCron = serviceKey.length > 0 && bearer === serviceKey;

    /*
      THE DRY-RUN FLAG IS IN THE BODY, not the query string, and that is not a style choice: the
      wiring register's scanner reads `functions.invoke("name")` and a literal carrying `?dryRun=1`
      does not match it — so the control would have been a wire the register could not see, which
      is the whole failure WIRING_REGISTER.md exists to prevent.
    */
    const payload = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
    const askedForDryRun = payload?.dryRun === true;

    if (!isCron) {
      const { data: userData } = await admin.auth.getUser(bearer);
      if (!userData?.user) return json(401, { error: "Unauthorized" });
      const { data: staff } = await admin
        .from("staff")
        .select("id, role")
        .eq("user_id", userData.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!staff) return json(403, { error: "Staff access required" });
      if (!askedForDryRun) {
        // A person pressing a button must not start the run for 431 people; the schedule does
        // that, on a day nobody has to remember.
        return json(403, {
          error: "Only the scheduled runner may send. Add ?dryRun=1 to preview today's list.",
          code: "PREVIEW_ONLY",
        });
      }
    }

    const outcome = await runBillingMigration(admin, askedForDryRun, {
      sendSwitchLink: (memberId) => sendSwitchLink(admin, memberId, serviceKey),
    });
    return json(outcome.error ? 500 : 200, outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("billing-migration-run error:", message);
    // The run itself failing is exactly the silence this bell exists for.
    /* The bell for a failed run is rung inside `runBillingMigration`; this catch is the last
       line — an auth failure, a malformed body, or a throw the module could not handle. */
    return json(500, { error: message });
  }
});

/**
 * Ask `send-payment-link` for this member's switch link — the same builder staff use.
 *
 * NOT A SECOND IMPLEMENTATION. That function holds the pricing, the synced Stripe Price ids, the
 * stale-price refusal, the pending order rows, `start_legacy_switch`, the delivery decisions and
 * the audit row. A copy here would drift from it within a month, and the drift would be about
 * money.
 */
async function sendSwitchLink(
  admin: ReturnType<typeof createClient>,
  memberId: string,
  serviceKey: string,
): Promise<void> {
  const { data, error } = await admin.functions.invoke("send-payment-link", {
    body: { mode: "legacy_switch", memberId },
    headers: { Authorization: `Bearer ${serviceKey}` },
  });
  if (error) throw new Error(error.message ?? "send-payment-link failed");
  if (!data?.url) throw new Error(data?.error ?? "no link returned");
}
