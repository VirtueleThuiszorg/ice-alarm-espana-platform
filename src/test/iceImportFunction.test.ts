/**
 * WP-D — the single-member import function's contract.
 *
 * Lee's decision (2026-09-02): members are added one at a time, by hand. That
 * makes public.ice_import_member the entire write path, so its contract is
 * worth pinning rather than trusting.
 *
 * These are static assertions over the migration SQL, matching the house
 * pattern (vitest has no database). The behavioural proof is
 * `scripts/verify-ice-import.sh`, which applies the migrations to a throwaway
 * Postgres, maps Daisy Wakeman out of the real 431-row export and imports her.
 * That script was run on 2026-09-02 and confirmed:
 *
 *   - a call_centre user is refused: "ice_import_member: admin role required"
 *   - an admin import creates the member and 8 related rows
 *   - re-importing the same CRM row returns created:false, no duplicate
 *   - DOB 2009-07-15 (not 7 Jan), home address Almeria (not the Albox postal
 *     one), postal address in member_addresses, IMEI 862311069177838 split
 *     from docking MAC E1:DE:86:46:39:96, pendant SIM kept on the device,
 *     subscription single/annual/PENDING with is_free_of_charge true
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

function migration(prefix: string): string {
  const f = readdirSync(MIGRATIONS).find((m) => m.startsWith(prefix));
  expect(f, `migration ${prefix}* must exist`).toBeDefined();
  return readFileSync(join(MIGRATIONS, f!), "utf8");
}

const FN = () => migration("20260903092000_ice_import_member_fn");

describe("ice_import_member is admin-gated", () => {
  it("checks is_admin and raises rather than silently doing nothing", () => {
    expect(FN()).toMatch(/IF NOT public\.is_admin\(auth\.uid\(\)\) THEN\s*\n\s*RAISE EXCEPTION/);
  });

  it("is SECURITY DEFINER with a pinned search_path", () => {
    const sql = FN();
    expect(sql).toMatch(/SECURITY DEFINER/);
    // Without this a caller can shadow the objects the function resolves.
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
  });

  it("is not executable by anon or public", () => {
    const sql = FN();
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.ice_import_member\(jsonb\) FROM public/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.ice_import_member\(jsonb\) FROM anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.ice_import_member\(jsonb\) TO authenticated/);
  });
});

describe("ice_import_member cannot create a duplicate member", () => {
  it("returns the existing member when the CRM row was already imported", () => {
    const sql = FN();
    expect(sql).toMatch(/WHERE crm_source = v_source AND crm_source_id = v_source_id/);
    expect(sql).toMatch(/'created', false/);
  });

  it("refuses a payload with no CRM provenance", () => {
    expect(FN()).toMatch(/IF v_source_id IS NULL OR v_source IS NULL THEN\s*\n\s*RAISE EXCEPTION/);
  });
});

describe("golden rule 3/4: an import does not activate anybody", () => {
  it("inserts the subscription as pending, never active", () => {
    const sql = FN();
    // The literal status written by the function.
    expect(sql).toMatch(/COALESCE\(\(s->>'billing_frequency'\)::billing_frequency, 'annual'\),\s*\n\s*'pending',/);
    expect(sql).not.toMatch(/'active'::subscription_status/);
  });

  it("explains why, so nobody 'fixes' it to active without thinking", () => {
    expect(FN()).toMatch(/SUBSCRIPTION STATUS/);
  });
});

describe("a half-imported member is not possible", () => {
  it("is one plpgsql function, so all inserts share one transaction", () => {
    const sql = FN();
    expect(sql).toMatch(/LANGUAGE plpgsql/);
    // No COMMIT inside — that would break the atomicity the design relies on.
    expect(sql).not.toMatch(/\bCOMMIT\b/);
  });

  it("warns instead of aborting when the pendant is already on record", () => {
    const sql = FN();
    expect(sql).toMatch(/already on record, not reassigned/);
  });
});

describe("the function writes the tables the operator card reads", () => {
  it.each([
    "members",
    "crm_profiles",
    "medical_information",
    "emergency_contacts",
    "member_contact_methods",
    "member_addresses",
    "member_access",
    "member_end_of_life",
    "devices",
    "subscriptions",
    "member_notes",
  ])("inserts into %s", (table) => {
    expect(FN()).toMatch(new RegExp(`INSERT INTO ${table}\\b`));
  });
});

describe("the import function can be redeployed", () => {
  it("is CREATE OR REPLACE", () => {
    expect(FN()).toMatch(/CREATE OR REPLACE FUNCTION public\.ice_import_member/);
  });
});
