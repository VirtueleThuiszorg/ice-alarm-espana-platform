/**
 * The version of the partner programme terms shown on the /partner/join form.
 *
 * Must equal `supabase/functions/_shared/partnerTerms.ts` → PARTNER_TERMS_VERSION,
 * which is the value actually written to `partners.terms_version`. A test asserts
 * that, so the version a partner sees is the version recorded against them.
 */
export const CURRENT_PARTNER_TERMS_VERSION = "1.0";
