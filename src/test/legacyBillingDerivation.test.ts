// @vitest-environment node
//
// THE SANTANDER DATE, DERIVED FROM THE REAL EXPORT SHAPE.
//
// `src/test/legacyBillingSchedule.test.ts` pins the date rule itself. This one pins the WIRING:
// that the mapper reads the right Karma column for the right kind of member, that the write plan
// carries the answer to the database, and that a row nobody can work out lands as NULL rather
// than as a guess.
//
// The case that would be silent if it broke is the annual member with a stray `Monthly Payment
// Date`. Karma's export has them: somebody typed a day into the column years ago and the
// membership later changed to annual. Reading it would give that member a monthly schedule, and
// the billing-migration runner would write to them eleven months before their renewal.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv, parseCsv, type MappedRow } from "../lib/iceCrmImport";
import { planRowWrites } from "../lib/crmImportWriter";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const CSV = readFileSync(FIXTURE, "utf8");
const HEADERS = parseCsv(CSV).headers;

// A FIXED "today", because a schedule is relative to one and a suite that passes in September
// and fails in October has proved nothing.
const TODAY = new Date("2026-09-11T00:00:00.000Z");

const rows = mapIceCsv(CSV, TODAY);
const byId = (id: string): MappedRow => {
  const r = rows.find((x) => x.sourceId === id);
  if (!r) throw new Error(`no fixture row ${id}`);
  return r;
};

/** A row of the real 147-column shape with only the named columns filled. */
function rowWith(values: Record<string, string>, today = TODAY): MappedRow {
  const cells = HEADERS.map((h) => values[h] ?? "");
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [HEADERS.map(cell).join(","), cells.map(cell).join(",")].join("\r\n");
  const mapped = mapIceCsv(csv, today);
  expect(mapped.length).toBe(1);
  return mapped[0];
}

describe("a monthly member's day comes from Monthly Payment Date", () => {
  it("reads a bare day and works out the next debit", () => {
    const m = byId("9001").member;
    expect(m.legacy_billing_day).toBe(15);
    expect(m.legacy_next_renewal).toBe("2026-09-15");
  });

  it("reads an ordinal, and keeps 31 as 31 in a 30-day month", () => {
    const m = byId("9002").member;
    expect(m.legacy_billing_day).toBe(31);
    // September has 30 days, and the 31st has already gone past the 11th, so the next debit is
    // the last day of THIS month — not 1 October and not an error.
    expect(m.legacy_next_renewal).toBe("2026-09-30");
  });

  it("clamps into February rather than rolling into March", () => {
    const m = rowWith(
      { "First Name": "Feb", "Last Name": "Clamp", "Monthly Payment Date": "31", "Payment Type": "Monthly" },
      new Date("2027-02-05T00:00:00.000Z"),
    ).member;
    expect(m.legacy_billing_day).toBe(31);
    expect(m.legacy_next_renewal).toBe("2027-02-28");
  });
});

describe("an annual member's date comes from Date Joined", () => {
  it("is the anniversary, and the day is the anniversary's day", () => {
    const m = byId("9004").member;
    expect(m.legacy_billing_day).toBe(4); // 4 November
    expect(m.legacy_next_renewal).toBe("2026-11-04");
  });

  // THE ONE THAT WOULD BE SILENT. 9009 is annual and carries `Monthly Payment Date` = 20.
  it("IGNORES a stray Monthly Payment Date on an annual member", () => {
    const m = byId("9009").member;
    expect(m.legacy_billing_day).toBe(12); // 12 March, from Date Joined
    expect(m.legacy_next_renewal).toBe("2027-03-12");
    expect(m.legacy_billing_day).not.toBe(20);
  });
});

describe("a row nobody can work out becomes a queue, not a guess", () => {
  it("leaves both columns null when Monthly Payment Date is not a day", () => {
    const m = byId("9007").member; // "monthly"
    expect(m.legacy_billing_day).toBeNull();
    expect(m.legacy_next_renewal).toBeNull();
  });

  it("leaves both columns null when the row says nothing at all", () => {
    const m = byId("9003").member;
    expect(m.legacy_billing_day).toBeNull();
    expect(m.legacy_next_renewal).toBeNull();
  });

  it("leaves an annual member with no Date Joined for a human", () => {
    const m = rowWith({
      "First Name": "No",
      "Last Name": "Anniversary",
      "Payment Type": "Annual",
      "Monthly Payment Date": "20",
    }).member;
    expect(m.legacy_billing_day).toBeNull();
    expect(m.legacy_next_renewal).toBeNull();
  });
});

describe("the write plan carries the schedule to the database", () => {
  it("puts both columns on the member insert", () => {
    const plan = planRowWrites(byId("9001"));
    expect(plan.outcome).toBe("member");
    expect(plan.member?.legacy_billing_day).toBe(15);
    expect(plan.member?.legacy_next_renewal).toBe("2026-09-15");
  });

  // The plan for a row that cannot become a member still carries what it parsed, because
  // `memberPatchFor` fills these on a member the platform ALREADY HOLDS — which is how anybody
  // imported before this column existed gets a date at all.
  it("keeps them on parsedMember even when the row cannot become a member", () => {
    const plan = planRowWrites(
      rowWith({
        "First Name": "Patch",
        "Last Name": "Only",
        "Monthly Payment Date": "9",
        "Payment Type": "Monthly",
      }),
    );
    expect(plan.outcome).toBe("crm_contact");
    expect(plan.parsedMember.legacy_billing_day).toBe(9);
    expect(plan.parsedMember.legacy_next_renewal).toBe("2026-10-09");
  });

  it("never invents a schedule for a row that has none", () => {
    const plan = planRowWrites(byId("9007"));
    expect(plan.parsedMember.legacy_billing_day).toBeNull();
    expect(plan.parsedMember.legacy_next_renewal).toBeNull();
  });
});
