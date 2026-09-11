// @vitest-environment node
//
// THE SANTANDER LIST — item 4 of the billing-migration goal, and the most expensive thing on
// that screen to get wrong.
//
// The counters are a progress bar. The CSV is an INSTRUCTION: somebody in the office runs the
// bank collection by hand from it. One rule carries the whole file —
//
//     a member with an unpaid Stripe link is NOT on that list.
//
// They left it the moment the link was created. Put them back and, if they then pay Stripe, they
// are charged twice in one month, by us, for the same monitoring, out of the account of somebody
// in their eighties. That is the failure the `switch_pending` state exists to prevent, and this
// export is the last place it could be undone.
//
// The rule is tested here rather than through the component for the same reason: a component
// test exercises it only when somebody clicks, and this has to be right every month.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  santanderExportCsv,
  summariseMigration,
  toMigrationRow,
  type MigrationRow,
} from "@/lib/billingMigrationProgress";
import { resolveLegacyPlan } from "../../supabase/functions/_shared/legacy-plan";

const TODAY = new Date("2026-09-11T00:00:00.000Z");

const row = (over: Partial<MigrationRow> = {}): MigrationRow => ({
  id: "m-1",
  name: "Brenda Colefax",
  email: "brenda@example.com",
  phone: "+34600000001",
  billingSource: "legacy",
  billingDay: 15,
  nextRenewal: "2026-09-15",
  switchExpiresAt: null,
  amount: 29.95,
  billingFrequency: "monthly",
  // The ordinary case: Karma's label named a plan, so the import read one. The tests that care
  // about the other case say so explicitly.
  legacyPlanLabel: "Single",
  planConfirmed: true,
  ...over,
});

describe("the Santander list", () => {
  it("includes a member the bank still collects from", () => {
    const csv = santanderExportCsv([row()], TODAY);
    expect(csv).toContain("Brenda Colefax");
    expect(csv).toContain("2026-09-15");
  });

  // THE RULE. Everything else in this file is bookkeeping beside it.
  it("EXCLUDES a member with a Stripe link out", () => {
    const csv = santanderExportCsv(
      [row({ id: "m-2", name: "Arthur Pennington", billingSource: "switch_pending" })],
      TODAY,
    );
    expect(csv).not.toContain("Arthur Pennington");
  });

  it("excludes a member Stripe already bills", () => {
    const csv = santanderExportCsv(
      [row({ id: "m-3", name: "Margaret Ashcombe", billingSource: "stripe" })],
      TODAY,
    );
    expect(csv).not.toContain("Margaret Ashcombe");
  });

  /*
    AND KEEPS A MEMBER WITH NO DATE, with the cell blank. They are still a paying client and the
    office still collects from them; dropping them would silently stop somebody's payment, which
    is the worse error in the other direction. The blank is a question for whoever runs it.
  */
  it("keeps a member with no billing date, and leaves the cell empty", () => {
    const csv = santanderExportCsv(
      [row({ name: "No Date", billingDay: null, nextRenewal: null })],
      TODAY,
    );
    expect(csv).toContain("No Date");
    expect(csv).toMatch(/No Date,[^,]*,[^,]*,,,/);
  });

  // A date in a later month on a sheet headed "this month" is a payment somebody takes early.
  it("blanks a renewal that falls in a later month", () => {
    const csv = santanderExportCsv([row({ nextRenewal: "2026-10-15" })], TODAY);
    expect(csv).not.toContain("2026-10-15");
    expect(csv).toContain("Brenda Colefax");
  });

  it("orders by the day of the month, which is the order the collection is run in", () => {
    const csv = santanderExportCsv(
      [
        row({ id: "a", name: "Late", billingDay: 28, nextRenewal: "2026-09-28" }),
        row({ id: "b", name: "Early", billingDay: 2, nextRenewal: "2026-09-02" }),
      ],
      TODAY,
    );
    expect(csv.indexOf("Early")).toBeLessThan(csv.indexOf("Late"));
  });

  it("escapes a name with a comma in it rather than shifting every column", () => {
    const csv = santanderExportCsv([row({ name: 'Smith, Jr "Bob"' })], TODAY);
    expect(csv).toContain('"Smith, Jr ""Bob"""');
  });

  it("has a header even when nobody is on it", () => {
    const csv = santanderExportCsv([], TODAY);
    expect(csv.split("\r\n")).toHaveLength(1);
    expect(csv).toContain("member_id,name,email,phone,billing_day,next_collection");
  });

  it("writes the amount to two decimals, because it is money on a bank sheet", () => {
    expect(santanderExportCsv([row({ amount: 30 })], TODAY)).toContain("30.00");
  });
});

