// @vitest-environment node
//
// THE DAILY RUNNER: the two migrations, the schedule, and the switch that starts it.
//
// The decision itself — who is due today and what they are sent — is pinned in
// `billingMigrationRunner.test.ts`. This file holds the parts a source scan can:
//
//   * the dedupe key has a UNIQUE index, so "never twice" is impossible rather than checked;
//   * the runner arrives SWITCHED OFF, so a deploy does not start writing to 431 elderly people;
//   * the pg_cron file is skipped by the RLS harness AND contains nothing the harness would have
//     wanted to see — the property that makes skipping it cost nothing, and the one a future
//     edit could quietly break by adding a policy to a file nobody checks;
//   * the runner is reachable only by something holding the service role key, and a person may
//     only preview.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATIONS = join(ROOT, "supabase/migrations");

const SETTINGS_FILE = "20260911150000_billing_migration_settings.sql";
const CRON_FILE = "20260911150100_billing_migration_cron.sql";
const strip = (t: string) => t.replace(/^\s*--.*$/gm, "");
const settingsRaw = read(`supabase/migrations/${SETTINGS_FILE}`);
const settings = strip(settingsRaw);
const cronRaw = read(`supabase/migrations/${CRON_FILE}`);
const cron = strip(cronRaw);
const fn = read("supabase/functions/billing-migration-run/index.ts");

describe("never twice, as a key rather than a check", () => {
  it("adds the dedupe key to notification_log", () => {
    expect(settings).toMatch(/ADD COLUMN IF NOT EXISTS dedupe_key text/);
  });

  /*
    THE UNIQUE INDEX IS THE WHOLE MECHANISM. Without it the runner would have to SELECT before
    each send, which races a re-run, an overlapping run and a retry after a crash — and losing
    that race is a second text about money to an eighty-year-old, which reads as though the first
    one failed.
  */
  it("makes a second send impossible with a UNIQUE index", () => {
    const stmt = settings.match(/CREATE UNIQUE INDEX IF NOT EXISTS notification_log_dedupe_key_idx[\s\S]*?;/);
    expect(stmt).not.toBeNull();
    expect(stmt![0]).toContain("(dedupe_key)");
  });

  // Every other notification_log row has a NULL key; a plain unique index would collapse them
  // all into one and the bell would stop working entirely.
  it("is PARTIAL, so every other notification is unaffected", () => {
    const stmt = settings.match(/CREATE UNIQUE INDEX IF NOT EXISTS notification_log_dedupe_key_idx[\s\S]*?;/);
    expect(stmt![0]).toMatch(/WHERE dedupe_key IS NOT NULL/);
  });

  it("and the runner claims a send by WRITING it, not by reading first", () => {
    // The insert IS the claim: no row back means somebody already did it.
    expect(fn).toMatch(/dedupe_key: plan\.key/);
    expect(fn).toMatch(/claimed = \(data \?\? \[\]\)\.length > 0/);
  });

  // If the Stripe call then fails, the member has a log row and no link — a gap somebody can
  // see. The other order loses the record when the process dies between them, and the next run
  // sends again.
  it("writes the log row BEFORE sending, which is the safer of the two failures", () => {
    expect(fn.indexOf("const claimed = await claim(")).toBeLessThan(fn.indexOf("await sendSwitchLink("));
  });
});

describe("it arrives switched off", () => {
  it("seeds the master switch as false", () => {
    expect(settings).toMatch(/\('billing_migration_enabled',\s*'false'\)/);
  });

  it("seeds the four lead times with the defaults the runner falls back to", () => {
    expect(settings).toMatch(/\('billing_migration_monthly_lead_days',\s*'3'\)/);
    expect(settings).toMatch(/\('billing_migration_annual_notice_days',\s*'14'\)/);
    expect(settings).toMatch(/\('billing_migration_annual_reminder_days',\s*'7'\)/);
    expect(settings).toMatch(/\('billing_migration_annual_escalate_days',\s*'3'\)/);
  });

  // A re-applied migration must not reset a switch Lee has turned on.
  it("does not overwrite a value somebody has already set", () => {
    expect(settings).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
  });

  it("and the function refuses to do anything while it is off", () => {
    expect(fn).toMatch(/if \(!settings\.enabled\)/);
    expect(fn.indexOf("if (!settings.enabled)")).toBeLessThan(fn.indexOf('from("members")'));
  });

  /*
    AND THE PREVIEW SAYS SO rather than showing an empty list. An empty preview and a switched-off
    runner look identical, and an admin reading "0 members due today" would conclude the migration
    had nothing left to do.
  */
  it("the preview distinguishes 'off' from 'nobody due'", () => {
    expect(fn).toMatch(/enabled: false/);
    expect(fn).toMatch(/switched off in Admin → Settings → Billing/);
    const card = read("src/components/admin/settings/BillingMigrationCard.tsx");
    expect(card).toMatch(/!preview\.data\.enabled/);
  });
});

