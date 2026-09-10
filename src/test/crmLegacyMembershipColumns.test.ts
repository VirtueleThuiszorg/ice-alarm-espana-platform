// @vitest-environment node
//
// D-19 item 1: the three legacy membership facts get columns.
//
// They were one member note, because `crm_profiles` had no column for any of them. Lee's ruling
// of 2026-09-10 gave them columns; this holds the four things that ruling has to be true of:
//
//   1. the migration creates them, with `legacy_date_joined` a DATE and the other two text;
//   2. the mapper writes them, and the plan carries no key `crm_profiles` does not have;
//   3. the import stops ADDING the note, and does not start deleting the ones already written;
//   4. the backfill reads the note format the import actually produced.
//
// (4) is the one worth writing a test for at all: the backfill regexes are matched against the
// literal string the previous version of the writer produced, taken from the writer's own test
// rather than retyped — a backfill matched against a remembered format is a backfill that
// silently finds nothing.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const FILE = "20260910150000_crm_profile_legacy_membership.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");

describe("the migration", () => {
  it("exists exactly once", () => {
    const matching = readdirSync(MIGRATIONS).filter((f) => f.includes("crm_profile_legacy"));
    expect(matching).toEqual([FILE]);
  });

  it("adds the three columns, idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS legacy_membership_type\s+text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS legacy_payment_type\s+text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS legacy_date_joined\s+date/);
  });

  it("gives the date a DATE type and not text", () => {
    // The mapper parses it through parseIceDate and passes null when the value was ambiguous.
    // A text column would have accepted "12/06/19" and made the ambiguity permanent.
    expect(sql).not.toMatch(/legacy_date_joined\s+text/);
  });

  it("carries a rollback", () => {
    expect(sql).toMatch(/ROLLBACK:/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS legacy_membership_type/);
  });

  it("comments every column, so the next reader knows these are Karma's words", () => {
    for (const c of ["legacy_membership_type", "legacy_payment_type", "legacy_date_joined"]) {
      expect(sql).toContain(`COMMENT ON COLUMN public.crm_profiles.${c}`);
    }
  });

  it("backfills only where the column is still NULL", () => {
    // Run twice, change nothing the second time — and never overwrite a value somebody has
    // since corrected by hand.
    expect(sql).toMatch(/COALESCE\(p\.legacy_membership_type, note\.membership_type\)/);
    expect(sql).toMatch(/COALESCE\(p\.legacy_payment_type,\s+note\.payment_type\)/);
    expect(sql).toMatch(/COALESCE\(p\.legacy_date_joined,\s+note\.date_joined::date\)/);
  });

  it("leaves the notes it reads in place", () => {
    // The note is the only copy if a pattern here is wrong, and it is what a human reads on the
    // record. An import that deletes is an import nobody can run twice with confidence.
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.member_notes/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.member_notes/i);
  });

  it("reports how many rows it touched", () => {
    // A silent backfill and a backfill that matched nothing look identical in the run log.
    expect(sql).toMatch(/GET DIAGNOSTICS/);
    expect(sql).toMatch(/RAISE NOTICE/);
  });
});

describe("the backfill patterns match the note the import actually wrote", () => {
  /**
   * The exact string the previous writer produced. Reconstructed here in the same shape the
   * code built it — `Karma CRM membership: ` + the present clauses joined with "; " — because a
   * backfill matched against a half-remembered format finds nothing and says so in a NOTICE
   * nobody reads.
   */
  const note = (parts: string[]) => `Karma CRM membership: ${parts.join("; ")}`;

  /** The three regexes, lifted out of the SQL rather than retyped, so they cannot drift. */
  const patternFor = (name: string) => {
    // Escaped once for the string and once for the regex: the SQL literally reads
    //   substring(n.content from 'membership type ([^;]+)') AS membership_type
    const m = sql.match(
      new RegExp("substring\\(n\\.content from '([^']+)'\\)\\s+AS " + name)
    );
    expect(m, `no pattern for ${name} in the migration`).toBeTruthy();
    return new RegExp(m![1]);
  };

  const membership = patternFor("membership_type");
  const payment = patternFor("payment_type");
  const joined = patternFor("date_joined");

  it("finds all three when all three were present", () => {
    const n = note(["membership type Couple 2 pendants", "payment type DD", "joined 2019-04-01"]);
    expect(n.match(membership)?.[1]).toBe("Couple 2 pendants");
    expect(n.match(payment)?.[1]).toBe("DD");
    expect(n.match(joined)?.[1]).toBe("2019-04-01");
  });

  it("finds the one that was present when the others were not", () => {
    // Each clause was written only when the CRM had a value, so all three are independent.
    expect(note(["payment type TVP"]).match(payment)?.[1]).toBe("TVP");
    expect(note(["payment type TVP"]).match(membership)).toBeNull();
    expect(note(["joined 2020-01-31"]).match(joined)?.[1]).toBe("2020-01-31");
  });

  it("stops the membership type at the clause boundary, not at the end of the note", () => {
    // `[^;]+` and not `.+`: the greedy version would have swallowed "; payment type DD" into
    // the membership type for every row that had both, which is 128 of them.
    const n = note(["membership type Single", "payment type DD"]);
    expect(n.match(membership)?.[1]).toBe("Single");
  });

  it("takes no date from a note whose date was never written", () => {
    expect(note(["membership type Single"]).match(joined)).toBeNull();
  });

  it("takes only an ISO date, so a stray word cannot reach a DATE column", () => {
    // The writer only ever put an ISO date there (parseIceDate's output), but the cast is
    // unguarded — `::date` on "the war years" would abort the whole migration.
    expect(note(["joined sometime in 2019"]).match(joined)).toBeNull();
  });
});
