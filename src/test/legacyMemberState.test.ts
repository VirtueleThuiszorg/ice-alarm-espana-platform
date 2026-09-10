// @vitest-environment node
//
// D-19 item 2: the state an imported member arrives in, and the ONE new way out of it.
//
// The rule, stated once so the rest of this file can be read against it:
//
//   imported            status = pending_review   billing_source = legacy
//   confirmed by staff  status = active            billing_source = legacy
//   paid via Stripe     status = active            billing_source = stripe
//
// `billing_source` is what keeps golden rule 4 intact while a second route to `active` exists.
// An active member is monitored either way; only `stripe` means this platform holds a billing
// relationship it can renew, dun or cancel.
//
// THE DATABASE HALF IS PROVEN IN `scripts/rls/isolation.sql`, not here — who may confirm, that a
// plain UPDATE to active is refused, that the permission slip does not leak to a second member,
// and that the paid-subscription route survived the guard being replaced. A CHECK constraint and
// a trigger cannot be proven against a fake. This file holds the parts that are decisions in
// TypeScript.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mapIceCsv } from "../lib/iceCrmImport";
import { planRowWrites, memberPatchFor } from "../lib/crmImportWriter";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const FILE = "20260910160000_legacy_member_state.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const FIXTURE = join(process.cwd(), "src/test/fixtures/ice-export-sensitive-fixture.csv");
const plans = mapIceCsv(readFileSync(FIXTURE, "utf8")).map(planRowWrites);
const members = plans.filter((p) => p.member !== null);

describe("what the import writes", () => {
  it("has members to assert about at all", () => {
    expect(members.length).toBeGreaterThan(0);
  });

  it("writes pending_review and legacy, on every member, with no exceptions", () => {
    for (const p of members) {
      expect(p.member!.status).toBe("pending_review");
      expect(p.member!.billing_source).toBe("legacy");
    }
  });

  it("writes 'active' nowhere in any planned row", () => {
    // Golden rule 4 as a sweep rather than a field check: whatever shape the plan grows, the
    // import may not assert an active membership anywhere in it.
    const serialised = JSON.stringify(plans);
    expect(serialised).not.toContain('"status":"active"');
    expect(serialised).not.toContain('"billing_source":"stripe"');
  });
});

describe("an existing member the import matches", () => {
  it("never has billing_source patched", () => {
    // The defect this pins: filling it on a member the platform already holds would flip a
    // Stripe-paying member to `legacy` — and a legacy member is exempt from renewal and
    // dunning, so the platform would quietly stop chasing money it is owed.
    const patch = memberPatchFor({ billing_source: null, city: null }, members[0]);
    expect(Object.keys(patch)).not.toContain("billing_source");
    expect(Object.keys(patch)).toContain("city");
  });

  it("never has status patched either, even from pending_review", () => {
    const patch = memberPatchFor({ status: null }, members[0]);
    expect(Object.keys(patch)).not.toContain("status");
  });
});

describe("the migration", () => {
  it("exists exactly once", () => {
    expect(readdirSync(MIGRATIONS).filter((f) => f.includes("legacy_member_state"))).toEqual([FILE]);
  });

  it("adds pending_review to the enum and USES it nowhere in the same transaction", () => {
    // Postgres refuses "unsafe use of new value of enum type" when a label is read in the
    // transaction that added it. Function BODIES are text at creation time and are fine; a
    // CHECK, a DEFAULT or a backfill naming it would abort the migration.
    expect(sql).toMatch(/ALTER TYPE public\.member_status ADD VALUE IF NOT EXISTS 'pending_review'/);
    // Comments are not uses — and this migration's header explains the rule at length, so the
    // count is taken with the comments stripped.
    const code = sql.replace(/^\s*--.*$/gm, "");
    const beforeFunctions = code.slice(0, code.indexOf("CREATE OR REPLACE FUNCTION"));
    const uses = beforeFunctions.match(/'pending_review'/g) ?? [];
    // Exactly one: the ADD VALUE itself.
    expect(uses.length).toBe(1);
  });

  it("constrains billing_source to the three values and defaults to stripe", () => {
    expect(sql).toMatch(/CHECK \(billing_source IN \('stripe', 'legacy', 'none'\)\)/);
    // A default of `legacy` would quietly exempt every member created by checkout from renewal.
    expect(sql).toMatch(/billing_source text NOT NULL DEFAULT 'stripe'/);
  });

  it("keeps the paid-subscription route the guard already had", () => {
    // 20260909110000 let staff reinstate a member who HAS an active/past_due subscription.
    // Replacing a function body is how a rule written three migrations ago disappears.
    expect(sql).toMatch(/s\.status IN \('active', 'past_due'\)/);
  });

  it("announces the confirm route with the member's id, not a boolean", () => {
    // A blanket "I am allowed" flag set once would unlock every row updated later in the same
    // transaction. Asserted live in the RLS harness; asserted here as the shape of the code.
    expect(sql).toMatch(/set_config\('app\.confirming_legacy_member', _member_id::text, true\)/);
    expect(sql).toMatch(
      /COALESCE\(current_setting\('app\.confirming_legacy_member', true\), ''\) = NEW\.id::text/
    );
  });

  it("clears the permission slip immediately after the write", () => {
    expect(sql).toMatch(/set_config\('app\.confirming_legacy_member', '', true\)/);
  });

  it("lets only admins and supervisors confirm", () => {
    expect(sql).toMatch(/NOT IN \('super_admin', 'admin', 'call_centre_supervisor'\)/);
  });

  it("confirms only a member the import left pending_review", () => {
    // Confirming an `inactive` member would reactivate a cancelled client; confirming a
    // `stripe` member would tell the platform to stop chasing a payment it is owed.
    expect(sql).toMatch(/IF v_old <> 'pending_review' THEN/);
  });

  it("writes an activity_logs row naming who and why", () => {
    expect(sql).toMatch(/INSERT INTO public\.activity_logs[\s\S]{0,400}member\.legacy_confirmed/);
    expect(sql).toMatch(/_reason/);
  });

  it("routes the bell event, having first added it to the CHECK list", () => {
    // `notification_routes.event_type` is CHECK-constrained, so an insert alone is refused —
    // which is the constraint working: an event nothing routes is an event nobody hears.
    const checkIndex = sql.indexOf("notification_routes_event_type_check CHECK");
    const insertIndex = sql.indexOf("INSERT INTO public.notification_routes");
    expect(checkIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(checkIndex);
    expect(sql).toMatch(/'member\.legacy_confirmed',\s*'push',\s*true/);
  });

  it("keeps the paid channels off — a confirmation is not worth a per-message bill", () => {
    for (const channel of ["sms", "whatsapp", "email"]) {
      expect(sql).toMatch(new RegExp(`'member\\.legacy_confirmed',\\s*'${channel}',\\s*false`));
    }
  });

  it("never raises from the bell trigger, so a bell cannot undo a confirmation", () => {
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN[\s\S]{0,300}RAISE WARNING/);
  });

  it("carries a rollback that points at the RIGHT previous guard body", () => {
    // Restoring 20260904180000's body would re-open the dropdown that 20260909110000 closed.
    expect(sql).toMatch(/ROLLBACK:/);
    expect(sql).toMatch(/20260909110000/);
  });
});
