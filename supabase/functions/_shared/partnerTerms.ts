/**
 * The version of the partner programme terms the server records at registration.
 *
 * The server stamps THIS value, not whatever the client claims, so a caller cannot
 * record consent to a version it invented. `src/content/partnerTerms.ts` holds the
 * client's copy for display, and `src/test/partnerTermsAcceptance.test.ts` asserts the two
 * agree — otherwise the UI could show one version while the row recorded another.
 */
// Equal to CURRENT_AGREEMENT_VERSION in src/content/partnerAgreementTerms.ts (the join form
// shows that agreement). 1.0 → 2.0 on 17 Sep 2026 with the agreement redraft.
export const PARTNER_TERMS_VERSION = "2.0";
