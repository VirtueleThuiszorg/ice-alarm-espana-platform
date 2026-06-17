import type { JoinWizardData } from "@/types/wizard";

/**
 * Single source of truth for the body sent to the `submit-registration` edge function.
 *
 * Both the live-payment and test-mode paths in JoinPaymentStep build the body here so they
 * can never drift. Historically the inline bodies omitted medicalInfo/partnerMedicalInfo,
 * silently dropping all medical data from the member record (life-safety bug) — centralising
 * the payload prevents that recurring. The edge function (submit-registration) expects
 * medicalInfo (required), partnerMedicalInfo (optional), and emergencyContacts, and forwards
 * them to the submit_registration_atomic RPC which writes medical_information +
 * emergency_contacts rows.
 */
export interface RegistrationReferralOptions {
  partnerRef?: string | null;
  refPostId?: string | null;
  utmParams?: Record<string, string>;
  testMode?: boolean;
}

export function buildRegistrationBody(
  data: JoinWizardData,
  opts: RegistrationReferralOptions = {},
) {
  const body: Record<string, unknown> = {
    membershipType: data.membershipType,
    primaryMember: data.primaryMember,
    partnerMember: data.partnerMember,
    address: data.address,
    separateAddresses: data.separateAddresses,
    partnerAddress: data.partnerAddress,
    emergencyContacts: data.emergencyContacts,
    // The previously-dropped fields — the whole point of this helper:
    medicalInfo: data.medicalInfo,
    partnerMedicalInfo: data.partnerMedicalInfo ?? null,
    includePendant: data.includePendant,
    pendantCount: data.pendantCount,
    billingFrequency: data.billingFrequency,
    partnerRef: opts.partnerRef,
    refPostId: opts.refPostId,
    utmParams: opts.utmParams,
  };

  if (opts.testMode) body.testMode = true;

  return body;
}
