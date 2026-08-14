/**
 * Is this user enrolled in ANY second factor?
 *
 * `mfa.listFactors()` returns one array per factor type — `totp`, `phone`,
 * `webauthn` — plus `all`, which is every factor regardless of type. Reading a
 * single typed array answers "do they have a TOTP factor", which is a different
 * question and the wrong one for an enrolment gate.
 *
 * That distinction is not theoretical on our SDK. `@supabase/auth-js` 2.91.0
 * declares `FactorTypes = ['totp', 'phone', 'webauthn']` and ships a working
 * WebAuthn implementation, so a user CAN hold a passkey-only enrolment today.
 * Against `mfaData.totp` such a user reads as unenrolled, and the mandatory-2FA
 * gate then locks a properly-protected admin out of the portal — the gate firing
 * on someone who did exactly what it asked.
 *
 * Reading `all` also means adding a factor type later needs no change here.
 *
 * Unverified factors do not count: `enroll()` creates a factor in `unverified`
 * state, and it only becomes a real second factor after `verify()`. Treating an
 * abandoned half-finished enrolment as protection would defeat the gate.
 */
export interface MfaFactorsLike {
  /** Every factor, any type, verified or not. */
  all?: readonly { status?: string }[] | null;
}

export function hasVerifiedMfaFactor(data: MfaFactorsLike | null | undefined): boolean {
  return (data?.all ?? []).some((factor) => factor.status === "verified");
}