describe("who may run it", () => {
  it("the real run needs the service role key", () => {
    expect(fn).toMatch(/isCron = serviceKey\.length > 0 && bearer === serviceKey/);
  });

  // A person pressing a button must not start the run for 431 people; the schedule does that, on
  // a day nobody has to remember.
  it("a person may only preview", () => {
    expect(fn).toContain("PREVIEW_ONLY");
    // And the flag lives in the BODY: the wiring register's scanner reads
    // `functions.invoke("name")`, so a literal carrying `?dryRun=1` would be a control the
    // register cannot see — the failure it exists to prevent.
    expect(fn).toMatch(/payload\?\.dryRun === true/);
    expect(read("src/components/admin/settings/BillingMigrationCard.tsx"))
      .toMatch(/invoke\("billing-migration-run", \{\s*body: \{ dryRun: true \}/);
  });

  it("and a preview needs to be staff at all", () => {
    expect(fn).toMatch(/Staff access required/);
  });

  // The runner calls `send-payment-link` with the service key, so that function has a matching
  // branch — narrowed to the one mode that takes nothing from the request.
  it("the link builder lets the runner in for legacy_switch ONLY", () => {
    const link = read("supabase/functions/send-payment-link/index.ts");
    expect(link).toMatch(/isRunner = serviceKey\.length > 0 && bearer === serviceKey/);
    expect(link).toMatch(/if \(isRunner && body\.mode !== "legacy_switch"\)/);
    expect(link).toContain("RUNNER_SCOPE");
  });

  it("and an ordinary payment link still needs a real, active staff member", () => {
    const link = read("supabase/functions/send-payment-link/index.ts");
    expect(link).toMatch(/\.eq\("is_active", true\)/);
    expect(link).toMatch(/STAFF_ROLES\.includes\(staffRow\.role\)/);
  });
});

describe("the schedule", () => {
  it("exists exactly once, in its own migration", () => {
    expect(readdirSync(MIGRATIONS).filter((f) => f.includes("billing_migration"))).toEqual(
      [SETTINGS_FILE, CRON_FILE].sort(),
    );
  });

  it("runs once a day", () => {
    expect(cron).toMatch(/cron\.schedule\(\s*'billing-migration-runner',\s*'0 6 \* \* \*'/);
  });

  it("calls the function this repo actually has", () => {
    expect(cron).toContain("/functions/v1/billing-migration-run");
  });

  it("re-registers rather than erroring when the migration is applied twice", () => {
    expect(cron).toMatch(/cron\.unschedule\('billing-migration-runner'\)/);
  });

  it("carries a rollback", () => {
    expect(cronRaw).toMatch(/ROLLBACK:/);
  });

  /*
    THE SKIP IS A DECISION, AND IT HAS A PRICE ONLY IF THIS FILE STOPS BEING EMPTY OF SCHEMA.
    `scripts/rls/run.sh` cannot install pg_cron on a stock PostgreSQL, so it skips this file — and
    a skipped file takes its whole contents with it. That is free exactly while it contains no
    table, no policy and no RLS toggle; the moment somebody adds one, the harness would never see
    it. The runner's shell script checks this too, but at run time; this is the version a reader
    meets.
  */
  it("is skipped by the RLS harness, explicitly", () => {
    expect(read("scripts/rls/run.sh")).toContain(CRON_FILE);
  });

  it("and contains nothing the harness would have wanted to see", () => {
    expect(cron).not.toMatch(/CREATE\s+TABLE/i);
    expect(cron).not.toMatch(/CREATE\s+POLICY/i);
    expect(cron).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  // The settings migration is NOT skipped, which is why it is a separate file: the dedupe index
  // and the seeds are exactly what the harness should be exercising.
  it("the settings half is NOT skipped", () => {
    expect(read("scripts/rls/run.sh")).not.toContain(SETTINGS_FILE);
  });
});

describe("the failure nobody else would notice", () => {
  /*
    These members are `active` and monitored whether or not they ever move, so no alert, no
    dunning and no renewal will ever mention them. A migration that quietly stops is 431 people
    nobody is moving and nothing on the platform says so.
  */
  it("rings the bell when sends fail", () => {
    expect(fn).toMatch(/billing\.migration_run_failed/);
    expect(fn).toMatch(/if \(failed\.length > 0\)/);
  });

  it("rings it when the run itself throws, too", () => {
    const tail = fn.slice(fn.lastIndexOf("} catch (error)"));
    expect(tail).toContain("billing.migration_run_failed");
  });

  it("and the event is routable — an event nothing routes is an event nobody hears", () => {
    expect(settings).toContain("'billing.migration_run_failed'");
    expect(settings).toMatch(/\('billing\.migration_run_failed',\s*'push',\s*true\)/);
    expect(read("supabase/functions/_shared/notify-staff.ts")).toContain('"billing.migration_run_failed"');
  });
});
