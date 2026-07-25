/**
 * SECURITY — partner privilege guard (night audit BLOCKER 4).
 *
 * The partners own-row UPDATE policy is column-blind, so a partner could
 * self-set alert_visibility_enabled — the sole gate on the resident
 * SOS-alert stream. This pins the two-layer fix:
 *  1. the client no longer writes the flag from the partner surface, and
 *  2. a BEFORE UPDATE guard trigger makes privileged partner columns
 *     immutable for non-staff callers (defence against hand-crafted
 *     requests, which the client fix alone cannot stop).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function migration(prefix: string): string {
  const dir = join(ROOT, "supabase/migrations");
  const f = readdirSync(dir).find((m) => m.startsWith(prefix));
  expect(f, `migration ${prefix}* must exist`).toBeDefined();
  return readFileSync(join(dir, f!), "utf8");
}

describe("guard trigger (20260725010000)", () => {
  const sql = migration("20260725010000");

  it("protects every privileged partner column", () => {
    for (const field of [
      "alert_visibility_enabled",
      "status",
      "partner_type",
      "billing_model",
      "referral_code",
      "user_id",
    ]) {
      expect(sql, `guard must protect ${field}`).toMatch(
        new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`),
      );
    }
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it("staff and service role stay exempt (admin toggle + edge fns keep working)", () => {
    expect(sql).toMatch(/auth\.role\(\) = 'service_role'/);
    expect(sql).toMatch(/public\.is_staff\(auth\.uid\(\)\)/);
  });

  it("partner self-service fields are NOT guarded (agreement signing, payout, language)", () => {
    for (const field of ["agreement_signed_at", "payout_iban", "preferred_language", "contact_name"]) {
      expect(sql, `${field} must stay self-writable`).not.toMatch(
        new RegExp(`NEW\\.${field} IS DISTINCT`),
      );
    }
  });

  it("is a BEFORE UPDATE trigger on public.partners with a rollback note", () => {
    expect(sql).toMatch(/BEFORE UPDATE ON public\.partners/);
    expect(sql).toMatch(/-- Rollback:/);
  });

  it("does not loosen or add any RLS policy", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
  });
});

describe("client half — the partner surface no longer writes the flag", () => {
  it("PartnerSettingsPage does not write alert_visibility_enabled", () => {
    const page = read("src/pages/partner/PartnerSettingsPage.tsx");
    expect(page).not.toMatch(/alert_visibility_enabled:\s*facilityData/);
    // the read-side display stays
    expect(page).toMatch(/alertVisibilityEnabled: partner\.alert_visibility_enabled/);
  });

  it("no partner-surface file writes the flag anywhere", () => {
    const dirs = ["src/pages/partner", "src/components/partner"];
    const offenders: string[] = [];
    for (const d of dirs) {
      for (const name of readdirSync(join(ROOT, d))) {
        if (!/\.tsx?$/.test(name)) continue;
        const src = readFileSync(join(ROOT, d, name), "utf8");
        if (/alert_visibility_enabled\s*:/.test(src)) offenders.push(`${d}/${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the admin toggle (PartnerOrganizationTab) keeps its write path", () => {
    const tab = read("src/components/admin/partner/PartnerOrganizationTab.tsx");
    expect(tab).toMatch(/alert_visibility_enabled/);
  });
});
