/**
 * ICE import schema (WP-B) — guards the migration set that gives the KarmaCRM
 * export somewhere to land.
 *
 * These are static assertions over the migration SQL, matching the house
 * pattern in clientWriteSweep.test.ts: vitest has no database, so the thing we
 * can actually pin is the SQL that will run.
 *
 * Two guarantees matter more than the column lists:
 *
 *  1. Every new table has RLS. `CLAUDE.md` golden rule 2. The sweep below finds
 *     CREATE TABLE statements and fails if the matching ENABLE ROW LEVEL
 *     SECURITY is missing, so a table added to this set later cannot ship open.
 *
 *  2. member_access and member_end_of_life are ADMIN-ONLY and must not be
 *     reachable through the broad `is_staff` predicate the other member tables
 *     use. member_access holds front-door key safe codes for people living
 *     alone; widening that policy by copy-paste is exactly the mistake this
 *     test exists to catch.
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

const ICE_MIGRATIONS = [
  "20260903091000_ice_member_columns",
  "20260903091100_ice_crm_reconciliation",
  "20260903091200_ice_member_addresses",
  "20260903091300_ice_member_access",
  "20260903091400_ice_member_end_of_life",
  "20260903091500_ice_medical_extras",
  "20260903091600_ice_contact_type",
  "20260903091700_ice_subscription_billing",
  "20260903091800_ice_device_hardware",
];

describe("every ICE import migration exists and documents its reversal", () => {
  it.each(ICE_MIGRATIONS)("%s", (prefix) => {
    const sql = migration(prefix);
    expect(sql.length).toBeGreaterThan(0);
    // CLAUDE.md engineering bar: migrations reversible.
    expect(sql, `${prefix} must document reverse steps`).toMatch(/Reverse/i);
  });
});

describe("RLS on every new table (golden rule 2)", () => {
  it.each(ICE_MIGRATIONS)("%s enables RLS on any table it creates", (prefix) => {
    const sql = migration(prefix);
    const created = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map(
      (m) => m[1]
    );
    for (const table of created) {
      expect(
        sql,
        `${table} is created in ${prefix} but never gets ENABLE ROW LEVEL SECURITY`
      ).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      expect(sql, `${table} has no policies`).toMatch(
        new RegExp(`CREATE POLICY "[^"]+" ON public\\.${table}`)
      );
    }
  });
});

describe("key safe and end-of-life data are admin-only, not staff-wide", () => {
  it.each(["20260903091300_ice_member_access", "20260903091400_ice_member_end_of_life"])(
    "%s uses is_admin and never is_staff",
    (prefix) => {
      const sql = migration(prefix);
      expect(sql).toMatch(/public\.is_admin\(auth\.uid\(\)\)/);
      expect(
        sql,
        "restricted member data must not be readable via the broad is_staff predicate"
      ).not.toMatch(/public\.is_staff\(/);
    }
  );

  it("members may read their own restricted rows and nothing else", () => {
    for (const prefix of [
      "20260903091300_ice_member_access",
      "20260903091400_ice_member_end_of_life",
    ]) {
      const sql = migration(prefix);
      // Self-read is scoped by get_member_id, and is SELECT only — a member
      // must not be able to rewrite their own key safe record.
      expect(sql).toMatch(/FOR SELECT TO authenticated USING \(member_id = public\.get_member_id/);
      expect(sql).not.toMatch(/FOR ALL TO authenticated USING \(member_id = public\.get_member_id/);
    }
  });
});

describe("member_addresses keeps the ordinary member-table policy shape", () => {
  const sql = () => migration("20260903091200_ice_member_addresses");

  it("is staff-managed and member-readable", () => {
    expect(sql()).toMatch(/public\.is_staff\(auth\.uid\(\)\)/);
    expect(sql()).toMatch(/member_id = public\.get_member_id\(auth\.uid\(\)\)/);
  });

  it("does not accept an arbitrary address_type", () => {
    expect(sql()).toMatch(/CHECK \(address_type IN \([^)]*'postal'[^)]*\)\)/);
  });

  it("cascades on member delete so no orphan addresses survive", () => {
    expect(sql()).toMatch(/REFERENCES public\.members\(id\) ON DELETE CASCADE/);
  });
});

describe("re-import safety: a source row maps to exactly one record", () => {
  it("members are unique per (crm_source, crm_source_id)", () => {
    expect(migration("20260903091000_ice_member_columns")).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS members_crm_source_id_uniq[\s\S]*?ON public\.members\(crm_source, crm_source_id\)/
    );
  });

  it("crm_contacts are unique per (source, source_id)", () => {
    expect(migration("20260903091100_ice_crm_reconciliation")).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_source_uniq[\s\S]*?ON public\.crm_contacts\(source, source_id\)/
    );
  });
});

describe("columns the operator card and the import depend on", () => {
  it("members carries identity, provenance, location and deceased_at", () => {
    const sql = migration("20260903091000_ice_member_columns");
    for (const col of [
      "crm_source",
      "crm_source_id",
      "crm_created_at",
      "title",
      "nickname",
      "gender",
      "nationality",
      "marital_status",
      "passport_number",
      "an_ss_number",
      "county",
      "gps_lat",
      "gps_lng",
      "map_link",
      "language_notes",
      "consent_state",
      "deceased_at",
      "linked_member_id",
    ]) {
      expect(sql, `members.${col} missing`).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
    }
  });

  it("medical_information carries the operator-facing extras", () => {
    const sql = migration("20260903091500_ice_medical_extras");
    for (const col of [
      "mobility",
      "hearing_notes",
      "vision_notes",
      "meds_location",
      "meds_notes",
      "doctor_location",
      "private_insurer",
      "private_policy_number",
    ]) {
      expect(sql, `medical_information.${col} missing`).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`)
      );
    }
  });

  it("key holders are a contact type, not a separate table", () => {
    const sql = migration("20260903091600_ice_contact_type");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'emergency'/);
    expect(sql).toMatch(/CHECK \(contact_type IN \('emergency','key_holder'\)\)/);
  });

  it("FOC survives even though the payment columns are discarded", () => {
    expect(migration("20260903091700_ice_subscription_billing")).toMatch(
      /ADD COLUMN IF NOT EXISTS is_free_of_charge\s+boolean NOT NULL DEFAULT false/
    );
  });

  it("the docking station MAC gets its own column, not devices.imei", () => {
    expect(migration("20260903091800_ice_device_hardware")).toMatch(
      /ADD COLUMN IF NOT EXISTS docking_station_mac text/
    );
  });
});

describe("the plan_type enum is not quietly extended", () => {
  it("legacy membership labels are stored as text, not new enum values", () => {
    const sql = migration("20260903091700_ice_subscription_billing");
    expect(sql).toMatch(/legacy_membership_label text/);
    // "Emergency Response (Standard)" etc. are product decisions nobody has
    // taken. Adding them to plan_type would invent product in a migration.
    expect(sql).not.toMatch(/ALTER TYPE .*plan_type/);
  });
});

describe("these migrations are re-runnable", () => {
  // Found by applying the set three times against a real Postgres on
  // 2026-09-02: CREATE TRIGGER and CREATE POLICY are not idempotent even when
  // the table is created with IF NOT EXISTS, so the second run failed.
  it.each([
    "20260903091200_ice_member_addresses",
    "20260903091300_ice_member_access",
    "20260903091400_ice_member_end_of_life",
  ])("%s drops triggers and policies before creating them", (prefix) => {
    const sql = migration(prefix);
    const creates = [...sql.matchAll(/CREATE POLICY "([^"]+)"/g)].map((m) => m[1]);
    expect(creates.length).toBeGreaterThan(0);
    for (const name of creates) {
      expect(sql, `policy "${name}" is not guarded by DROP POLICY IF EXISTS`).toMatch(
        new RegExp(`DROP POLICY IF EXISTS "${name}"`)
      );
    }
    if (/CREATE TRIGGER/.test(sql)) {
      expect(sql).toMatch(/DROP TRIGGER IF EXISTS/);
    }
  });

});
