import type { JoinWizardData } from "@/types/wizard";

/**
 * Single source of truth for the body sent to the `submit-registration` edge function.
 *
 * Both the live-payment and test-mode paths in JoinPaymentStep build the body here so they
 * can never drift. Historically the inline bodies omitted medicalInfo/partnerMedicalInfo,
 * silently dropping all medical data from the member record — a shipped life-safety bug, and
 * the reason this module exists.
 *
 * THOSE FIELDS ARE NOW DELIBERATELY ABSENT. The join wizard no longer collects emergency
 * contacts or medical information; they are collected after payment through the
 * member_update_tokens second stage (ONBOARDING_SPLIT.md).
 *
 * Removing them is EXACTLY THE SHAPE OF THE ORIGINAL BUG — three lines quietly deleted from
 * this builder is how the first one happened. So the removal is loud rather than quiet:
 * `assertNoHealthDataInPayload` THROWS if a caller still supplies them, instead of ignoring
 * them. A caller that has not been updated is a bug, and it says so at the point of the
 * mistake rather than producing a member record with silently missing health data.
 */

/** Fields the wizard must no longer send. Any of them present is a programming error. */
const REMOVED_HEALTH_FIELDS = [
  "medicalInfo",
  "partnerMedicalInfo",
  "emergencyContacts",
] as const;

/**
 * Does this value carry actual DATA, as opposed to an empty shape?
 *
 * `initialJoinWizardData` seeds `medicalInfo` as a fully-keyed object of empty strings and
 * empty arrays, so a shape check would refuse every registration. What must be refused is real
 * health data, not the wizard's own initial state.
 */
function hasRealContent(v: unknown): boolean {
  if (v == null || v === "" || v === false) return false;
  if (Array.isArray(v)) return v.some(hasRealContent);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasRealContent);
  return true;
}

/**
 * Refuse a payload that still carries health data.
 *
 * Not a silent filter: a silent filter is indistinguishable from the original bug, in which
 * data the caller believed it had sent never arrived.
 */
export function assertNoHealthDataInPayload(data: Partial<JoinWizardData>): void {
  const offenders = REMOVED_HEALTH_FIELDS.filter((f) =>
    hasRealContent((data as Record<string, unknown>)[f]),
  );

  if (offenders.length > 0) {
    throw new Error(
      `registrationPayload: ${offenders.join(", ")} must not be sent at registration. ` +
        "Emergency contacts and medical information are collected after payment via " +
        "member_update_tokens. See ONBOARDING_SPLIT.md.",
    );
  }
}
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
  assertNoHealthDataInPayload(data);

  const body: Record<string, unknown> = {
    membershipType: data.membershipType,
    primaryMember: data.primaryMember,
    partnerMember: data.partnerMember,
    address: data.address,
    separateAddresses: data.separateAddresses,
    partnerAddress: data.partnerAddress,
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
