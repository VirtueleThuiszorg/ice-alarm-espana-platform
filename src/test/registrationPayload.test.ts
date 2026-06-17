import { describe, it, expect } from "vitest";
import { buildRegistrationBody } from "@/lib/registrationPayload";
import { initialJoinWizardData, type JoinWizardData } from "@/types/wizard";

/**
 * Regression guard for the life-safety bug where /join dropped all medical data:
 * JoinPaymentStep's submit-registration body omitted medicalInfo/partnerMedicalInfo, so
 * medical_information rows were never written. These tests pin that the payload sent to
 * submit-registration carries medical info AND emergency contacts on both the live and
 * test-mode paths. submit-registration forwards body.medicalInfo/emergencyContacts to the
 * submit_registration_atomic RPC, which inserts medical_information + emergency_contacts.
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

describe("buildRegistrationBody — medical data reaches submit-registration", () => {
  it("includes medicalInfo with the entered values (the previously-dropped field)", () => {
    const body = buildRegistrationBody(signupData);
    expect(body.medicalInfo).toBeDefined();
    expect((body.medicalInfo as { bloodType: string }).bloodType).toBe("O+");
    expect((body.medicalInfo as { allergies: string[] }).allergies).toContain("Penicillin");
    expect((body.medicalInfo as { medicalConditions: string[] }).medicalConditions).toContain("Atrial fibrillation");
  });

  it("includes partnerMedicalInfo for couple memberships", () => {
    const body = buildRegistrationBody(signupData);
    expect(body.partnerMedicalInfo).toBeDefined();
    expect((body.partnerMedicalInfo as { bloodType: string }).bloodType).toBe("A-");
  });

  it("still includes emergencyContacts (must not regress alongside the medical fix)", () => {
    const body = buildRegistrationBody(signupData);
    expect(Array.isArray(body.emergencyContacts)).toBe(true);
    expect((body.emergencyContacts as unknown[]).length).toBe(1);
    expect((body.emergencyContacts as Array<{ contactName: string }>)[0].contactName).toBe("Jane Doe");
  });

  it("carries the same medical + contacts on the TEST-MODE path (both sites share the builder)", () => {
    const body = buildRegistrationBody(signupData, { testMode: true });
    expect(body.testMode).toBe(true);
    expect((body.medicalInfo as { bloodType: string }).bloodType).toBe("O+");
    expect((body.emergencyContacts as unknown[]).length).toBe(1);
  });

  it("sends partnerMedicalInfo as null (not undefined) for single membership", () => {
    const single: JoinWizardData = {
      ...signupData,
      membershipType: "single",
      partnerMedicalInfo: undefined,
    };
    const body = buildRegistrationBody(single);
    expect(body.partnerMedicalInfo).toBeNull();
    // medical for the primary member is still present
    expect((body.medicalInfo as { bloodType: string }).bloodType).toBe("O+");
  });

  it("threads referral attribution through", () => {
    const body = buildRegistrationBody(signupData, { partnerRef: "PART123", refPostId: "post-9", utmParams: { utm_source: "fb" } });
    expect(body.partnerRef).toBe("PART123");
    expect(body.refPostId).toBe("post-9");
    expect(body.utmParams).toEqual({ utm_source: "fb" });
  });
});
