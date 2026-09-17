/**
 * The version of the member Terms of Service shown at /terms and accepted in the /join wizard.
 *
 * Rendered in the page header (`legal.terms.lastUpdated`). Bump it whenever the substance of
 * `legal.terms.*` changes.
 *
 * NOT YET RECORDED: unlike partner terms (`partners.terms_version`, stamped server-side from
 * `supabase/functions/_shared/partnerTerms.ts`), a member's acceptance is only client-side
 * wizard state today — `submit-registration` neither receives nor stores it. When that is
 * fixed, the server must stamp its own copy of this value (never the client's), and a test
 * must pin the two equal, exactly as `partnerTermsAcceptance.test.ts` does for partners.
 */
export const CURRENT_MEMBER_TERMS_VERSION = "2.0";
