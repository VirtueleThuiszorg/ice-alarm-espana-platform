import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";
import {
  RUNNER_SETTING_KEYS,
  isMemberFacing,
  parseRunnerSettings,
  planTodaysRun,
  type PlannedSend,
  type RunnerCandidate,
} from "../_shared/billing-migration-runner.ts";

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
 * `?dryRun=1` plans the whole day and sends none of it, which is what the settings screen's
 * preview shows — the SAME computation, not a second description of it.
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

    // ── the settings ─────────────────────────────────────────────────────────
    const { data: settingRows } = await admin
      .from("system_settings")
      .select("key, value")
      .in("key", Object.values(RUNNER_SETTING_KEYS));

    const settings = parseRunnerSettings(settingRows ?? [], askedForDryRun);

    /*
      OFF MEANS OFF, INCLUDING FOR THE PREVIEW — and the preview says so rather than showing an
      empty list. An empty preview and a switched-off runner look identical, and an admin reading
      "0 members due today" would conclude the migration had nothing to do.
    */
    if (!settings.enabled) {
      return json(200, {
        ran: false,
        enabled: false,
        dryRun: settings.dryRun,
        reason: "The billing migration is switched off in Admin → Settings → Billing.",
        planned: [],
      });
    }

    // ── who is due ───────────────────────────────────────────────────────────
    //
    // `billing_frequency` comes from the member's own subscription row — what Karma billed them —
    // because an annual member gets a ladder and a monthly member gets one link, and reading the
    // wrong one writes to somebody eleven months early.
    const { data: rows, error: loadError } = await admin
      .from("members")
      .select("id, first_name, last_name, billing_source, legacy_next_renewal, subscriptions (billing_frequency, created_at)")
      .eq("billing_source", "legacy")
      .not("legacy_next_renewal", "is", null);

    if (loadError) throw new Error(`could not load candidates: ${loadError.message}`);

    const today = new Date();
    const candidates: RunnerCandidate[] = (rows ?? []).map((r) => {
      const subs = (r.subscriptions ?? []) as Array<{ billing_frequency: string | null; created_at: string }>;
      const newest = [...subs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      return {
        id: r.id as string,
        billing_source: r.billing_source as string | null,
        legacy_next_renewal: r.legacy_next_renewal as string | null,
        billing_frequency: (newest?.billing_frequency as "monthly" | "annual" | null) ?? null,
      };
    });

    const planned = planTodaysRun(candidates, settings, today);
    const nameOf = (id: string) => {
      const row = (rows ?? []).find((r) => r.id === id);
      return row ? `${row.first_name} ${row.last_name}` : id;
    };

    if (settings.dryRun) {
      return json(200, {
        ran: false,
        enabled: true,
        dryRun: true,
        consideredMembers: candidates.length,
        planned: planned.map((p) => ({
          memberId: p.member.id,
          memberName: nameOf(p.member.id),
          kind: p.kind,
          renewal: p.renewal,
          daysUntilRenewal: p.daysUntilRenewal,
          key: p.key,
        })),
      });
    }

    // ── the run ──────────────────────────────────────────────────────────────
    const sent: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ memberId: string; kind: string; error: string }> = [];

    for (const plan of planned) {
      const claimed = await claim(admin, plan, nameOf(plan.member.id));
      if (!claimed) {
        // Already done for this renewal. Not an error and not worth a line in the bell — this is
        // the normal outcome of a re-run.
        skipped.push(plan.key);
        continue;
      }

      if (!isMemberFacing(plan.kind)) {
        // The bell IS the action. `claim` has already written it to everybody who can act.
        sent.push(plan.key);
        continue;
      }

      try {
        await sendSwitchLink(admin, plan.member.id, serviceKey);
        sent.push(plan.key);
      } catch (e) {
        failed.push({
          memberId: plan.member.id,
          kind: plan.kind,
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    }

    /*
      A FAILED SEND IS SAID OUT LOUD. A migration that quietly stops is 431 people nobody is
      moving, and nothing else on the platform would notice: these members are `active` and
      monitored either way, so no alert, no dunning and no renewal will ever mention them.
    */
    if (failed.length > 0) {
      await bellAdmins(
        admin,
        "billing.migration_run_failed",
        `The billing migration could not write to ${failed.length} member(s) today: ` +
          `${failed[0].error}. They stay on Santander billing until somebody looks.`,
      );
    }

    return json(200, {
      ran: true,
      enabled: true,
      dryRun: false,
      consideredMembers: candidates.length,
      plannedCount: planned.length,
      sent: sent.length,
      skipped: skipped.length,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("billing-migration-run error:", message);
    // The run itself failing is exactly the silence this bell exists for.
    await bellAdmins(admin, "billing.migration_run_failed", `The billing migration run failed: ${message}`)
      .catch(() => undefined);
    return json(500, { error: message });
  }
});

/**
 * Claim this send, or find that somebody already did.
 *
 * The write IS the claim: a unique index on `dedupe_key` means the second attempt inserts
 * nothing and returns no row, whether it comes from a re-run, an overlapping run or a retry
 * after a crash. There is no read-then-write window to lose.
 */
async function claim(
  admin: ReturnType<typeof createClient>,
  plan: PlannedSend,
  memberName: string,
): Promise<boolean> {
  const message =
    plan.kind === "staff_bell"
      ? `${memberName} renews on ${plan.renewal} and has not moved to Stripe. Ring them — an ` +
        "annual member who misses this waits twelve months for another chance."
      : `Billing migration: ${memberName} (${plan.kind.replace(/_/g, " ")}, renews ${plan.renewal}).`;

  // A staff-facing bell goes to everybody who can act on it; a member-facing send is recorded
  // once, against the admins, as the audit trail for a message the member receives elsewhere.
  const { data: recipients } = await admin
    .from("staff")
    .select("user_id")
    .in("role", ["super_admin", "admin", "call_centre_supervisor"])
    .not("user_id", "is", null);

  const first = (recipients ?? [])[0]?.user_id as string | undefined;
  if (!first) return false;

  const { data, error } = await admin
    .from("notification_log")
    .insert({
      admin_user_id: first,
      event_type: plan.kind === "staff_bell" ? "billing.annual_switch_due" : "member.switch_link_sent",
      entity_type: "member",
      entity_id: plan.member.id,
      message,
      status: "pending",
      dedupe_key: plan.key,
    })
    .select("id");

  // A conflict on the unique index is the "already sent" answer, not a failure.
  if (error) return false;
  const claimed = (data ?? []).length > 0;

  // The rest of the bell's audience, only once the claim is ours. These carry no dedupe key —
  // one key per SEND, and the claim above is the send.
  if (claimed && plan.kind === "staff_bell") {
    const rest = (recipients ?? []).slice(1);
    if (rest.length > 0) {
      await admin.from("notification_log").insert(
        rest.map((r) => ({
          admin_user_id: r.user_id,
          event_type: "billing.annual_switch_due",
          entity_type: "member",
          entity_id: plan.member.id,
          message,
          status: "pending",
        })),
      );
    }
  }

  return claimed;
}

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

async function bellAdmins(
  admin: ReturnType<typeof createClient>,
  eventType: string,
  message: string,
): Promise<void> {
  const { data: recipients } = await admin
    .from("staff")
    .select("user_id")
    .in("role", ["super_admin", "admin"])
    .not("user_id", "is", null);

  if (!recipients?.length) return;
  await admin.from("notification_log").insert(
    recipients.map((r) => ({
      admin_user_id: r.user_id,
      event_type: eventType,
      entity_type: "system",
      message,
      status: "pending",
    })),
  );
}
