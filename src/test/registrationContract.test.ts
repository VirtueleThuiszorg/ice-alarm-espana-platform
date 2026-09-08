// @vitest-environment node
//
// REVIEW_JOIN_PATH.md F1 — the wizard's own payload was rejected by the server's own schema.
//
// `submit-registration` validates with `registrationSchema`, which required two fields:
//
//     medicalInfo: medicalSchema,                                   // validation.ts
//     emergencyContacts: z.array(emergencyContactSchema).min(1),    // validation.ts
//
// `buildRegistrationBody` is forbidden to send either — `assertNoHealthDataInPayload` THROWS if
// a caller tries, because contacts and medical data moved to the post-payment second stage
// (ONBOARDING_SPLIT.md). So the client could not satisfy the contract the server enforced, and
// every stranger who pressed "Pay securely" got HTTP 400. Nobody could buy.
//
// Both halves were tested. Neither test could see the bug:
//
//   * src/test/registrationPayload.test.ts proves the builder OMITS the health fields.
//   * the schema's own shape was only ever read, never executed against a real payload.
//
// Two green suites, one broken contract, because nothing joined them up. That is what this file
// is: the builder's real output, put through the server's real schema, by EXECUTION. It fails on
// the schema as it stood and passes on the schema as it must be.
//
// It is deliberately not just the happy path. Making required fields optional is one careless
// keystroke away from "the server accepts anything", so every loosened field is paired with an
// assertion that the validation which MATTERS still bites.

import { describe, it, expect } from "vitest";
import { registrationSchema } from "../../supabase/functions/_shared/validation";
import { buildRegistrationBody, type RegistrationReferralOptions } from "@/lib/registrationPayload";
import { initialJoinWizardData, type JoinWizardData, type MemberDetails } from "@/types/wizard";

/**
 * What the SERVER sees, not what the browser holds.
 *
 * `supabase.functions.invoke` JSON-encodes the body, and JSON has no `undefined`: a key set to
 * undefined vanishes, while a key set to null arrives as null. Validating the JS object directly
 * would hide exactly that difference — and `z.string().optional()` accepts undefined but REJECTS
 * null, so the difference is the whole bug for a visitor who arrived with no referral code.
 */
function overTheWire(body: unknown): unknown {
  return JSON.parse(JSON.stringify(body));
}

const ANA: MemberDetails = {
  firstName: "Ana",
  lastName: "Martín",
  email: "ana.martin@example.com",
  phone: "+34600123456",
  dateOfBirth: "1948-03-11",
  nieDni: "X1234567L",
  preferredLanguage: "es",
  preferredContactMethod: "whatsapp",
  preferredContactTime: "morning",
  specialInstructions: "",
};

const MIGUEL: MemberDetails = {
  firstName: "Miguel",
  lastName: "Martín",
  email: "miguel.martin@example.com",
  phone: "+34600654321",
  dateOfBirth: "1945-07-02",
  nieDni: "",
  preferredLanguage: "es",
  preferredContactMethod: undefined,
  preferredContactTime: undefined,
  specialInstructions: undefined,
};

/**
 * A wizard the joiner actually finished.
 *
 * Spread from `initialJoinWizardData` on purpose: that is where `emergencyContacts: []` and the
 * all-empty `medicalInfo` object come from, and they are exactly the state the real wizard still
 * carries at submit time. A fixture that omitted them would be testing a payload no browser ever
 * sends.
 */
function completedWizard(overrides: Partial<JoinWizardData> = {}): JoinWizardData {
  return {
    ...initialJoinWizardData,
    membershipType: "single",
    primaryMember: ANA,
    address: {
      addressLine1: "Calle Mayor 3",
      addressLine2: "",
      city: "Torrevieja",
      province: "Alicante",
      postalCode: "03181",
      country: "Spain",
    },
    includePendant: true,
    pendantCount: 1,
    billingFrequency: "monthly",
    acceptTerms: true,
    acceptPrivacy: true,
    ...overrides,
  };
}

/** The four shapes /join can produce, before referral attribution. */
const SHAPES: Array<{ name: string; data: JoinWizardData }> = [
  {
    name: "single, with a pendant",
    data: completedWizard(),
  },
  {
    name: "single, no pendant",
    data: completedWizard({ includePendant: false, pendantCount: 0 }),
  },
  {
    name: "couple, two pendants",
    data: completedWizard({
      membershipType: "couple",
      partnerMember: MIGUEL,
      pendantCount: 2,
    }),
  },
  {
    name: "couple, no pendant",
    data: completedWizard({
      membershipType: "couple",
      partnerMember: MIGUEL,
      includePendant: false,
      pendantCount: 0,
    }),
  },
];

/** Referral state as `getStoredReferralData()` really returns it. */
const REFERRALS: Array<{ name: string; opts: RegistrationReferralOptions }> = [
  {
    // THE COMMON CASE, and the one that broke: a stranger with no referral. `getStoredReferralData`
    // returns `referralCode: null, refPostId: null` (crmEvents.ts), the builder passes them
    // straight through, and JSON keeps nulls. An `.optional()` string rejects null.
    name: "no referral — nulls, as getStoredReferralData returns them",
    opts: { partnerRef: null, refPostId: null, utmParams: {} },
  },
  {
    name: "partner referral with a post id and utm params",
    opts: {
      partnerRef: "PART123",
      refPostId: "post-9",
      utmParams: { utm_source: "facebook", utm_campaign: "spring" },
    },
  },
  {
    name: "test mode",
    opts: { partnerRef: null, refPostId: null, utmParams: {}, testMode: true },
  },
];

