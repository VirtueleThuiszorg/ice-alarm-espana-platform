// @vitest-environment node
//
// ═══ "RUNNER RE-RUN SENDS NOTHING TWICE" — run, not described ═══════════════
//
// Lee's brief asks for it by name, and until this file existed it could not be checked. The
// runner lived inside a function that calls `serve()` at import time, so every assertion about
// it was a source scan: "the file contains `rpc(\"expire_legacy_switches\")`".
//
// THAT IS HOW THREE DEFECTS GOT IN AND STAYED IN. The expiry sweep was dead code, called by
// nothing. `legacy_next_renewal` was never rolled forward, so with 431 dates scattered across a
// month most members would never have been written to at all. And the planner said `legacy`
// only, which broke the annual ladder for the people a missed switch costs a year. Each one was
// written, each one was read, none of them was ever run.
//
// The run now lives in `_shared/billing-migration-run.ts` and this drives it against a fake
// PostgREST that models the ONE thing the idempotency argument rests on: a UNIQUE INDEX on
// `notification_log.dedupe_key`. A second insert carrying a key the table has already seen fails
// the way Postgres reports one — which is what makes "just run it again" a safe instruction to
// give somebody at nine at night, rather than a hope.
//
// WHAT IS STILL NOT HERE: the database's own rules. The unique index itself, the grants, and
// what `expire_legacy_switches` does to a row are executed against real PostgreSQL in
// `scripts/rls/isolation.sql`. This is the other half — given a database that behaves, what does
// the runner DO?

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeSupabase, type FakeDb, type Seed } from "./helpers/fakeSupabase";

/* Dynamic, through a variable path: the module types its client through a Deno/URL specifier
   that `tsc -p tsconfig.app.json` cannot resolve. Same escape hatch as the webhook's. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const RUN_MOD = "../../supabase/functions/_shared/billing-migration-run.ts";
const { runBillingMigration } = (await import(/* @vite-ignore */ RUN_MOD)) as any;

const asClient = (c: unknown) => c as unknown as SupabaseClient;

/** A fixed today, because a schedule is relative to one and a suite that passes in September and
    fails in October has proved nothing. */
const TODAY = new Date("2026-09-11T00:00:00.000Z");

const ON = [
  { key: "billing_migration_enabled", value: "true" },
  { key: "billing_migration_monthly_lead_days", value: "3" },
  { key: "billing_migration_annual_notice_days", value: "14" },
  { key: "billing_migration_annual_reminder_days", value: "7" },
  { key: "billing_migration_annual_escalate_days", value: "3" },
];

/** One monthly member due in three days, with a plan Karma named — the ordinary case. */
function seed(over: Partial<Seed> = {}, settings = ON): Seed {
  return {
    system_settings: settings,
    members: [
      {
        id: "m-1",
        first_name: "Brenda",
        last_name: "Colefax",
        billing_source: "legacy",
        legacy_billing_day: 14,
        legacy_next_renewal: "2026-09-14",
        subscriptions: [
          { plan_type: "single", billing_frequency: "monthly", created_at: "2026-01-01" },
        ],
        crm_profiles: { legacy_membership_type: "Single", legacy_payment_type: "Monthly" },
      },
    ],
    staff: [
      { user_id: "admin-1", role: "admin" },
      { user_id: "admin-2", role: "super_admin" },
    ],
    ...over,
  };
}

/** The runner's one outward call, recorded. */
function sender() {
  const sent: string[] = [];
  return { sent, fn: async (memberId: string) => void sent.push(memberId) };
}

function db(s: Seed): FakeDb {
  const d = fakeSupabase(s);
  d.uniqueIndex("notification_log", "dedupe_key");
  d.rpcReturns("expire_legacy_switches", 0);
  return d;
}

