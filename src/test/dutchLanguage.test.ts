/**
 * Dutch must be storable, not just displayable.
 *
 * LAUNCH_SCOPE.md §6 is LOCKED on "EN + ES + NL, all three, full coverage at
 * launch". The UI has always shipped all three — `supportedLngs: ["en","es","nl"]`,
 * with `localeParse.test.ts` enforcing key parity — but the DATABASE rejected `nl`
 * in two separate mechanisms across three tables:
 *
 *   public.preferred_language ENUM ('en','es')  → staff, members
 *   partners.preferred_language TEXT CHECK (... IN ('en','es'))
 *
 * plus two validation layers in front of them. So a Dutch speaker could select
 * Dutch and have the write refused. Four gates, all of which had to agree.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { partnerRegisterSchema } from "../../supabase/functions/_shared/validation";
import { PARTNER_LANGUAGES } from "@/lib/partnerRegistrationSchema";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const MIGRATION = "supabase/migrations/20260814130000_add_dutch_language.sql";
const LANGS = ["en", "es", "nl"] as const;

describe("the client schema accepts all three launch languages", () => {
  it.each(LANGS)("accepts %s", (lang) => {
    expect(PARTNER_LANGUAGES).toContain(lang);
  });

  it("accepts nothing beyond them", () => {
    expect([...PARTNER_LANGUAGES].sort()).toEqual(["en", "es", "nl"]);
  });
});

describe("the REAL server schema accepts all three", () => {
  // Imports the actual edge-function zod schema, not a copy — the same technique
  // partnerValidationParity uses, so the two cannot drift apart silently.
  const base = {
    contact_name: "Ana",
    email: "ana@example.com",
    phone: "+34600000000",
    payout_beneficiary_name: "Ana Moreno",
    payout_iban: "ES9121000418450200051332",
    password: "Partner123",
    partner_type: "referral",
    organization_type: "individual",
    accept_terms: true,
  };

  it.each(LANGS)("accepts preferred_language=%s", (lang) => {
    const result = partnerRegisterSchema.safeParse({ ...base, preferred_language: lang });
    expect(result.success, `server rejected ${lang}`).toBe(true);
  });

  it("still rejects a language we do not support", () => {
    // The point is to widen the set, not to stop validating it.
    const result = partnerRegisterSchema.safeParse({ ...base, preferred_language: "fr" });
    expect(result.success).toBe(false);
  });
});

describe("the database accepts Dutch", () => {
  it("adds nl to the enum backing staff and members", () => {
    expect(read(MIGRATION)).toMatch(
      /ALTER TYPE public\.preferred_language ADD VALUE IF NOT EXISTS 'nl'/
    );
  });

  it("widens the partners CHECK rather than dropping it", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS partners_preferred_language_check/);
    expect(sql).toMatch(/CHECK \(preferred_language IN \('en', 'es', 'nl'\)\)/);
  });

  it("documents that the enum half cannot be reversed", () => {
    // CLAUDE.md requires reversible-or-documented-rollback. PostgreSQL has no
    // ALTER TYPE ... DROP VALUE, so this migration is the documented kind, and
    // saying so is part of the deliverable rather than an optional courtesy.
    const sql = read(MIGRATION);
    expect(sql).toMatch(/ROLLBACK/);
    expect(sql).toMatch(/no `ALTER TYPE \.\.\. DROP VALUE`|does NOT/);
  });
});

describe("the UI already offered what the database refused", () => {
  it("i18n supports all three", () => {
    expect(read("src/i18n/index.ts")).toMatch(/supportedLngs: \["en", "es", "nl"\]/);
  });
});