describe("registrationSchema accepts what buildRegistrationBody actually sends", () => {
  for (const shape of SHAPES) {
    for (const referral of REFERRALS) {
      it(`${shape.name} · ${referral.name}`, () => {
        const wire = overTheWire(buildRegistrationBody(shape.data, referral.opts));
        const result = registrationSchema.safeParse(wire);

        // Name the offending fields when this fails. "expected true, got false" would send the
        // next reader back to guessing, which is how F1 survived as long as it did.
        const issues = result.success
          ? []
          : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        expect(issues).toEqual([]);
        expect(result.success).toBe(true);
      });
    }
  }

  it("the health fields the builder refuses to send are ABSENT, not empty", () => {
    // Belt to registrationPayload.test.ts's braces, from the schema's side: if a later change
    // made the builder send `medicalInfo: {}` to satisfy a required field, the member record
    // would carry an empty medical row and this suite would still be green. It must stay absent.
    const wire = overTheWire(buildRegistrationBody(completedWizard())) as Record<string, unknown>;
    expect(wire).not.toHaveProperty("medicalInfo");
    expect(wire).not.toHaveProperty("partnerMedicalInfo");
    expect(wire).not.toHaveProperty("emergencyContacts");
    expect(registrationSchema.safeParse(wire).success).toBe(true);
  });
});

describe("the loosened fields are still validated when they ARE supplied", () => {
  // `medicalInfo` and `emergencyContacts` became optional, not unchecked. An admin-side or
  // second-stage caller that does send them must still be held to the same shape.
  const base = overTheWire(buildRegistrationBody(completedWizard())) as Record<string, unknown>;

  const CONTACT = {
    contactName: "Jane Doe",
    relationship: "Daughter",
    phone: "+34123456789",
    email: "jane@example.com",
    speaksSpanish: true,
    notes: "",
  };

  it("a well-formed contacts array is accepted", () => {
    const result = registrationSchema.safeParse({ ...base, emergencyContacts: [CONTACT] });
    expect(result.success).toBe(true);
  });

  it("an EMPTY contacts array is accepted — the wizard no longer collects any", () => {
    expect(registrationSchema.safeParse({ ...base, emergencyContacts: [] }).success).toBe(true);
  });

  it("a contact with no phone number is REFUSED", () => {
    // The whole point of an emergency contact. `min(1)` on the array is what moved; the shape of
    // each element did not.
    const result = registrationSchema.safeParse({
      ...base,
      emergencyContacts: [{ ...CONTACT, phone: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("a contact with no relationship is REFUSED", () => {
    const result = registrationSchema.safeParse({
      ...base,
      emergencyContacts: [{ ...CONTACT, relationship: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("more than ten contacts is REFUSED", () => {
    const result = registrationSchema.safeParse({
      ...base,
      emergencyContacts: Array.from({ length: 11 }, () => CONTACT),
    });
    expect(result.success).toBe(false);
  });

  it("a well-formed medicalInfo object is accepted", () => {
    const result = registrationSchema.safeParse({
      ...base,
      medicalInfo: {
        bloodType: "O+",
        allergies: ["Penicillin"],
        medications: ["Warfarin"],
        medicalConditions: ["Atrial fibrillation"],
        doctorName: "Dr. García",
        doctorPhone: "+34911111111",
        hospitalPreference: "Hospital Vega Baja",
        additionalNotes: "Lives alone",
      },
    });
    expect(result.success).toBe(true);
  });

  it("medicalInfo carrying a non-array allergies field is REFUSED", () => {
    const result = registrationSchema.safeParse({
      ...base,
      medicalInfo: { allergies: "penicillin" },
    });
    expect(result.success).toBe(false);
  });

  it("partnerMedicalInfo is held to the same shape", () => {
    const result = registrationSchema.safeParse({
      ...base,
      partnerMedicalInfo: { medications: "warfarin" },
    });
    expect(result.success).toBe(false);
  });
});

describe("what the schema must never accept", () => {
  // Optional health fields must not turn into a schema that waves everything through. Each of
  // these is a payload that would produce a broken member record or a wrong charge.
  const base = overTheWire(buildRegistrationBody(completedWizard())) as Record<string, unknown>;

  const refused: Array<[string, Record<string, unknown>]> = [
    ["no primaryMember at all", { ...base, primaryMember: undefined }],
    ["a primary member with no name", { ...base, primaryMember: { ...ANA, firstName: "" } }],
    ["a primary member with no email", { ...base, primaryMember: { ...ANA, email: "" } }],
    ["an unparseable email", { ...base, primaryMember: { ...ANA, email: "ana@" } }],
    ["a phone full of letters", { ...base, primaryMember: { ...ANA, phone: "call me" } }],
    ["no date of birth", { ...base, primaryMember: { ...ANA, dateOfBirth: "" } }],
    ["no address at all", { ...base, address: undefined }],
    ["an address with no city", { ...base, address: { ...(base.address as object), city: "" } }],
    [
      "a postal code with punctuation",
      { ...base, address: { ...(base.address as object), postalCode: "03181!" } },
    ],
    ["a membership type we do not sell", { ...base, membershipType: "family" }],
    ["a billing frequency we do not offer", { ...base, billingFrequency: "weekly" }],
    ["eleven pendants", { ...base, pendantCount: 11 }],
    ["a negative pendant count", { ...base, pendantCount: -1 }],
    ["a fractional pendant count", { ...base, pendantCount: 1.5 }],
    ["includePendant as a string", { ...base, includePendant: "yes" }],
    ["no membershipType", { ...base, membershipType: undefined }],
    ["no billingFrequency", { ...base, billingFrequency: undefined }],
    ["no pendantCount", { ...base, pendantCount: undefined }],
    ["no includePendant", { ...base, includePendant: undefined }],
  ];

  for (const [name, payload] of refused) {
    it(`refuses ${name}`, () => {
      expect(registrationSchema.safeParse(payload).success).toBe(false);
    });
  }
});