describe("a day's run, executed", () => {
  it("sends the monthly member their switch link, three days out", async () => {
    const d = db(seed());
    const send = sender();

    const out = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: send.fn,
      now: TODAY,
    });

    expect(out.ran).toBe(true);
    expect(out.sent).toBe(1);
    expect(send.sent).toEqual(["m-1"]);
  });

  /*
    ── THE ONE THE BRIEF ASKS FOR BY NAME ────────────────────────────────────

    The runner is a daily cron. It WILL be re-run by hand, it will overlap itself the day the
    schedule changes, and one day it will crash halfway through 431 members and be run again. A
    second text about money to an eighty-year-old reads as though the first one failed — or
    worse, as though they are being charged twice.

    Nothing is prevented by remembering. The send CLAIMS itself by inserting a row against a
    unique index, and the second insert cannot happen. Here the fake enforces exactly that index,
    and the same store is carried across both runs.
  */
  it("RE-RUN SENDS NOTHING TWICE — the second run claims nothing and sends nobody", async () => {
    const d = db(seed());
    const first = sender();
    const second = sender();

    const a = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: first.fn,
      now: TODAY,
    });
    const b = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: second.fn,
      now: TODAY,
    });

    expect(a.sent).toBe(1);
    expect(first.sent).toEqual(["m-1"]);

    expect(b.sent).toBe(0);
    expect(b.skipped).toBe(1);
    expect(second.sent).toEqual([]);
  });

  it("claims by the key that names the member, the renewal and the kind", async () => {
    const d = db(seed());
    await runBillingMigration(asClient(d.client), false, { sendSwitchLink: sender().fn, now: TODAY });

    const claim = d.writesTo("notification_log").at(0);
    expect(claim?.values.dedupe_key).toBe("billing-switch:m-1:2026-09-14:switch_link");
    // Next month's renewal is a different key, so the member is written to again then.
    expect(String(claim?.values.dedupe_key)).toContain("2026-09-14");
  });

  /*
    THE LOG ROW GOES IN BEFORE THE SEND. If the Stripe call then fails, the member has a log row
    and no link: a gap somebody can see and fix. The other order loses the record when the
    process dies between them, and the next run sends again. Executed here: a send that throws
    leaves the claim standing, and the failure is reported rather than swallowed.
  */
  it("a failed send is reported, and does not un-claim itself into a second attempt", async () => {
    const d = db(seed());

    const out = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: async () => {
        throw new Error("no link returned");
      },
      now: TODAY,
    });

    expect(out.sent).toBe(0);
    expect((out.failed as unknown[]).length).toBe(1);
    expect(d.writesTo("notification_log").length).toBeGreaterThan(0);

    // A migration that quietly stops is 431 people nobody is moving.
    const bells = d.writesTo("notification_log").flatMap((w) =>
      Array.isArray(w.values) ? w.values : [w.values],
    );
    expect(bells.some((b) => String(b.message).includes("could not write to"))).toBe(true);
  });
});

describe("off means off for the sending, and not for the bookkeeping", () => {
  const OFF = ON.map((r) => (r.key === "billing_migration_enabled" ? { ...r, value: "false" } : r));

  it("sends nothing, and says WHY rather than showing an empty list", async () => {
    const d = db(seed({}, OFF));
    const send = sender();

    const out = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: send.fn,
      now: TODAY,
    });

    expect(out.ran).toBe(false);
    expect(out.enabled).toBe(false);
    expect(String(out.reason)).toMatch(/switched off/i);
    expect(send.sent).toEqual([]);
    expect(d.writesTo("notification_log")).toEqual([]);
  });

  /*
    BUT THE SWEEPS STILL RUN. A member left in `switch_pending` is OUT of the Santander export —
    so if the expiry waited on the switch, pausing the migration with links outstanding would
    leave those members collected from by NOBODY for the length of the pause.
  */
  it("still sweeps the lapsed links while the migration is paused", async () => {
    const d = db(seed({}, OFF));
    d.rpcReturns("expire_legacy_switches", 2);

    const out = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: sender().fn,
      now: TODAY,
    });

    expect(d.rpcs.map((r) => r.fn)).toContain("expire_legacy_switches");
    expect(out.expired).toBe(2);
  });

  /*
    AND STILL ROLLS A PASSED RENEWAL FORWARD. `legacy_next_renewal` is ONE DATE. Santander
    collects again next month whatever the record says, but every reader treats a past date as
    "nothing due" — the runner would skip the member for good and the CSV would blank their
    collection date.
  */
  it("still rolls a renewal date that has gone past", async () => {
    const s = seed({}, OFF);
    (s.members[0] as Record<string, unknown>).legacy_next_renewal = "2026-08-14";
    const d = db(s);

    const out = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: sender().fn,
      now: TODAY,
    });

    expect(out.rolledForward).toBe(1);
    const write = d.writesTo("members").at(0);
    // From the member's own STORED DAY, not from the date that passed.
    expect(write?.values.legacy_next_renewal).toBe("2026-09-14");
  });
});

