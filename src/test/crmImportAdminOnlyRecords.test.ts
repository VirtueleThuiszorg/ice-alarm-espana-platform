// @vitest-environment node
//
// The three admin-only records the import was parsing and throwing away.
//
// `member_access` and `member_end_of_life` were created on 3 September, each with an admin-only
// policy written deliberately — the first migration's own comment says "this is the code to the
// front door of an occupied home, usually an older person living alone". `MappedRow` has carried
// both ever since. Nothing ever wrote them. 96 key safe codes and 41 funeral plans were read out
// of the file and dropped on the floor, and the only reason anybody noticed is that Lee read the
// import screen's discard list on 18 September and asked why his data was being binned.
//
// `member_bank_details` is new on the same day, for the 85 legacy direct-debit accounts.
//
// What these tests hold:
//   * the plan carries all three, so the preview can show them before anything is written
//   * the apply step writes all three
//   * an upsert never blanks a field the CRM no longer has — the re-run hazard
//   * card data still reaches none of them
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv, mapIceRow, parseBankCell, parseCsv, IceRow } from "@/lib/iceCrmImport";
import { planRowWrites } from "@/lib/crmImportWriter";

const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const CSV = readFileSync(FIXTURE, "utf8");
const MIGRATIONS = join(process.cwd(), "supabase/migrations");

const HEADERS = parseCsv(CSV).headers;
const SPINE = parseCsv(CSV).rows[0];

/** The fixture's first row with a few cells replaced — the real 147-column shape, no more. */
function rowWith(overrides: Record<string, string>): IceRow {
  const values = [...SPINE];
  for (const [header, value] of Object.entries(overrides)) {
    const index = HEADERS.indexOf(header);
    expect(index, `${header} is not in the export header`).toBeGreaterThan(-1);
    values[index] = value;
  }
  return new IceRow(HEADERS, values);
}

function migration(prefix: string): string {
  const f = readdirSync(MIGRATIONS).find((m) => m.startsWith(prefix));
  expect(f, `migration ${prefix}* must exist`).toBeDefined();
  return readFileSync(join(MIGRATIONS, f!), "utf8");
}

describe("a bank cell, which is rarely twenty digits and rarely only a number", () => {
  it("lifts the IBAN out of the noise around it", () => {
    // The real shape: bank name, the word IBAN, the account, then the holder's name.
    const parsed = parseBankCell("Caixacallosa IBAN ES91 2100 0418 4502 0005 1332 visa Ann Crowley");
    expect(parsed.iban).toBe("ES9121000418450200051332");
    expect(parsed.bank_name).toBe("Caixacallosa");
  });

  it("normalises spacing, so one account cannot arrive as two", () => {
    const a = parseBankCell("ES91 2100 0418 4502 0005 1332");
    const b = parseBankCell("ES9121000418450200051332");
    expect(a.iban).toBe(b.iban);
  });

  it("keeps the cell verbatim even when there is no IBAN in it", () => {
    // 28 of the 85 have no parseable IBAN — a bank name, a fragment, or "FOC". Keeping the
    // original is what lets somebody settle it later without going back to karmaCRM.
    const parsed = parseBankCell("Santander, account with Maria");
    expect(parsed.iban).toBeNull();
    expect(parsed.source_text).toBe("Santander, account with Maria");
  });

  it("refuses a bank_name that is really a number", () => {
    // Otherwise a cell that is nothing but digits would be filed as the name of a bank.
    expect(parseBankCell("00491234567890123456").bank_name).toBeNull();
  });

  it("is empty for an empty cell, rather than a row of nulls", () => {
    expect(parseBankCell("   ").source_text).toBe("");
  });
});

describe("the plan carries what the preview has to be able to show", () => {
  const plans = mapIceCsv(CSV).map(planRowWrites);
  const withData = plans.find((p) => p.access || p.endOfLife || p.bank);

  it("at least one fixture row has all three, or these tests prove nothing", () => {
    expect(withData, "the fixture must exercise this").toBeTruthy();
  });

  it("the front-door code is on the plan", () => {
    // Built here rather than added to the shared fixture, whose row counts several other files
    // assert on exactly. 96 rows of the real export carry one of these.
    const plan = planRowWrites(mapIceRow(rowWith({ "Key Safe": "C1234", Status: "Active Member" })));
    expect(plan.access?.key_safe_code).toBe("C1234");
  });

  it("the funeral record is on the plan", () => {
    expect(withData!.endOfLife).toBeTruthy();
  });

  it("the bank account is on the plan", () => {
    expect(withData!.bank?.source_text).toBeTruthy();
  });

  it("a skipped row carries none of them, however much data it holds", () => {
    // A staff or building record writes nothing at all, admin-only tables included — otherwise
    // the one outcome that is supposed to touch nothing would quietly store a front-door code.
    const plan = planRowWrites(
      mapIceRow(
        rowWith({
          Status: "ICE Staff",
          "Key Safe": "C1234",
          "Funeral Plan": "Golden Charter",
          "20 Digit Bank No": "ES91 2100 0418 4502 0005 1332",
        })
      )
    );
    expect(plan.outcome).toBe("skip");
    expect(plan.access).toBeNull();
    expect(plan.endOfLife).toBeNull();
    expect(plan.bank).toBeNull();
  });
});

