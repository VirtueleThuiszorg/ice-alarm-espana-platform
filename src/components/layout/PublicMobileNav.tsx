import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/ui/logo";
import { LanguageSelector } from "@/components/LanguageSelector";
import { HeaderChatButton } from "@/components/chat/HeaderChatButton";
import { useTranslation } from "react-i18next";

interface NavItem {
  to: string;
  label: string;
  isAnchor?: boolean;
}

interface PublicMobileNavProps {
  navItems: NavItem[];
  loginLabel?: string;
  ctaLabel?: string;
}

export function PublicMobileNav({ navItems, loginLabel, ctaLabel }: PublicMobileNavProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();

  const login = loginLabel || t("common.signIn", "Sign In");
  const cta = ctaLabel || t("common.getStarted", "Get Started");

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label={t("navigation.menu", "Menu")}
      >
        <Menu className="h-6 w-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("navigation.menu", "Menu")}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="h-16 flex items-center px-6 border-b">
              <Logo size="sm" />
            </div>

            {/* Nav links */}
            <nav className="flex-1 py-4">
              {navItems.map((item) => {
                const isActive = location.pathname === item.to || location.hash === item.to;
                return item.isAnchor ? (
                  <a
                    key={item.to}
                    href={item.to}
                    onClick={() => setOpen(false)}
                    className={`block px-6 py-3 text-sm font-medium transition-colors hover:bg-muted ${
                      isActive ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={`block px-6 py-3 text-sm font-medium transition-colors hover:bg-muted ${
                      isActive ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Actions */}
            <div className="border-t p-4 space-y-3">
              <div className="flex items-center gap-2">
                <HeaderChatButton />
                <LanguageSelector />
              </div>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/login" onClick={() => setOpen(false)}>
                  {login}
                </Link>
              </Button>
              <Button className="w-full" asChild>
                <Link to="/join" onClick={() => setOpen(false)}>
                  {cta}
                </Link>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
