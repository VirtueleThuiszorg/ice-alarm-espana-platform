import { Link } from "react-router-dom";
import { ArrowLeft, Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import CookiesContent from "@/components/legal/CookiesContent";
import { CookieFooterLinks } from "@/components/legal/CookieFooterLinks";
import { PublicHeader } from "@/components/layout/PublicHeader";

/** /cookies — the Cookie Policy. Same frame as /privacy and /terms. */
export default function CookiesPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <Button variant="ghost" className="mb-6" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Cookie className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">{t("legal.cookies.title")}</h1>
                <p className="text-muted-foreground">{t("legal.cookies.company")}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t("legal.cookies.lastUpdated")}</p>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none">
            <CookiesContent />
          </div>
        </div>
      </main>

      <footer className="py-8 px-4 bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto text-center text-sm text-sidebar-foreground/60">
          <p>© {new Date().getFullYear()} ICE Alarm España. {t("landing.allRightsReserved")}</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            <li>
              <Link to="/terms" className="hover:text-sidebar-foreground">{t("legal.footer.termsOfService")}</Link>
            </li>
            <li>
              <Link to="/privacy" className="hover:text-sidebar-foreground">{t("legal.footer.privacyPolicy")}</Link>
            </li>
            <CookieFooterLinks className="hover:text-sidebar-foreground" />
          </ul>
        </div>
      </footer>
    </div>
  );
}
