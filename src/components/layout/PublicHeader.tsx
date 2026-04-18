import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { LanguageSelector } from "@/components/LanguageSelector";
import { HeaderChatButton } from "@/components/chat/HeaderChatButton";
import { PublicMobileNav } from "@/components/layout/PublicMobileNav";

export function PublicHeader() {
  const { t } = useTranslation();

  const navItems = [
    { to: "/how-it-works", label: t("navigation.howItWorks") },
    { to: "/pendant", label: t("navigation.pendant") },
    { to: "/#pricing", label: t("navigation.pricing"), isAnchor: true },
    { to: "/partner", label: t("navigation.partners") },
    { to: "/contact", label: t("navigation.contact") },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/">
          <Logo size="sm" />
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) =>
            item.isAnchor ? (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <PublicMobileNav
            navItems={navItems}
            loginLabel={t("auth.memberLogin", { defaultValue: t("common.signIn") })}
            ctaLabel={t("landing.startProtection", { defaultValue: t("common.getStarted") })}
          />
          <div className="hidden md:flex items-center gap-2">
            <HeaderChatButton />
            <Button variant="ghost" asChild>
              <Link to="/login">{t("auth.memberLogin", { defaultValue: t("common.signIn") })}</Link>
            </Button>
            <Button asChild>
              <Link to="/join">{t("landing.startProtection", { defaultValue: t("common.getStarted") })}</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
