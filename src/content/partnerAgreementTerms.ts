/**
 * Partner Agreement — the ONE text of the partner programme terms.
 * ICE Alarm España S.L. (CIF: B24731531)
 *
 * The same sections are shown on /partner/join (Create Account step), on the public
 * /partner/terms page, in the portal signing modal and on the signed-agreement page.
 * There is no second copy anywhere: every surface renders `agreementSections` through
 * `PartnerAgreementText`.
 *
 * STATUS: draft pending legal review (LEGAL.md tripwire). Not declared compliant.
 *
 * VERSIONING. Bump CURRENT_AGREEMENT_VERSION whenever the text changes materially.
 * `src/content/partnerTerms.ts` derives the registration version from it, and
 * `supabase/functions/_shared/partnerTerms.ts` must carry the same literal, because that
 * is what partner-register records in `partners.terms_version`. A test enforces all three.
 *
 * 1.0 → 2.0 (17 Sep 2026): complete redraft — independent status / Ley 12/1992, referral
 * attribution, per-member commission, VAT/IRPF, clawback within the withdrawal period,
 * invoicing, marketing rules (no medical claims, LSSI), data-protection roles, amendments,
 * jurisdiction, e-acceptance record. Clause numbers inside the text follow the ORDER of
 * `agreementSections` below (section n = clause n), so do not reorder without renumbering.
 */

export const CURRENT_AGREEMENT_VERSION = "2.0";

export interface AgreementSection {
  titleKey: string;
  contentKey: string;
}

export const agreementSections: AgreementSection[] = [
  { titleKey: "partnerAgreement.sections.parties.title", contentKey: "partnerAgreement.sections.parties.content" },
  { titleKey: "partnerAgreement.sections.definitions.title", contentKey: "partnerAgreement.sections.definitions.content" },
  { titleKey: "partnerAgreement.sections.object.title", contentKey: "partnerAgreement.sections.object.content" },
  { titleKey: "partnerAgreement.sections.status.title", contentKey: "partnerAgreement.sections.status.content" },
  { titleKey: "partnerAgreement.sections.attribution.title", contentKey: "partnerAgreement.sections.attribution.content" },
  { titleKey: "partnerAgreement.sections.obligations.title", contentKey: "partnerAgreement.sections.obligations.content" },
  { titleKey: "partnerAgreement.sections.marketing.title", contentKey: "partnerAgreement.sections.marketing.content" },
  { titleKey: "partnerAgreement.sections.commissions.title", contentKey: "partnerAgreement.sections.commissions.content" },
  { titleKey: "partnerAgreement.sections.clawback.title", contentKey: "partnerAgreement.sections.clawback.content" },
  { titleKey: "partnerAgreement.sections.payment.title", contentKey: "partnerAgreement.sections.payment.content" },
  { titleKey: "partnerAgreement.sections.intellectualProperty.title", contentKey: "partnerAgreement.sections.intellectualProperty.content" },
  { titleKey: "partnerAgreement.sections.confidentiality.title", contentKey: "partnerAgreement.sections.confidentiality.content" },
  { titleKey: "partnerAgreement.sections.dataProtection.title", contentKey: "partnerAgreement.sections.dataProtection.content" },
  { titleKey: "partnerAgreement.sections.duration.title", contentKey: "partnerAgreement.sections.duration.content" },
  { titleKey: "partnerAgreement.sections.termination.title", contentKey: "partnerAgreement.sections.termination.content" },
  { titleKey: "partnerAgreement.sections.liability.title", contentKey: "partnerAgreement.sections.liability.content" },
  { titleKey: "partnerAgreement.sections.amendments.title", contentKey: "partnerAgreement.sections.amendments.content" },
  { titleKey: "partnerAgreement.sections.jurisdiction.title", contentKey: "partnerAgreement.sections.jurisdiction.content" },
  { titleKey: "partnerAgreement.sections.general.title", contentKey: "partnerAgreement.sections.general.content" },
];

/**
 * Generate HTML version of the agreement for storage
 */
export function generateAgreementHtml(t: (key: string) => string): string {
  const sections = agreementSections.map((section, index) => {
    const title = t(section.titleKey);
    const content = t(section.contentKey);
    return `
      <section class="agreement-section">
        <h3>${index + 1}. ${title}</h3>
        <div class="section-content">${content}</div>
      </section>
    `;
  }).join("\n");

  return `
    <article class="partner-agreement" lang="es">
      <header>
        <h1>${t("partnerAgreement.title")}</h1>
        <p class="version">${t("partnerAgreement.version")}: ${CURRENT_AGREEMENT_VERSION}</p>
        <p class="status">${t("partnerAgreement.draftStatus")}</p>
        <p class="date">${t("partnerAgreement.effectiveDate")}: ${new Date().toLocaleDateString()}</p>
      </header>
      <div class="agreement-body">
        ${sections}
      </div>
      <footer>
        <p class="legal-notice">${t("partnerAgreement.legalNotice")}</p>
      </footer>
    </article>
  `;
}
