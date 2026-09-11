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
import {
  santanderExportCsv,
  summariseMigration,
  type MigrationRow,
} from "@/lib/billingMigrationProgress";

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
