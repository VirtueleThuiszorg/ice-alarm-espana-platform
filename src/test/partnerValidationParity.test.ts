/**
 * Client/server validation parity for partner registration.
 *
 * The production failure this exists to prevent: the form checked only
 * `password.min(8)`, the server also required uppercase + lowercase + digit, so
 * "password" passed the form and came back as
 * `Validation failed: [ "password: Invalid" ]`.
 *
 * This asserts parity **by execution, not by inspection**. It imports the REAL
 * server schema from `supabase/functions/_shared/validation.ts` (the vitest config
 * aliases the function's `npm:zod@…` specifier onto the repo's own zod, which is
 * pinned to the same version) and the REAL client schema, then runs adversarial
 * inputs through both.
 *
 * The invariant: **anything the server rejects, the client must reject first.**
 * The reverse is allowed — the client may be stricter (it demands a 15-char IBAN
 * where the server accepts any non-empty string), because a stricter client only
 * ever costs an inline message, never a server round-trip the user can't read.
 */

import { describe, it, expect } from "vitest";
import { partnerRegisterSchema } from "../../supabase/functions/_shared/validation";
import { partnerFormSchema, PARTNER_STEP_FIELDS } from "@/lib/partnerRegistrationSchema";

// ── fixtures ───────────────────────────────────────────────────────────────

/** A submission both sides accept. Every case below is this, with one field bent. */
const VALID = {
  partner_type: "referral" as const,
  contact_name: "Ana García",
  last_name: "García",
  company_name: "Cuidado SL",
  email: "ana@example.com",
  phone: "+34 600 123 456",
  preferred_language: "es" as const,
  organization_type: "individual",
  organization_registration: "",
  organization_website: "",
  estimated_monthly_referrals: "",
  facility_address: "",
  facility_resident_count: undefined,
  region: "Alicante",
  how_heard_about_us: "word_of_mouth",
  motivation: "I work with families locally.",
  additional_notes: "",
  current_client_base: "",
  position_title: "Owner",
  payout_beneficiary_name: "Ana García",
  payout_iban: "ES9121000418450200051332",
  password: "Str0ngPassword",
  confirmPassword: "Str0ngPassword",
  accept_terms: true as const,
};

/**
 * What PartnerJoin actually posts. Only `confirmPassword` is client-only —
 * `accept_terms` IS sent, because the server requires it as a legal record.
 */
function toServerPayload(values: Record<string, unknown>) {
  const { confirmPassword: _c, ...rest } = values;
  return rest;
}

const clientAccepts = (values: Record<string, unknown>) =>
  partnerFormSchema.safeParse(values).success;
const serverAccepts = (values: Record<string, unknown>) =>
  partnerRegisterSchema.safeParse(toServerPayload(values)).success;

// ── the baseline ───────────────────────────────────────────────────────────

describe("partner registration — a good submission", () => {
  it("is accepted by BOTH schemas (the fixture is not vacuously invalid)", () => {
    expect(clientAccepts(VALID)).toBe(true);
    expect(serverAccepts(VALID)).toBe(true);
  });
});

// ── the invariant ──────────────────────────────────────────────────────────

