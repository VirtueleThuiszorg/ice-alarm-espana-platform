/**
 * The version of the partner programme terms the server records at registration.
 *
 * The server stamps THIS value, not whatever the client claims, so a caller cannot
 * record consent to a version it invented. `src/content/partnerTerms.ts` holds the
 * client's copy for display, and `src/test/partnerTerms.test.ts` asserts the two
 * agree — otherwise the UI could show one version while the row recorded another.
 */
export const PARTNER_TERMS_VERSION = "1.0";
