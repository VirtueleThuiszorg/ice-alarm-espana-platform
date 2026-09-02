/**
 * Partner Agreement Terms - Spanish Law Compliant
 * ICE Alarm España S.L. (CIF: B24731531)
 * 
 * This agreement is governed by Spanish law and contains
 * the full terms and conditions for partner relationships.
 */

export const CURRENT_AGREEMENT_VERSION = "1.0";

export interface AgreementSection {
  titleKey: string;
  contentKey: string;
}

export const agreementSections: AgreementSection[] = [
  { titleKey: "partnerAgreement.sections.parties.title", contentKey: "partnerAgreement.sections.parties.content" },
  { titleKey: "partnerAgreement.sections.definitions.title", contentKey: "partnerAgreement.sections.definitions.content" },
  { titleKey: "partnerAgreement.sections.object.title", contentKey: "partnerAgreement.sections.object.content" },
  { titleKey: "partnerAgreement.sections.obligations.title", contentKey: "partnerAgreement.sections.obligations.content" },
  { titleKey: "partnerAgreement.sections.commissions.title", contentKey: "partnerAgreement.sections.commissions.content" },
  { titleKey: "partnerAgreement.sections.payment.title", contentKey: "partnerAgreement.sections.payment.content" },
  { titleKey: "partnerAgreement.sections.intellectualProperty.title", contentKey: "partnerAgreement.sections.intellectualProperty.content" },
  { titleKey: "partnerAgreement.sections.confidentiality.title", contentKey: "partnerAgreement.sections.confidentiality.content" },
  { titleKey: "partnerAgreement.sections.dataProtection.title", contentKey: "partnerAgreement.sections.dataProtection.content" },
  { titleKey: "partnerAgreement.sections.duration.title", contentKey: "partnerAgreement.sections.duration.content" },
  { titleKey: "partnerAgreement.sections.termination.title", contentKey: "partnerAgreement.sections.termination.content" },
  { titleKey: "partnerAgreement.sections.liability.title", contentKey: "partnerAgreement.sections.liability.content" },
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
