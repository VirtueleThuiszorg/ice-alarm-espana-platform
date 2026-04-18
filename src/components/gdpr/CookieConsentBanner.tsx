import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Cookie, Settings, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ice_cookie_consent";

export interface CookiePreferences {
  essential: boolean; // Always true
  analytics: boolean;
  marketing: boolean;
  consentedAt: string;
}

function getStoredPreferences(): CookiePreferences | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as CookiePreferences;
    }
  } catch {
    // Corrupted data - treat as no consent
  }
  return null;
}

function savePreferences(prefs: CookiePreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = getStoredPreferences();
    if (!existing) {
      setVisible(true);
    }
  }, []);

  // Listen for external requests to re-open cookie settings
  useEffect(() => {
    const handler = () => {
      handleOpenCustomize();
    };
    window.addEventListener("ice:open-cookie-settings", handler);
    return () => window.removeEventListener("ice:open-cookie-settings", handler);
  }, []);

  const handleAcceptAll = () => {
    const prefs: CookiePreferences = {
      essential: true,
      analytics: true,
      marketing: true,
      consentedAt: new Date().toISOString(),
    };
    savePreferences(prefs);
    setVisible(false);
    setCustomizeOpen(false);
  };

  const handleRejectNonEssential = () => {
    const prefs: CookiePreferences = {
      essential: true,
      analytics: false,
      marketing: false,
      consentedAt: new Date().toISOString(),
    };
    savePreferences(prefs);
    setVisible(false);
    setCustomizeOpen(false);
  };

  const handleSaveCustom = () => {
    const prefs: CookiePreferences = {
      essential: true,
      analytics,
      marketing,
      consentedAt: new Date().toISOString(),
    };
    savePreferences(prefs);
    setVisible(false);
    setCustomizeOpen(false);
  };

  const handleOpenCustomize = () => {
    // Load current preferences into the customize dialog
    const existing = getStoredPreferences();
    if (existing) {
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
    }
    setCustomizeOpen(true);
  };

  return (
    <>
      {/* Main Banner */}
      {visible && !customizeOpen && (
        <div
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
                  <Cookie className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-tight">
                    {t("gdpr.cookieBanner.title")}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t("gdpr.cookieBanner.description")}
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
                  <Settings className="h-3.5 w-3.5" />
                  {t("gdpr.cookieBanner.customize")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRejectNonEssential}
                >
                  {t("gdpr.cookieBanner.rejectNonEssential")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleAcceptAll}
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
              <Shield className="h-5 w-5 text-primary" />
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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleRejectNonEssential}>
              {t("gdpr.cookieBanner.rejectNonEssential")}
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
  window.dispatchEvent(new CustomEvent("ice:open-cookie-settings"));
}

/**
 * Hook-friendly version: returns the current cookie preferences.
 */
export function getCookiePreferences(): CookiePreferences | null {
  return getStoredPreferences();
}
