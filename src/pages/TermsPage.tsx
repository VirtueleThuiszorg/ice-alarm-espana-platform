import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import TermsContent from "@/components/legal/TermsContent";
import { PublicHeader } from "@/components/layout/PublicHeader";

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Main Content */}
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Back Button */}
          <Button variant="ghost" className="mb-6" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>

          {/* Document Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">{t("legal.terms.title")}</h1>
                <p className="text-muted-foreground">{t("legal.terms.company")}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("legal.terms.lastUpdated")}
            </p>
          </div>

          {/* Terms Content */}
          <div className="prose prose-slate dark:prose-invert max-w-none">
            <TermsContent />
          </div>
        </div>
      </main>

      {/* Footer */}
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