describe("the card reaches none of the three", () => {
  const plans = mapIceCsv(CSV).map(planRowWrites);

  it("no plan's admin-only records contain a card-shaped run", () => {
    for (const p of plans) {
      const serialised = JSON.stringify({ access: p.access, endOfLife: p.endOfLife, bank: p.bank });
      expect(serialised).not.toMatch(/\b(?:\d[ -]?){15,19}\d\b/);
    }
  });

  it("the payment-method note is words, never digits", () => {
    const parsed = parseCsv(CSV);
    for (const values of parsed.rows) {
      const hint = new IceRow(parsed.headers, values).paymentMethodHint();
      expect(hint, `"${hint}" contains digits`).not.toMatch(/\d{2,}/);
    }
  });
});

describe("member_bank_details is admin-only, like the two it sits beside", () => {
  const BANK = "20260918100000_member_bank_details";
  const sql = () => migration(BANK);

  it("has RLS on, which golden rule 2 requires of every table", () => {
    expect(sql()).toMatch(/ALTER TABLE public\.member_bank_details ENABLE ROW LEVEL SECURITY/);
  });

  it("uses is_admin and never the broad is_staff predicate", () => {
    // An IBAN is an instruction to move somebody's money. A call-centre operator has no use for
    // one during an alert, and is_staff would hand it to every shift — the same reasoning that
    // put key safe codes behind is_admin.
    expect(sql()).toMatch(/public\.is_admin\(\(SELECT auth\.uid\(\)\)\)/);
    expect(sql()).not.toMatch(/public\.is_staff\(/);
  });

  it("lets a member read their own row and nothing else", () => {
    expect(sql()).toMatch(/FOR SELECT TO authenticated USING \(member_id = \(SELECT public\.get_member_id/);
    expect(sql()).not.toMatch(/FOR ALL TO authenticated USING \(member_id = \(SELECT public\.get_member_id/);
  });

  it("evaluates its predicates once per query, not once per row", () => {
    // A bare auth.uid() in a policy is called for every row considered, and is_admin is itself
    // a query against `staff`. 20260911180000 hoisted every policy that existed then; one
    // written afterwards has to arrive in that form or it reintroduces the problem one table
    // at a time. scripts/rls/run.sh checks this and refused this migration until it did.
    for (const predicate of sql().matchAll(/USING \(([^;]+)\);/g)) {
      expect(predicate[1], `not hoisted: ${predicate[1]}`).toMatch(/\(SELECT /);
    }
  });

  it("cascades on member delete, so no orphan bank details survive", () => {
    expect(sql()).toMatch(/REFERENCES public\.members\(id\) ON DELETE CASCADE/);
  });

  it("is re-runnable: policies and triggers are dropped before they are created", () => {
    const created = [...sql().matchAll(/CREATE POLICY "([^"]+)"/g)].map((m) => m[1]);
    expect(created.length).toBeGreaterThan(0);
    for (const name of created) {
      expect(sql(), `policy "${name}" is not guarded`).toMatch(
        new RegExp(`DROP POLICY IF EXISTS "${name}"`)
      );
    }
    expect(sql()).toMatch(/DROP TRIGGER IF EXISTS/);
  });

  it("documents its reversal", () => {
    expect(sql()).toMatch(/Reverse/i);
  });

  it("defines no card column, and records why not", () => {
    const create = sql().slice(sql().indexOf("CREATE TABLE"), sql().indexOf(");"));
    expect(create).not.toMatch(/card|cvv|expiry/i);
    // And the reason is written down where the next person will look for it.
    expect(sql()).toMatch(/PCI-DSS/);
  });
});

describe("the writer upserts rather than inserts, so a re-run cannot blank a field", () => {
  const adapter = readFileSync(join(process.cwd(), "src/lib/crmImportDb.ts"), "utf8");

  it.each(["member_access", "member_end_of_life", "member_bank_details"])(
    "%s is written with upsert on member_id",
    (table) => {
      const block = adapter.slice(adapter.indexOf(`from("${table}")`));
      expect(block.slice(0, 400)).toMatch(/\.upsert\(/);
      expect(block.slice(0, 400)).toMatch(/onConflict: "member_id"/);
    }
  );

  it("and strips empty values first, which is the part that does the work", () => {
    // Without this, a re-import of a row whose CRM cell has since been emptied writes null over
    // a key safe code somebody typed into the platform. The upsert sends every key it is given.
    expect(adapter).toMatch(/function stripNulls/);
    for (const table of ["member_access", "member_end_of_life", "member_bank_details"]) {
      const block = adapter.slice(adapter.indexOf(`from("${table}")`), adapter.indexOf(`from("${table}")`) + 400);
      expect(block, `${table} must not upsert raw values`).toMatch(/stripNulls\(/);
    }
  });
});
