import { describe, it, expect } from "vitest";
import { buildRegistrationBody, assertNoHealthDataInPayload } from "@/lib/registrationPayload";
import { initialJoinWizardData, type JoinWizardData } from "@/types/wizard";

/**
 * GATE F5, PAYLOAD HALF — REWRITTEN, NOT DELETED.
 *
 * The original bug: JoinPaymentStep's submit-registration body omitted
 * medicalInfo/partnerMedicalInfo, so medical_information rows were never written. A shipped
 * life-safety bug, and the reason src/lib/registrationPayload.ts exists at all.
 *
 * The wizard no longer collects emergency contacts or medical information — they are collected
 * after payment through member_update_tokens (ONBOARDING_SPLIT.md). So the requirement inverts:
 * these fields must now be ABSENT from the registration payload.
 *
 * THAT INVERSION IS THE DANGEROUS PART. "Three fields quietly disappear from the builder" is a
 * verbatim description of the original bug, so absence is not enough — the builder must REFUSE
 * a payload that still carries them, loudly, at the point of the mistake. A silent filter would
 * be indistinguishable from the bug this file was written to catch.
 *
 * The second-stage half of F5 lives in src/test/secondStageF5.test.ts and proves the data is
 * actually written there, for single AND couple, member AND partner.
 */

const signupData: JoinWizardData = {
  ...initialJoinWizardData,
  membershipType: "couple",
  emergencyContacts: [
    {
      contactName: "Jane Doe",
      relationship: "Daughter",
      phone: "+34123456789",
      email: "jane@example.com",
      speaksSpanish: true,
      notes: "",
    },
  ],
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
  partnerMedicalInfo: {
    bloodType: "A-",
    allergies: ["Aspirin"],
    medications: [],
    medicalConditions: ["Diabetes"],
    doctorName: "Dr. López",
    doctorPhone: "+34922222222",
    hospitalPreference: "",
    additionalNotes: "",
  },
};

describe("buildRegistrationBody — health data must NOT reach submit-registration", () => {
  // The inversion of the original guard. These fields moved to the second stage; a payload
  // still carrying them means a caller was not updated, and the member's health data would go
  // to a path that no longer writes it.
  const bare: JoinWizardData = {
    ...initialJoinWizardData,
    membershipType: "couple",
    primaryMember: signupData.primaryMember,
    partnerMember: signupData.partnerMember,
    address: signupData.address,
  };

  it("omits medicalInfo, partnerMedicalInfo and emergencyContacts entirely", () => {
    const body = buildRegistrationBody(bare);
    expect(body).not.toHaveProperty("medicalInfo");
    expect(body).not.toHaveProperty("partnerMedicalInfo");
    expect(body).not.toHaveProperty("emergencyContacts");
  });

  it("still carries everything registration DOES need", () => {
    const body = buildRegistrationBody(bare);
    expect(body.membershipType).toBe("couple");
    expect(body.primaryMember).toBeDefined();
    expect(body.address).toBeDefined();
    // Passed through even when the fixture leaves it unset — the builder must not drop the key,
    // which is the same failure mode as the original bug one field over.
    expect(body).toHaveProperty("partnerMember");
    // Pendant shipping is unchanged by the split — it ships on payment, deliberately.
    expect(body).toHaveProperty("includePendant");
    expect(body).toHaveProperty("pendantCount");
    expect(body).toHaveProperty("billingFrequency");
  });

  it("THROWS if a caller still supplies medicalInfo — absence is not enough", () => {
    // A silent filter here would be indistinguishable from the original bug: the caller
    // believes it sent medical data, and nothing ever writes it.
    expect(() => buildRegistrationBody(signupData)).toThrow(/medicalInfo/);
  });

  it("THROWS if a caller still supplies emergencyContacts", () => {
    expect(() =>
      buildRegistrationBody({ ...bare, emergencyContacts: signupData.emergencyContacts }),
    ).toThrow(/emergencyContacts/);
  });

  it("THROWS if a caller still supplies partnerMedicalInfo", () => {
    expect(() =>
      buildRegistrationBody({ ...bare, partnerMedicalInfo: signupData.partnerMedicalInfo }),
    ).toThrow(/partnerMedicalInfo/);
  });

  it("names every offending field at once, so one fix reveals the next", () => {
    expect(() => buildRegistrationBody(signupData)).toThrow(/medicalInfo.*emergencyContacts/s);
  });

  it("an EMPTY contacts array or empty medical object is not an offence", () => {
    // Only actual data is refused. initialJoinWizardData carries empty shapes, and a wizard
    // that has simply not been pruned of its state fields must still be able to register.
    expect(() =>
      buildRegistrationBody({ ...bare, emergencyContacts: [], partnerMedicalInfo: undefined }),
    ).not.toThrow();
  });

  it("assertNoHealthDataInPayload is exported so callers can check before building", () => {
    expect(() => assertNoHealthDataInPayload(bare)).not.toThrow();
    expect(() => assertNoHealthDataInPayload(signupData)).toThrow();
  });

  it("carries the same absence on the TEST-MODE path (both sites share the builder)", () => {
    const body = buildRegistrationBody(bare, { testMode: true });
    expect(body.testMode).toBe(true);
    expect(body).not.toHaveProperty("medicalInfo");
    expect(body).not.toHaveProperty("emergencyContacts");
  });

  it("threads referral attribution through", () => {
    const body = buildRegistrationBody(bare, { partnerRef: "PART123", refPostId: "post-9", utmParams: { utm_source: "fb" } });
    expect(body.partnerRef).toBe("PART123");
    expect(body.refPostId).toBe("post-9");
    expect(body.utmParams).toEqual({ utm_source: "fb" });
  });
});