describe("a dry run decides everything and writes nothing", () => {
  /*
    THE MEMBER'S RENEWAL HAS ALREADY PASSED, deliberately. A dry run over somebody whose date is
    still ahead proves nothing about the guard: there is no roll to make, so `d.writes` is empty
    whether the `if (!settings.dryRun)` is there or not. The first version of this test did
    exactly that, and a mutation removing the guard did not fail it.
  */
  it("plans the day and touches neither the members nor the log", async () => {
    const s = seed();
    (s.members[0] as Record<string, unknown>).legacy_next_renewal = "2026-08-14";
    const d = db(s);
    const send = sender();

    const out = await runBillingMigration(asClient(d.client), true, {
      sendSwitchLink: send.fn,
      now: TODAY,
    });

    expect(out.dryRun).toBe(true);
    expect(out.ran).toBe(false);
    // It SAYS it would roll the date forward, and does not.
    expect(out.rolledForward).toBe(1);
    expect(send.sent).toEqual([]);
    expect(d.writes).toEqual([]);
    // And it does not sweep either: a preview is not a decision.
    expect(d.rpcs).toEqual([]);
  });

  it("names who would be written to, and what they would get", async () => {
    const d = db(seed());
    const out = await runBillingMigration(asClient(d.client), true, {
      sendSwitchLink: sender().fn,
      now: TODAY,
    });

    expect(out.planned).toEqual([
      {
        memberId: "m-1",
        memberName: "Brenda Colefax",
        kind: "switch_link",
        renewal: "2026-09-14",
        daysUntilRenewal: 3,
        key: "billing-switch:m-1:2026-09-14:switch_link",
      },
    ]);
  });
});

describe("a member nobody can price", () => {
  /*
    Karma's label named no plan, so the import stored its `single` / `annual` DEFAULTS — which
    look exactly like real answers. A link built from them charges a couple the single price, or
    bills a monthly member for twelve months at once. The office is told; the member is not
    written to; Santander goes on collecting from them meanwhile.
  */
  const unpriceable = () => {
    const s = seed();
    const m = s.members[0] as Record<string, unknown>;
    m.crm_profiles = { legacy_membership_type: "FOC — Ayuntamiento", legacy_payment_type: "DD" };
    m.subscriptions = [{ plan_type: "single", billing_frequency: "annual", created_at: "2026-01-01" }];
    m.legacy_next_renewal = "2026-09-25"; // 14 days out — the annual notice day
    return s;
  };

  it("is never sent a link, and the office is told instead", async () => {
    const d = db(unpriceable());
    const send = sender();

    const out = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: send.fn,
      now: TODAY,
    });

    expect(send.sent).toEqual([]);
    expect(out.sent).toBe(1); // the bell IS the action, and it is recorded as done

    const claim = d.writesTo("notification_log").at(0);
    expect(claim?.values.dedupe_key).toBe("billing-switch:m-1:2026-09-25:plan_unconfirmed");
    expect(String(claim?.values.message)).toMatch(/nobody can say what they pay for/i);
    expect(claim?.values.event_type).toBe("billing.migration_run_failed");
  });

  it("and is told about ONCE, not once a day until somebody fixes it", async () => {
    const d = db(unpriceable());
    await runBillingMigration(asClient(d.client), false, { sendSwitchLink: sender().fn, now: TODAY });
    const second = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: sender().fn,
      now: TODAY,
    });
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
  });
});

describe("when the run itself fails", () => {
  it("rings the bell rather than stopping silently", async () => {
    const d = db(seed());
    d.failRead("members", "connection reset");

    const out = await runBillingMigration(asClient(d.client), false, {
      sendSwitchLink: sender().fn,
      now: TODAY,
    });

    expect(String(out.error)).toMatch(/could not load candidates/);
    const bells = d.writesTo("notification_log").flatMap((w) =>
      Array.isArray(w.values) ? w.values : [w.values],
    );
    expect(bells.some((b) => String(b.message).includes("billing migration run failed"))).toBe(true);
  });
});
