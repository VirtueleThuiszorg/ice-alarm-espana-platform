// @vitest-environment node
//
// THE TWO COLUMNS THE BILLING MIGRATION RUNS ON — item 1 of the Stripe migration goal.
//
// `legacy_billing_day` and `legacy_next_renewal` decide when each of the 431 imported members is
// asked to move onto Stripe. What this file pins is the part a unit test of the date rule cannot
// reach: that the migration actually creates them with the constraint, the index and the guard;
// and that the members list can find the members who still have neither.
//
// Every assertion below runs against SQL with comments STRIPPED. A previous test in this repo
// passed by matching a phrase in a migration's header comment, so two mutants — one dropping a
// predicate, one making an index case-sensitive — survived. A comment is documentation; only a
// statement is behaviour.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const FILE = "20260911100000_legacy_billing_date.sql";
const raw = readFileSync(join(MIGRATIONS, FILE), "utf8");
/** Statements only. See the header: a phrase in a comment is not a behaviour. */
const sql = raw.replace(/^\s*--.*$/gm, "");

describe("the migration", () => {
  it("exists exactly once", () => {
    const matching = readdirSync(MIGRATIONS).filter((f) => f.includes("legacy_billing_date"));
    expect(matching).toEqual([FILE]);
  });

  it("adds both columns, idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS legacy_billing_day\s+integer/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS legacy_next_renewal\s+date/);
  });

  // A text column would have accepted "15th" and pushed the parsing problem into every reader.
  it("makes the day an integer and the renewal a date, not text", () => {
    expect(sql).not.toMatch(/legacy_billing_day\s+text/);
    expect(sql).not.toMatch(/legacy_next_renewal\s+text/);
  });

  it("constrains the day to a day of the month, and still allows NULL", () => {
    expect(sql).toMatch(/CHECK \(legacy_billing_day IS NULL OR \(legacy_billing_day BETWEEN 1 AND 31\)\)/);
  });

  // NULL is the "needs a billing date" queue. NOT NULL would have forced the import to invent a
  // day for every row Karma left blank, which is the one outcome this whole feature avoids.
  it("does NOT make the day NOT NULL", () => {
    expect(sql).not.toMatch(/legacy_billing_day\s+integer\s+NOT NULL/);
  });

  it("indexes what the runner asks for: legacy members by renewal date", () => {
    const stmt = sql.match(/CREATE INDEX IF NOT EXISTS members_legacy_renewal_idx[\s\S]*?;/);
    expect(stmt).not.toBeNull();
    expect(stmt![0]).toContain("(legacy_next_renewal)");
    expect(stmt![0]).toMatch(/WHERE billing_source = 'legacy'/);
  });

  it("indexes the queue as well: legacy members with no day yet", () => {
    const stmt = sql.match(/CREATE INDEX IF NOT EXISTS members_legacy_needs_date_idx[\s\S]*?;/);
    expect(stmt).not.toBeNull();
    expect(stmt![0]).toMatch(/WHERE billing_source = 'legacy' AND legacy_billing_day IS NULL/);
  });

  it("carries a rollback naming everything it created", () => {
    expect(raw).toMatch(/ROLLBACK:/);
    for (const s of [
      "DROP TRIGGER IF EXISTS guard_member_billing_self_write",
      "DROP FUNCTION IF EXISTS public.guard_member_billing_self_write",
      "DROP INDEX IF EXISTS public.members_legacy_renewal_idx",
      "DROP INDEX IF EXISTS public.members_legacy_needs_date_idx",
      "DROP COLUMN IF EXISTS legacy_next_renewal",
      "DROP COLUMN IF EXISTS legacy_billing_day",
    ]) {
      expect(raw).toContain(s);
    }
  });

  it("comments both columns, so the next reader knows NULL is a queue and not an error", () => {
    expect(sql).toContain("COMMENT ON COLUMN public.members.legacy_billing_day");
    expect(sql).toContain("COMMENT ON COLUMN public.members.legacy_next_renewal");
  });
});

describe("the guard a member cannot get past", () => {
  it("fires on all three billing columns", () => {
    const trg = sql.match(/CREATE TRIGGER guard_member_billing_self_write[\s\S]*?;/);
    expect(trg).not.toBeNull();
    expect(trg![0]).toMatch(
      /BEFORE UPDATE OF billing_source, legacy_billing_day, legacy_next_renewal ON public\.members/,
    );
  });

  // `billing_source` is in the list for the reason that matters most: a member who sets their own
  // to `legacy` is exempt from renewal and payment-failed chasing altogether.
  it("covers billing_source and not only the two new columns", () => {
    expect(sql).toMatch(/NEW\.billing_source\s+IS NOT DISTINCT FROM OLD\.billing_source/);
  });

  it("lets service_role through — the webhook, the import and the runner have no auth.uid()", () => {
    expect(sql).toMatch(/IF auth\.uid\(\) IS NULL THEN\s*\n\s*RETURN NEW;/);
  });

  it("lets staff through, because correcting these by hand is the feature", () => {
    expect(sql).toMatch(/IF public\.is_staff\(auth\.uid\(\)\) THEN\s*\n\s*RETURN NEW;/);
  });

  it("raises insufficient_privilege for everybody else", () => {
    expect(sql).toMatch(/RAISE EXCEPTION[\s\S]*?USING ERRCODE = 'insufficient_privilege'/);
  });

  // The RLS harness is where this is actually EXECUTED — ten assertions against real PostgreSQL,
  // because a string in a migration file proves the text and not the behaviour.
  it("is executed against real PostgreSQL in the isolation harness", () => {
    const iso = readFileSync(join(process.cwd(), "scripts/rls/isolation.sql"), "utf8");
    expect(iso).toContain("a MEMBER CANNOT set their own Santander billing day");
    expect(iso).toContain("a MEMBER CANNOT exempt themselves from billing by claiming to be legacy");
    expect(iso).toContain("STAFF CAN correct a legacy billing date");
    expect(iso).toContain("a day outside 1-31 is refused even from staff");
  });
});

describe("the members list can find who still needs a date", () => {
  const page = readFileSync(join(process.cwd(), "src/pages/admin/MembersPage.tsx"), "utf8");

  it("offers the filter", () => {
    expect(page).toContain('data-testid="billing-source-filter"');
    expect(page).toContain('<SelectItem value="needs_date">Needs a billing date</SelectItem>');
  });

  // `.eq(..., null)` becomes `= NULL` in PostgREST and matches nothing — an empty queue that
  // looks like a finished one, which is the worst possible failure for this particular screen.
  it("uses .is() for the NULL test, never .eq()", () => {
    expect(page).toContain('.is("legacy_billing_day", null)');
    expect(page).not.toContain('.eq("legacy_billing_day", null)');
  });

  it("filters in the DATABASE, so it reaches past page one of 431", () => {
    expect(page).toMatch(
      /query = query\.eq\("billing_source", "legacy"\)\.is\("legacy_billing_day", null\)/,
    );
  });

  it("re-runs the query when the filter changes", () => {
    expect(page).toMatch(/queryKey: \["admin-members",[^\]]*billingFilter/);
  });
});
