/**
 * Terms acceptance at partner registration must be a legal record, not UI state.
 *
 * Before this: /partner/join had a required "I accept the terms" checkbox whose
 * value never left the browser. It was not sent, not validated server-side, and
 * not stored. The platform had no record that any partner accepted anything — only
 * a form that declined to submit without a tick.
 *
 * These tests hold all three legs: required on the client, ENFORCED on the server,
 * and PERSISTED on the row with a timestamp and a version.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { partnerRegisterSchema } from "../../supabase/functions/_shared/validation";
import { PARTNER_TERMS_VERSION } from "../../supabase/functions/_shared/partnerTerms";
import { CURRENT_PARTNER_TERMS_VERSION } from "@/content/partnerTerms";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const MIGRATION = "supabase/migrations/20260811140000_partner_terms_acceptance.sql";
const REGISTER_FN = "supabase/functions/partner-register/index.ts";

/** A submission the server otherwise accepts, so each case isolates accept_terms. */
const VALID = {
  contact_name: "Ana García",
  email: "ana@example.com",
  preferred_language: "es",
  payout_beneficiary_name: "Ana García",
  payout_iban: "ES9121000418450200051332",
  password: "Str0ngPassword",
  accept_terms: true,
};

// ── enforced server-side ───────────────────────────────────────────────────

describe("the server enforces terms acceptance", () => {
  it("accepts a submission that accepts the terms", () => {
    expect(partnerRegisterSchema.safeParse(VALID).success).toBe(true);
  });

  it("REJECTS accept_terms: false", () => {
    const result = partnerRegisterSchema.safeParse({ ...VALID, accept_terms: false });
    expect(result.success).toBe(false);
  });

  it("REJECTS a submission with accept_terms missing entirely", () => {
    // This is why the field is z.literal(true) and not an optional boolean: an
    // optional field lets a caller bypassing the form simply omit it.
    const { accept_terms: _omitted, ...withoutTerms } = VALID;
    expect(partnerRegisterSchema.safeParse(withoutTerms).success).toBe(false);
  });

  it("REJECTS truthy-but-not-true values", () => {
    for (const value of ["true", 1, {}, [], "yes"]) {
      expect(
        partnerRegisterSchema.safeParse({ ...VALID, accept_terms: value }).success,
        `accept_terms: ${JSON.stringify(value)} must not pass`
      ).toBe(false);
    }
  });

  it("names accept_terms in the rejection, so the reason reaches the user", () => {
    // Pairs with the error-surfacing work: the details array is what the client
    // now shows, so the field name has to be in there.
    const result = partnerRegisterSchema.safeParse({ ...VALID, accept_terms: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("accept_terms");
    }
  });
});

// ── persisted as a record ──────────────────────────────────────────────────

describe("acceptance is persisted on the partners row", () => {
  it("the migration adds both columns", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS terms_version TEXT/i);
  });

  it("the migration is reversible with a documented rollback", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/Reversible\. Down \(rollback\)/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS terms_accepted_at/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS terms_version/);
  });

  it("leaves the columns nullable rather than fabricating a record for existing partners", () => {
    const sql = read(MIGRATION);
    // A NOT NULL DEFAULT now() would invent a legal record for every partner
    // already in the table. NULL honestly means "no record" (GOALS.md G5).
    expect(sql).not.toMatch(/terms_accepted_at TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/Nullable by design/);
  });

  it("partner-register writes both fields", () => {
    const src = read(REGISTER_FN);
    expect(src).toMatch(/terms_accepted_at:/);
    expect(src).toMatch(/terms_version:/);
  });

  it("stamps the timestamp server-side, not from the request", () => {
    const src = read(REGISTER_FN);
    expect(src).toMatch(/terms_accepted_at:\s*new Date\(\)\.toISOString\(\)/);
    // A client-supplied timestamp would make the record worthless.
    expect(src).not.toMatch(/terms_accepted_at:\s*data\./);
  });

  it("stamps the server's own version, not the client's claim", () => {
    const src = read(REGISTER_FN);
    expect(src).toMatch(/terms_version:\s*PARTNER_TERMS_VERSION/);
    expect(src).not.toMatch(/terms_version:\s*data\./);
  });

  it("does not confuse this with the later full-agreement signing", () => {
    // agreement_signed_at / partner_agreements record a different, heavier act.
    const sql = read(MIGRATION);
    expect(sql).toMatch(/agreement_signed_at/);
    expect(sql).toMatch(/NOT the same thing/);
  });
});

// ── the version shown is the version recorded ──────────────────────────────

describe("terms version", () => {
  it("client and server constants agree", () => {
    // Otherwise the form could show 1.0 while the row recorded 1.1.
    expect(CURRENT_PARTNER_TERMS_VERSION).toBe(PARTNER_TERMS_VERSION);
  });

  it("is a non-empty string", () => {
    expect(PARTNER_TERMS_VERSION).toMatch(/\S/);
  });
});

// ── required client-side ───────────────────────────────────────────────────

describe("the client still requires the checkbox", () => {
  it("the shared schema keeps accept_terms required with a message", () => {
    const src = read("src/lib/partnerRegistrationSchema.ts");
    expect(src).toMatch(/accept_terms/);
    expect(src).toMatch(/You must accept the terms and conditions/);
  });

  it("PartnerJoin now actually sends it", () => {
    // The checkbox existed for a long time; the value never left the browser.
    const src = read("src/pages/partner/PartnerJoin.tsx");
    expect(src).toMatch(/accept_terms:\s*data\.accept_terms/);
  });

  it("accept_terms is validated on the step that renders it", () => {
    const src = read("src/lib/partnerRegistrationSchema.ts");
    expect(src).toMatch(/account:\s*\[[^\]]*accept_terms/);
  });
});
