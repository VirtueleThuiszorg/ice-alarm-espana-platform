/**
 * WHAT THE DAILY RUNNER DOES — the whole of it, and none of the transport.
 *
 * ── WHY THIS IS A MODULE ──────────────────────────────────────────────────────
 *
 * `billing-migration-run/index.ts` calls `serve()` at import time, so nothing inside it could be
 * RUN. Every assertion about the runner was a source scan: "the file contains
 * `rpc(\"expire_legacy_switches\")`". That is how three defects got in and stayed in — the sweep
 * was dead code, the renewal date was never rolled forward, and the planner refused the very
 * members the ladder was for — each written, each read, none executed.
 *
 * And it leaves the one thing Lee's brief asks for by name unproven: "Runner re-run sends
 * nothing twice." The dedupe key is a unique index, which the RLS harness proves exists; whether
 * the runner's claim loop actually SKIPS on a conflict is a different question, and it is this
 * module's.
 *
 * So `index.ts` keeps what needs Deno and a request — who is allowed to call it, and `serve()` —
 * and everything below runs in a test.
 *
 * A MOVE, NOT A REWRITE: same order, same writes, same answers. The one change is that the call
 * to `send-payment-link` is injected rather than made here, because that is the seam between
 * "what the runner decides" and "what another edge function does about it".
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  RUNNER_SETTING_KEYS,
  isMemberFacing,
  parseRunnerSettings,
  planTodaysRun,
  type PlannedSend,
  type RunnerCandidate,
} from "./billing-migration-runner.ts";
import { rolledForwardRenewal } from "./legacy-billing-schedule.ts";
import { resolveLegacyPlan } from "./legacy-plan.ts";

type Json = Record<string, unknown>;

/**
 * THE ONE SEAM. `send-payment-link` holds the pricing, the synced Stripe Price ids, the
 * stale-price refusal, the pending order rows, `start_legacy_switch`, the delivery decisions and
 * the audit row. The runner asks it for a link; it does not build one.
 *
 * Injected so the decisions above can be run without a Stripe key, a member record and a live
 * edge function to reach them. `index.ts` passes the real call.
 */
export interface BillingRunnerDeps {
  sendSwitchLink: (memberId: string) => Promise<void>;
  /** Fixed in tests, so a suite that passes in September still passes in October. */
  now?: Date;
}