describe("the three counters", () => {
  const people = [
    row({ id: "l1", billingSource: "legacy" }),
    row({ id: "l2", billingSource: "legacy", billingDay: null, nextRenewal: null }),
    row({ id: "p1", billingSource: "switch_pending", switchExpiresAt: "2026-09-25T00:00:00.000Z" }),
    row({ id: "p2", billingSource: "switch_pending", switchExpiresAt: "2026-09-01T00:00:00.000Z" }),
    row({ id: "s1", billingSource: "stripe" }),
  ];

  it("counts each state separately — 'in progress' is not one of them", () => {
    const s = summariseMigration(people, TODAY);
    expect(s.legacy).toBe(2);
    expect(s.switchPending).toBe(2);
    expect(s.stripe).toBe(1);
  });

  // The runner cannot time a link for them, so they are never moved automatically. A silent
  // failure otherwise: they look exactly like everybody else on the list.
  it("surfaces the legacy members with no billing date", () => {
    expect(summariseMigration(people, TODAY).needsDate).toBe(1);
  });

  // A lapsed link the daily sweep has not yet caught: right now they are in NEITHER collection.
  it("counts a link that has run out separately from one still live", () => {
    expect(summariseMigration(people, TODAY).lapsed).toBe(1);
  });
});

describe("who is due this month", () => {
  it("lists legacy members renewing between today and month end, soonest first", () => {
    const s = summariseMigration(
      [
        row({ id: "a", name: "Later", nextRenewal: "2026-09-28" }),
        row({ id: "b", name: "Sooner", nextRenewal: "2026-09-14" }),
      ],
      TODAY,
    );
    expect(s.dueThisMonth.map((m) => m.name)).toEqual(["Sooner", "Later"]);
  });

  it("includes somebody due TODAY", () => {
    const s = summariseMigration([row({ nextRenewal: "2026-09-11" })], TODAY);
    expect(s.dueThisMonth).toHaveLength(1);
  });

  it("leaves out a renewal that has already gone past", () => {
    expect(summariseMigration([row({ nextRenewal: "2026-09-10" })], TODAY).dueThisMonth).toEqual([]);
  });

  it("leaves out next month", () => {
    expect(summariseMigration([row({ nextRenewal: "2026-10-01" })], TODAY).dueThisMonth).toEqual([]);
  });

  it("reaches the last day of a 30-day month", () => {
    const s = summariseMigration(
      [row({ nextRenewal: "2026-09-30" })],
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(s.dueThisMonth).toHaveLength(1);
  });

  it("reaches the 29th in a leap February", () => {
    const s = summariseMigration(
      [row({ nextRenewal: "2028-02-29" })],
      new Date("2028-02-01T00:00:00.000Z"),
    );
    expect(s.dueThisMonth).toHaveLength(1);
  });

  // A member with a link out is not "due" — they have already been asked.
  it("leaves out anybody who already has a link out", () => {
    const s = summariseMigration(
      [row({ billingSource: "switch_pending", nextRenewal: "2026-09-14" })],
      TODAY,
    );
    expect(s.dueThisMonth).toEqual([]);
  });
});

/*
  ── WHAT EACH PERSON ON THE SHEET IS ON ────────────────────────────────────────

  Lee's brief asks for the Santander export "with day, amount, plan". The plan was missing, and
  adding it is not cosmetic: a household of two and one person on the same sheet are collected
  from differently, and the office reads this list to do it.

  IT IS KARMA'S VERBATIM LABEL, not `subscriptions.plan_type`. That column holds the CRM import's
  `single` default for every row whose label named no plan (`_shared/legacy-plan.ts`), so it says
  "single" about people nobody ever established a plan for. On a sheet somebody collects money
  from, a made-up answer is worse than a blank one.
*/
describe("the plan on the Santander list", () => {
  it("prints Karma's own words", () => {
    const csv = santanderExportCsv([row({ legacyPlanLabel: "Couple Annual" })], TODAY);
    expect(csv.split("\r\n")[0].split(",")).toContain("plan");
    expect(csv).toContain("Couple Annual");
  });

  it("leaves it BLANK rather than guessing when Karma said nothing", () => {
    const csv = santanderExportCsv([row({ legacyPlanLabel: null, planConfirmed: false })], TODAY);
    const cells = csv.split("\r\n")[1].split(",");
    const planColumn = csv.split("\r\n")[0].split(",").indexOf("plan");
    expect(cells[planColumn]).toBe("");
  });

  it("quotes a label with a comma in it rather than splitting the row", () => {
    const csv = santanderExportCsv([row({ legacyPlanLabel: "Couple, 2 pendants" })], TODAY);
    expect(csv).toContain('"Couple, 2 pendants"');
    // One header row and one body row — the comma did not become a column.
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});

/*
  ── AND THE QUEUE THAT WOULD OTHERWISE BE SILENT ───────────────────────────────

  A legacy member whose plan cannot be established is one the runner will NOT send a link to: it
  bells the office and moves on. Nothing else on the platform would notice — they are `active`,
  monitored, and Santander goes on collecting — so without a counter the migration just stops for
  them, invisibly, the way "needs a billing date" would have.
*/
describe("the members nobody can price", () => {
  it("counts them, separately from the ones missing a date", () => {
    const summary = summariseMigration(
      [
        row({ id: "a" }),
        row({ id: "b", planConfirmed: false }),
        row({ id: "c", billingDay: null }),
      ],
      TODAY,
    );
    expect(summary.needsPlan).toBe(1);
    expect(summary.needsDate).toBe(1);
    expect(summary.legacy).toBe(3);
  });

  it("counts only LEGACY members — a Stripe member's Karma label is nobody's problem", () => {
    const summary = summariseMigration(
      [
        row({ id: "a", billingSource: "stripe", planConfirmed: false }),
        row({ id: "b", billingSource: "switch_pending", planConfirmed: false }),
      ],
      TODAY,
    );
    expect(summary.needsPlan).toBe(0);
  });
});

/*
  ── THE CARD ASKS THE SAME QUESTION THE RUNNER DOES ────────────────────────────

  The counter above is only worth reading if it names the SAME members the runner will refuse to
  price. A second opinion computed in the component — "no label means no plan", say — would put a
  different number on the screen from the one the office is bell about, and the difference would
  only show up as members quietly not moving.
*/
describe("the dashboard card's wiring", () => {
  const card = readFileSync(
    join(process.cwd(), "src/components/admin/dashboard/BillingMigrationProgress.tsx"),
    "utf8",
  );

  // STILL A SOURCE SCAN, and rightly so: this asserts WHERE the decision is made, which is not a
  // value any call can return. Everything the mapper actually DOES is executed below instead.
  it("builds its rows with the shared mapper rather than a closure of its own", () => {
    expect(card).toMatch(/toMigrationRow\(r as unknown as MemberProgressRow, resolveLegacyPlan\)/);
    expect(card).not.toMatch(/legacy_membership_type:/);
  });

  it("decides the plan through the one shared module, not its own rule", () => {
    expect(card).toMatch(/from "\.\.\/\.\.\/\.\.\/\.\.\/supabase\/functions\/_shared\/legacy-plan"/);
  });

  it("loads Karma's label, which is what the plan is read from", () => {
    expect(card).toContain("crm_profiles (legacy_membership_type, legacy_payment_type)");
  });

  it("shows the queue rather than leaving it to the runner's bell", () => {
    expect(card).toContain("migration-needs-plan");
    expect(card).toMatch(/summary\.needsPlan > 0/);
  });
});

/*
  ── THE ROW ITSELF, BUILT AND THEN RUN THROUGH THE RULE ────────────────────────

  Everything above this point tested the exclusion on rows a test invented. That proves the rule
  and not the wiring, and the wiring is where the money is: `toMigrationRow` is what turns what
  PostgREST returns into the `billingSource` the export reads. While it was a closure inside the
  card's queryFn the only assertions that could reach it were regexes over the file, so a mapper
  that read the wrong column would have passed every test in this suite and put a member who had
  already paid Stripe back onto the bank sheet.

  So these drive a DATABASE-SHAPED row all the way to the CSV.
*/
describe("the row the export decides from", () => {
  const dbRow = (over: Record<string, unknown> = {}) => ({
    id: "m-db-1",
    first_name: "Brenda",
    last_name: "Colefax",
    email: "brenda@example.com",
    phone: "+34600000001",
    billing_source: "legacy",
    legacy_billing_day: 15,
    legacy_next_renewal: "2026-09-15",
    switch_expires_at: null,
    subscriptions: [
      { plan_type: "single", amount: 29.95, billing_frequency: "monthly", created_at: "2024-01-01" },
    ],
    crm_profiles: { legacy_membership_type: "Single", legacy_payment_type: "Monthly" },
    ...over,
  }) as never;

  const build = (over: Record<string, unknown> = {}) => toMigrationRow(dbRow(over), resolveLegacyPlan);

  // THE ONE THAT COSTS MONEY.
  it("keeps a switch_pending member OUT of the bank collection, from the database row up", () => {
    const rows = [build(), build({ id: "m-db-2", billing_source: "switch_pending" })];
    const csv = santanderExportCsv(rows, TODAY);

    expect(csv).toContain("m-db-1");
    expect(csv).not.toContain("m-db-2");
  });

  it("and a legacy member IS on it — so that exclusion is not vacuous", () => {
    const csv = santanderExportCsv([build()], TODAY);
    expect(csv).toContain("m-db-1");
    expect(csv).toContain("29.95");
    expect(csv).toContain("Single");
  });

  it("counts a stripe member as moved rather than as still owing the bank", () => {
    const summary = summariseMigration([build({ billing_source: "stripe" })], TODAY);
    expect(summary.stripe).toBe(1);
    expect(summary.legacy).toBe(0);
    expect(santanderExportCsv([build({ billing_source: "stripe" })], TODAY)).not.toContain("m-db-1");
  });

  /*
    PostgREST returns a one-to-one embed as an OBJECT and a one-to-many as an ARRAY, and which one
    it picks depends on a unique index in the database rather than on anything in this query — so
    it can change without this file being touched. Both shapes, both embeds, actually run.
  */
  it("reads the profile whether PostgREST sends an object or an array", () => {
    const asObject = build({ crm_profiles: { legacy_membership_type: "Couple", legacy_payment_type: "Monthly" } });
    const asArray = build({ crm_profiles: [{ legacy_membership_type: "Couple", legacy_payment_type: "Monthly" }] });

    expect(asObject.legacyPlanLabel).toBe("Couple");
    expect(asArray.legacyPlanLabel).toBe("Couple");
    expect(asObject.planConfirmed).toBe(true);
    expect(asArray.planConfirmed).toBe(true);
  });

  it("reads the subscription whether PostgREST sends an object or an array", () => {
    const one = { plan_type: "single", amount: 41.5, billing_frequency: "monthly", created_at: "2024-01-01" };
    expect(build({ subscriptions: one }).amount).toBe(41.5);
    expect(build({ subscriptions: [one] }).amount).toBe(41.5);
  });

  // A member who was re-signed carries two rows, and the older one can hold a price they stopped
  // paying years ago. Collecting it would be the wrong amount out of a real bank account.
  it("takes the NEWEST subscription, not whichever row arrived first", () => {
    const row = build({
      subscriptions: [
        { plan_type: "single", amount: 19.95, billing_frequency: "monthly", created_at: "2019-04-01" },
        { plan_type: "couple", amount: 44.95, billing_frequency: "monthly", created_at: "2025-08-01" },
      ],
    });
    expect(row.amount).toBe(44.95);
    expect(row.billingFrequency).toBe("monthly");
  });

  it("survives a member with no subscription and no profile, without inventing either", () => {
    const row = build({ subscriptions: [], crm_profiles: null });
    expect(row.amount).toBeNull();
    expect(row.billingFrequency).toBeNull();
    expect(row.legacyPlanLabel).toBeNull();
    expect(row.planConfirmed).toBe(false);

    // And the sheet says so rather than guessing a plan for somebody nobody has established one for.
    const csv = santanderExportCsv([row], TODAY);
    expect(csv.split("\r\n")[1]).toContain(",,");
  });

  it("puts a member with no plan into the queue the runner will refuse to price", () => {
    const summary = summariseMigration([build({ crm_profiles: null, subscriptions: [] })], TODAY);
    expect(summary.needsPlan).toBe(1);
  });

  it("does not print the word undefined into a name when half of one is missing", () => {
    expect(build({ last_name: null }).name).toBe("Brenda");
    expect(build({ first_name: null, last_name: null }).name).toBe("");
  });

  it("carries the lapse date through, so a dead link is counted as one", () => {
    const row = build({
      billing_source: "switch_pending",
      switch_expires_at: "2026-09-01T00:00:00.000Z",
    });
    expect(summariseMigration([row], TODAY).lapsed).toBe(1);
  });
});
