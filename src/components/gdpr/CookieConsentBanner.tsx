import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CookieIcon, SettingsIcon, ShieldIcon } from "@/components/ui/shell-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  OPEN_COOKIE_SETTINGS_EVENT,
  readCookieConsent,
  saveCookieConsent,
  type CookiePreferences,
} from "@/lib/cookieConsent";

export type { CookiePreferences };

/**
 * FIRST LAYER + SETTINGS DIALOG — LSSI-CE art. 22.2 / AEPD cookie guide (2023).
 *
 *   - "Reject all" and "Accept all" sit side by side, same size, same style: refusing is exactly
 *     as easy as accepting (AEPD). The old first layer styled reject as `secondary`.
 *   - Toggles start OFF every time there is no stored choice. Nothing is pre-ticked.
 *   - The first layer links to the Cookie Policy (/cookies).
 *   - The record is versioned and expires (src/lib/cookieConsent.ts); an old record re-asks.
 *   - Settings can be re-opened at any time from the footer and from the member's account page.
 *
 * DRAFT — pending legal review (LEGAL.md §5).
 */
export function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!readCookieConsent()) {
      setVisible(true);
    }
  }, []);

  const handleOpenCustomize = useCallback(() => {
    // Load the current choice into the dialog; with no choice on record, everything starts OFF.
    const existing = readCookieConsent();
    setAnalytics(existing?.analytics ?? false);
    setMarketing(existing?.marketing ?? false);
    setCustomizeOpen(true);
  }, []);

  // Listen for external requests to re-open cookie settings (footer link, account page)
  useEffect(() => {
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, handleOpenCustomize);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, handleOpenCustomize);
  }, [handleOpenCustomize]);

  const close = () => {
    setVisible(false);
    setCustomizeOpen(false);
  };

  const handleAcceptAll = () => {
    saveCookieConsent({ analytics: true, marketing: true, method: "accept_all" });
    close();
  };

  const handleRejectNonEssential = () => {
    saveCookieConsent({ analytics: false, marketing: false, method: "reject_all" });
    close();
  };

  const handleSaveCustom = () => {
    saveCookieConsent({ analytics, marketing, method: "custom" });
    close();
  };

  return (
    <>
      {/* Main Banner */}
      {visible && !customizeOpen && (
        <div
          role="region"
          aria-label={t("gdpr.cookieBanner.title")}
          data-testid="cookie-banner"
          className={cn(
            "fixed bottom-0 left-0 right-0 z-[60] border-t bg-background/95 backdrop-blur",
            "supports-[backdrop-filter]:bg-background/80",
            "shadow-[0_-4px_20px_rgba(0,0,0,0.1)]",
            "animate-in slide-in-from-bottom duration-500"
          )}
        >
          <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Message */}
              <div className="flex items-start gap-3 sm:flex-1">
                <div className="mt-0.5 rounded-full bg-primary/10 p-2">
                  <CookieIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-tight">
                    {t("gdpr.cookieBanner.title")}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t("gdpr.cookieBanner.description")}{" "}
                    <Link to="/cookies" className="underline underline-offset-2 hover:text-foreground">
                      {t("gdpr.cookieBanner.policyLink")}
                    </Link>
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenCustomize}
                  className="gap-1.5"
                >
                  <SettingsIcon className="h-3.5 w-3.5" />
                  {t("gdpr.cookieBanner.customize")}
                </Button>
                {/* Same variant and size as "Accept all": refusing must be as easy as accepting. */}
                <Button
                  size="sm"
                  onClick={handleRejectNonEssential}
                  data-testid="cookie-reject"
                >
                  {t("gdpr.cookieBanner.rejectNonEssential")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleAcceptAll}
                  data-testid="cookie-accept"
                >
                  {t("gdpr.cookieBanner.acceptAll")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customize Dialog */}
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldIcon className="h-5 w-5 text-primary" />
              {t("gdpr.cookieSettings.title")}
            </DialogTitle>
            <DialogDescription>
              {t("gdpr.cookieSettings.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Essential Cookies - Always On */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">
                  {t("gdpr.cookieSettings.essential")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("gdpr.cookieSettings.essentialDescription")}
                </p>
              </div>
              <Switch checked disabled aria-label={t("gdpr.cookieSettings.essential")} />
            </div>

            {/* Analytics Cookies */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="analytics-cookies" className="text-sm font-medium">
                  {t("gdpr.cookieSettings.analytics")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("gdpr.cookieSettings.analyticsDescription")}
                </p>
              </div>
              <Switch
                id="analytics-cookies"
                checked={analytics}
                onCheckedChange={setAnalytics}
                aria-label={t("gdpr.cookieSettings.analytics")}
              />
            </div>

            {/* Marketing Cookies */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="marketing-cookies" className="text-sm font-medium">
                  {t("gdpr.cookieSettings.marketing")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("gdpr.cookieSettings.marketingDescription")}
                </p>
              </div>
              <Switch
                id="marketing-cookies"
                checked={marketing}
                onCheckedChange={setMarketing}
                aria-label={t("gdpr.cookieSettings.marketing")}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            <Link
              to="/cookies"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setCustomizeOpen(false)}
            >
              {t("gdpr.cookieBanner.policyLink")}
            </Link>
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleRejectNonEssential}>
              {t("gdpr.cookieBanner.rejectNonEssential")}
            </Button>
            <Button variant="outline" onClick={handleAcceptAll}>
              {t("gdpr.cookieBanner.acceptAll")}
            </Button>
            <Button onClick={handleSaveCustom}>
              {t("gdpr.cookieSettings.savePreferences")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Utility to re-open the cookie settings dialog from elsewhere in the app.
 * Dispatches a custom event that CookieConsentBanner listens for.
 */
export function openCookieSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_COOKIE_SETTINGS_EVENT));
}

/**
 * The current, valid cookie choice — null when none, outdated or expired.
 */
export function getCookiePreferences(): CookiePreferences | null {
  return readCookieConsent();
}