export async function runBillingMigration(
  admin: SupabaseClient,
  askedForDryRun: boolean,
  deps: BillingRunnerDeps,
): Promise<Json> {
  /*
    THE RUN FAILING IS EXACTLY THE SILENCE THIS BELL EXISTS FOR. A migration that quietly stops
    is 431 people nobody is moving, and nothing else on the platform would notice: these members
    are `active` and monitored either way, so no alert, no dunning and no renewal will ever
    mention them.

    It returns the failure rather than throwing, so the caller answers 500 and the reason is in
    the body — the same shape the successful runs have.
  */
  try {
    // ── the settings ─────────────────────────────────────────────────────────
    const { data: settingRows } = await admin
      .from("system_settings")
      .select("key, value")
      .in("key", Object.values(RUNNER_SETTING_KEYS));

    const settings = parseRunnerSettings(settingRows ?? [], askedForDryRun);

    const today = deps.now ?? new Date();

    /* ── sweep 1: links that have lapsed ──────────────────────────────────────
       BEFORE anything else, and before the enabled check. A member left in `switch_pending` is
       out of the Santander export; if the migration is paused with links outstanding and this
       waited on the switch, nobody would be collecting from them for the length of the pause. */
    let expired = 0;
    if (!settings.dryRun) {
      const { data: expiredCount, error: expireError } = await admin.rpc("expire_legacy_switches");
      if (expireError) {
        // Not fatal to the rest of the run: the sends below are still worth doing, and a
        // stranded member is exactly what the bell is for.
        console.error("expire_legacy_switches failed:", expireError.message);
        await bellAdmins(
          admin,
          "billing.migration_run_failed",
          `Lapsed Stripe switch links could not be swept: ${expireError.message}. Any member whose ` +
            "link has run out is in neither collection until this is fixed.",
        ).catch(() => undefined);
      } else {
        expired = (expiredCount as number | null) ?? 0;
      }
    }

    // ── who is on legacy billing, or part-way off it ─────────────────────────
    //
    // `switch_pending` IS INCLUDED, and that is not an oversight: an annual member is put into it
    // by their own 14-day notice, and excluding them would mean the reminder at 7 days and the
    // phone call at 3 were never planned — the ladder reduced to one rung, for the people a
    // missed switch costs a whole year.
    //
    // `billing_frequency` comes from the member's own subscription row — what Karma billed them —
    // because an annual member gets a ladder and a monthly member gets one link, and reading the
    // wrong one writes to somebody eleven months early.
    //
    // `crm_profiles` comes too, because what the member is CHARGED is decided by Karma's verbatim
    // membership label and not by `subscriptions.plan_type` — that column carries the CRM
    // import's `single`/`annual` defaults for every row whose label named no plan, and the
    // defaults look exactly like real answers. `_shared/legacy-plan.ts` tells them apart.
    const { data: rows, error: loadError } = await admin
      .from("members")
      .select(
        "id, first_name, last_name, billing_source, legacy_billing_day, legacy_next_renewal, " +
          "subscriptions (plan_type, billing_frequency, created_at), " +
          "crm_profiles (legacy_membership_type, legacy_payment_type)",
      )
      .in("billing_source", ["legacy", "switch_pending"])
      .not("legacy_next_renewal", "is", null);

    if (loadError) throw new Error(`could not load candidates: ${loadError.message}`);

    type SubRow = { plan_type: string | null; billing_frequency: string | null; created_at: string };

    /** The member's newest subscription row — what the platform last recorded about their plan. */
    const newestSub = (r: Record<string, unknown>): SubRow | null => {
      const subs = (r.subscriptions ?? []) as SubRow[];
      return [...subs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
    };

    const frequencyOf = (r: Record<string, unknown>) =>
      (newestSub(r)?.billing_frequency as "monthly" | "annual" | null) ?? null;

    /* PostgREST returns an embedded one-to-one as an object and a one-to-many as an array, and
       which one `crm_profiles` is depends on whether its `member_id` carries a unique index.
       Reading it wrong would silently make every member "unconfirmed" and bell the office 431
       times, so both shapes are handled rather than assumed. */
    const profileOf = (r: Record<string, unknown>) => {
      const p = r.crm_profiles;
      const row = (Array.isArray(p) ? p[0] : p) as
        | { legacy_membership_type: string | null; legacy_payment_type: string | null }
        | null
        | undefined;
      return row ?? null;
    };

    const planConfirmedFor = (r: Record<string, unknown>) => {
      const sub = newestSub(r);
      const profile = profileOf(r);
      return resolveLegacyPlan({
        label: profile?.legacy_membership_type ?? null,
        paymentType: profile?.legacy_payment_type ?? null,
        storedPlanType: sub?.plan_type ?? null,
        storedBillingFrequency: sub?.billing_frequency ?? null,
      }).confirmed;
    };

    /* ── sweep 2: renewal dates that have gone past ───────────────────────────
       `legacy_next_renewal` is ONE DATE, not a schedule. Santander collects again next month
       whatever the record says, but every reader here treats a past date as "nothing due" — the
       runner would skip the member for good, the CSV would blank their collection date, and the
       dashboard's "due this month" would empty as the month went by. So the date is moved on the
       day after it passes, from the member's own stored billing day (monthly) or the anniversary
       (annual), through the one implementation of the rule. Members mid-switch are rolled too:
       their ladder for that renewal is over by the time it passes, and a stale date would be
       waiting for them the moment they lapse back to `legacy`. */
    let rolled = 0;
    const rollFailures: string[] = [];
    for (const r of rows ?? []) {
      const next = rolledForwardRenewal(
        {
          legacy_billing_day: (r.legacy_billing_day as number | null) ?? null,
          legacy_next_renewal: (r.legacy_next_renewal as string | null) ?? null,
          billing_frequency: frequencyOf(r),
        },
        today,
      );
      if (!next) continue;

      if (!settings.dryRun) {
        const { error: rollError } = await admin
          .from("members")
          .update({ legacy_next_renewal: next })
          .eq("id", r.id as string);
        if (rollError) {
          rollFailures.push(rollError.message);
          continue;
        }
      }
      // Kept in step with the database so today's plan reads the date that is now on the record,
      // rather than the stale one it was loaded with.
      (r as Record<string, unknown>).legacy_next_renewal = next;
      rolled += 1;
    }

    if (rollFailures.length > 0) {
      await bellAdmins(
        admin,
        "billing.migration_run_failed",
        `${rollFailures.length} legacy member(s) kept a renewal date that has already passed: ` +
          `${rollFailures[0]}. They will not be written to, and their Santander collection date is blank.`,
      ).catch(() => undefined);
    }

    /*
      OFF MEANS OFF FOR THE SENDING, and the answer says so rather than showing an empty list. An
      empty list and a switched-off runner look identical, and an admin reading "0 members due
      today" would conclude the migration had nothing left to do. The two sweeps above have
      already run: they are bookkeeping and safety, not part of the migration.
    */
    if (!settings.enabled) {
      return {
        ran: false,
        enabled: false,
        dryRun: settings.dryRun,
        reason: "The billing migration is switched off in Admin → Settings → Billing.",
        expired,
        rolledForward: rolled,
        planned: [],
      };
    }

    const candidates: RunnerCandidate[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      billing_source: r.billing_source as string | null,
      legacy_next_renewal: (r.legacy_next_renewal as string | null) ?? null,
      billing_frequency: frequencyOf(r),
      planConfirmed: planConfirmedFor(r),
    }));

    const planned = planTodaysRun(candidates, settings, today);
    const nameOf = (id: string) => {
      const row = (rows ?? []).find((r) => r.id === id);
      return row ? `${row.first_name} ${row.last_name}` : id;
    };

    if (settings.dryRun) {
      return {
        ran: false,
        enabled: true,
        dryRun: true,
        // What the sweeps WOULD have done. A preview writes nothing at all.
        expired,
        rolledForward: rolled,
        consideredMembers: candidates.length,
        planned: planned.map((p) => ({
          memberId: p.member.id,
          memberName: nameOf(p.member.id),
          kind: p.kind,
          renewal: p.renewal,
          daysUntilRenewal: p.daysUntilRenewal,
          key: p.key,
        })),
      };
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
        await deps.sendSwitchLink(plan.member.id);
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

    return {
      ran: true,
      enabled: true,
      dryRun: false,
      expired,
      rolledForward: rolled,
      consideredMembers: candidates.length,
      plannedCount: planned.length,
      sent: sent.length,
      skipped: skipped.length,
      failed,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("billing-migration-run error:", message);
    await bellAdmins(admin, "billing.migration_run_failed", `The billing migration run failed: ${message}`)
      .catch(() => undefined);
    return { error: message };
  }
}

/**
 * Claim this send, or find that somebody already did.
 *
 * The write IS the claim: a unique index on `dedupe_key` means the second attempt inserts
 * nothing and returns no row, whether it comes from a re-run, an overlapping run or a retry
 * after a crash. There is no read-then-write window to lose.
 */
async function claim(
  admin: SupabaseClient,
  plan: PlannedSend,
  memberName: string,
): Promise<boolean> {
  const message =
    plan.kind === "staff_bell"
      ? `${memberName} renews on ${plan.renewal} and has not moved to Stripe. Ring them — an ` +
        "annual member who misses this waits twelve months for another chance."
      : plan.kind === "plan_unconfirmed"
        ? `${memberName} was due a Stripe switch link on ${plan.renewal}, but nobody can say what ` +
          "they pay for: the CRM import could not read a plan out of Karma's membership label, and " +
          "the record is showing its defaults. No link was sent and Santander will collect from them " +
          "as usual. Confirm their plan on their record, under Move to Stripe billing."
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
      // `plan_unconfirmed` is the migration failing to write to one member, which is what
      // `billing.migration_run_failed` already routes — a new event type would need a migration to
      // widen notification_routes' CHECK constraint for no gain in what anybody sees.
      event_type:
        plan.kind === "staff_bell"
          ? "billing.annual_switch_due"
          : plan.kind === "plan_unconfirmed"
            ? "billing.migration_run_failed"
            : "member.switch_link_sent",
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
  if (claimed && (plan.kind === "staff_bell" || plan.kind === "plan_unconfirmed")) {
    const rest = (recipients ?? []).slice(1);
    if (rest.length > 0) {
      await admin.from("notification_log").insert(
        rest.map((r) => ({
          admin_user_id: r.user_id,
          event_type:
            plan.kind === "staff_bell" ? "billing.annual_switch_due" : "billing.migration_run_failed",
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

async function bellAdmins(
  admin: SupabaseClient,
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
