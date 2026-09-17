import { CURRENT_AGREEMENT_VERSION } from "./partnerAgreementTerms";

/**
 * The version of the partner programme terms shown on the /partner/join form.
 *
 * Since 2.0 the join form shows the full Partner Agreement itself, so the version a
 * partner accepts at registration IS the agreement version — derived here, not typed
 * twice.
 *
 * Must equal `supabase/functions/_shared/partnerTerms.ts` → PARTNER_TERMS_VERSION,
 * which is the value actually written to `partners.terms_version`. A test asserts
 * that, so the version a partner sees is the version recorded against them.
 */
export const CURRENT_PARTNER_TERMS_VERSION = CURRENT_AGREEMENT_VERSION;
