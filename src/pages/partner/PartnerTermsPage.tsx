import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PartnerAgreementText } from "@/components/partner/PartnerAgreementText";

/**
 * /partner/terms — the public, readable Partner Agreement.
 *
 * Linked from the Create Account step of /partner/join (opens in a new tab) and cited in
 * clause 19.5 of the agreement itself. Renders the same `agreementSections` as every other
 * surface through PartnerAgreementText; it holds no copy of its own.
 */
export default function PartnerTermsPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <Button variant="ghost" className="mb-6" asChild>
            <Link to="/partner/join">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("partnerAgreement.backToJoin")}
            </Link>
          </Button>

          <div className="mb-8 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSignature className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{t("partnerAgreement.title")}</h1>
              <p className="text-muted-foreground">{t("partnerAgreement.publicPageDescription")}</p>
            </div>
          </div>

          <PartnerAgreementText headingLevel={2} />
        </div>
      </main>

      <footer className="py-8 px-4 bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto text-center text-sm text-sidebar-foreground/60">
          <p>© {new Date().getFullYear()} ICE Alarm España. {t("landing.allRightsReserved")}</p>
          <div className="mt-2 space-x-4">
            <Link to="/terms" className="hover:text-sidebar-foreground">{t("legal.footer.termsOfService")}</Link>
            <Link to="/privacy" className="hover:text-sidebar-foreground">{t("legal.footer.privacyPolicy")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