/** Each case bends exactly one field into something the server rejects. */
const SERVER_REJECTS: Array<{ name: string; patch: Record<string, unknown> }> = [
  // The production failure, in four flavours.
  { name: "password with no uppercase", patch: { password: "password1", confirmPassword: "password1" } },
  { name: "password with no lowercase", patch: { password: "PASSWORD1", confirmPassword: "PASSWORD1" } },
  { name: "password with no digit", patch: { password: "PasswordOnly", confirmPassword: "PasswordOnly" } },
  { name: "password under 8 chars", patch: { password: "Pass1", confirmPassword: "Pass1" } },
  { name: "password over 100 chars", patch: { password: `A1${"a".repeat(120)}`, confirmPassword: `A1${"a".repeat(120)}` } },

  // Names: the server allows only letters, spaces, apostrophes, hyphens.
  { name: "contact_name containing digits", patch: { contact_name: "Ana 123" } },
  { name: "contact_name containing symbols", patch: { contact_name: "Ana <script>" } },
  { name: "contact_name empty", patch: { contact_name: "" } },
  { name: "contact_name over 100 chars", patch: { contact_name: "A".repeat(101) } },

  // Email.
  { name: "email not an email", patch: { email: "not-an-email" } },
  { name: "email empty", patch: { email: "" } },
  { name: "email over 255 chars", patch: { email: `${"a".repeat(250)}@example.com` } },

  // Phone: server enforces a format the client used to ignore entirely.
  { name: "phone containing letters", patch: { phone: "call me" } },
  { name: "phone over 20 chars", patch: { phone: "+34 600 123 456 789 012" } },

  // Bounded optionals the client used to leave unbounded.
  { name: "last_name over 100 chars", patch: { last_name: "A".repeat(101) } },
  { name: "company_name over 200 chars", patch: { company_name: "A".repeat(201) } },
  { name: "organization_type over 100 chars", patch: { organization_type: "A".repeat(101) } },
  { name: "organization_website over 500 chars", patch: { organization_website: "A".repeat(501) } },
  { name: "estimated_monthly_referrals over 50 chars", patch: { estimated_monthly_referrals: "A".repeat(51) } },
  { name: "facility_address over 500 chars", patch: { facility_address: "A".repeat(501) } },
  { name: "region over 100 chars", patch: { region: "A".repeat(101) } },
  { name: "how_heard_about_us over 100 chars", patch: { how_heard_about_us: "A".repeat(101) } },
  { name: "motivation over 1000 chars", patch: { motivation: "A".repeat(1001) } },
  { name: "additional_notes over 2000 chars", patch: { additional_notes: "A".repeat(2001) } },
  { name: "current_client_base over 500 chars", patch: { current_client_base: "A".repeat(501) } },
  { name: "position_title over 200 chars", patch: { position_title: "A".repeat(201) } },

  // Numbers.
  { name: "facility_resident_count negative", patch: { facility_resident_count: -1 } },
  { name: "facility_resident_count fractional", patch: { facility_resident_count: 1.5 } },
  { name: "facility_resident_count over 10000", patch: { facility_resident_count: 10001 } },

  // Payout.
  { name: "payout_beneficiary_name empty", patch: { payout_beneficiary_name: "" } },
  { name: "payout_beneficiary_name over 200 chars", patch: { payout_beneficiary_name: "A".repeat(201) } },
  { name: "payout_iban empty", patch: { payout_iban: "" } },

  // Enums.
  // `nl` was the unsupported example here until Dutch became a launch language
  // (LAUNCH_SCOPE §6, migration 20260814130000). It is now accepted by BOTH
  // schemas, so it no longer tests anything — replaced with a language we really
  // do not support, which keeps the case adversarial instead of stale.
  { name: "preferred_language outside en/es/nl", patch: { preferred_language: "fr" } },
  { name: "partner_type unknown", patch: { partner_type: "something_else" } },
];

describe("anything the server rejects, the client rejects first", () => {
  it.each(SERVER_REJECTS)("$name", ({ patch }) => {
    const values = { ...VALID, ...patch };

    // Guard the case itself: if the server accepts this, the case is stale and
    // proves nothing. That keeps the table honest as the server evolves.
    expect(serverAccepts(values), "case no longer rejected by the server — update it").toBe(false);

    expect(
      clientAccepts(values),
      "the client accepted a submission the server rejects — the user would get a server error instead of an inline message"
    ).toBe(false);
  });

  it("covers the password rule in every direction", () => {
    // Named separately because this is the exact production failure.
    const cases = ["password1", "PASSWORD1", "PasswordOnly", "Pass1"];
    for (const pw of cases) {
      const values = { ...VALID, password: pw, confirmPassword: pw };
      expect(serverAccepts(values)).toBe(false);
      expect(clientAccepts(values)).toBe(false);
    }
  });
});

// ── the client may be stricter, and is ─────────────────────────────────────

describe("the client is allowed to be stricter", () => {
  it("rejects a too-short IBAN the server would accept", () => {
    const values = { ...VALID, payout_iban: "ES91" };
    expect(serverAccepts(values)).toBe(true);
    expect(clientAccepts(values)).toBe(false);
  });

  it("rejects a mismatched password confirmation the server never sees", () => {
    const values = { ...VALID, confirmPassword: "Different1" };
    expect(clientAccepts(values)).toBe(false);
  });

  it("requires terms acceptance — and so does the server now", () => {
    const values = { ...VALID, accept_terms: false };
    expect(clientAccepts(values)).toBe(false);
    // This assertion previously read `.toBe(true)`, documenting a real gap: the
    // server had no accept_terms field, so a caller bypassing the form was never
    // held to it. The terms-acceptance change closes that, so parity now holds on
    // this field too — note the server payload therefore keeps accept_terms.
    expect(serverAccepts(values)).toBe(false);
  });
});

// ── every rejectable field is reachable on a step ───────────────────────────

describe("every field the server can reject is owned by a step", () => {
  it("so the message lands inline instead of only on final submit", () => {
    const owned = new Set(Object.values(PARTNER_STEP_FIELDS).flat() as string[]);
    const serverFields = Object.keys(partnerRegisterSchema.shape);

    const orphans = serverFields.filter((f) => !owned.has(f));

    expect(
      orphans,
      `server-validated but on no step, so a failure can only appear after submit: ${orphans.join(", ")}`
    ).toEqual([]);
  });

  it("names no field that isn't in the schema", () => {
    const shape = Object.keys(
      (partnerFormSchema as unknown as { _def: { schema: { shape: Record<string, unknown> } } })._def.schema.shape
    );
    const unknown = (Object.values(PARTNER_STEP_FIELDS).flat() as string[]).filter(
      (f) => !shape.includes(f)
    );
    expect(unknown, `step references unknown fields: ${unknown.join(", ")}`).toEqual([]);
  });
});
