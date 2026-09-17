import { useTranslation } from "react-i18next";
import { agreementSections, CURRENT_AGREEMENT_VERSION } from "@/content/partnerAgreementTerms";
import { cn } from "@/lib/utils";

interface PartnerAgreementTextProps {
  /** Heading level for each clause title, so the text nests correctly in its host page. */
  headingLevel?: 2 | 3 | 4;
  /** Hide the version / draft-status line when the host already shows it. */
  showMeta?: boolean;
  /** Smaller type for embedded panels (the join form, the signed-agreement card). */
  compact?: boolean;
  className?: string;
}

/**
 * The Partner Agreement, rendered from `agreementSections`.
 *
 * The single renderer for the agreement text: the /partner/join panel, the public
 * /partner/terms page, the portal signing modal and the signed-agreement page all use
 * it, so the text a partner accepts at registration is the text they later sign.
 * Content is trusted, repo-authored locale HTML (the same pattern as TermsContent).
 */
export function PartnerAgreementText({
  headingLevel = 3,
  showMeta = true,
  compact = false,
  className,
}: PartnerAgreementTextProps) {
  const { t } = useTranslation();
  const Heading = `h${headingLevel}` as const;

  return (
    <div className={cn("max-w-none", className)} data-testid="partner-agreement-text">
      {showMeta && (
        <p className="text-sm text-muted-foreground mb-4">
          {t("partnerAgreement.version")}: {CURRENT_AGREEMENT_VERSION} · {t("partnerAgreement.draftStatus")}
        </p>
      )}

      {agreementSections.map((section, index) => (
        <section key={section.titleKey} className={compact ? "mb-4" : "mb-8"}>
          <Heading className={cn("font-semibold", compact ? "text-sm mb-1" : "text-lg mb-3")}>
            {index + 1}. {t(section.titleKey)}
          </Heading>
          <div
            className={cn(
              "text-muted-foreground leading-relaxed whitespace-pre-line",
              compact ? "text-xs" : "text-sm",
            )}
            dangerouslySetInnerHTML={{ __html: t(section.contentKey) }}
          />
        </section>
      ))}

      <p className={cn("font-medium", compact ? "text-xs" : "text-sm mt-8 p-4 bg-muted rounded-lg")}>
        {t("partnerAgreement.legalNotice")}
      </p>
    </div>
  );
}
