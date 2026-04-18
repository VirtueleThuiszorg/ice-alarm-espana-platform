import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Trash2, Cookie, Shield, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { useGdprExport } from "@/hooks/useGdprExport";
import { useGdprDeletion } from "@/hooks/useGdprDeletion";
import { openCookieSettings } from "@/components/gdpr/CookieConsentBanner";

export function GdprSettingsSection() {
  const { t } = useTranslation();
  const { exportData, isExporting } = useGdprExport();
  const {
    requestDeletion,
    cancelDeletion,
    isPending,
    isSubmitting,
    isSubmitted,
  } = useGdprDeletion();

  const handleDeleteClick = () => {
    // First click opens confirmation dialog
    requestDeletion();
  };

  const handleConfirmDelete = () => {
    // Second call submits the request
    requestDeletion();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-primary" />
          {t("gdpr.settings.title")}
        </CardTitle>
        <CardDescription>
          {t("gdpr.settings.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Download My Data */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t("gdpr.settings.downloadTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {t("gdpr.settings.downloadDescription")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={isExporting}
            className="gap-1.5 shrink-0"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting
              ? t("gdpr.settings.downloading")
              : t("gdpr.settings.downloadButton")}
          </Button>
        </div>

        <Separator />

        {/* Cookie Preferences */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t("gdpr.settings.cookieTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {t("gdpr.settings.cookieDescription")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openCookieSettings}
            className="gap-1.5 shrink-0"
          >
            <Cookie className="h-4 w-4" />
            {t("gdpr.settings.cookieButton")}
          </Button>
        </div>

        <Separator />

        {/* Delete My Account */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-destructive">
              {t("gdpr.settings.deleteTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("gdpr.settings.deleteDescription")}
            </p>
          </div>
          {isSubmitted ? (
            <Button variant="outline" size="sm" disabled className="gap-1.5 shrink-0">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t("gdpr.settings.deleteSubmitted")}
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteClick}
              className="gap-1.5 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
              {t("gdpr.settings.deleteButton")}
            </Button>
          )}
        </div>
      </CardContent>

      {/* Deletion Confirmation Dialog */}
      <Dialog open={isPending} onOpenChange={(open) => !open && cancelDeletion()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("gdpr.deleteDialog.title")}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {t("gdpr.deleteDialog.warning")}
              </span>
              <span className="block text-xs">
                {t("gdpr.deleteDialog.details")}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={cancelDeletion}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isSubmitting
                ? t("gdpr.deleteDialog.submitting")
                : t("gdpr.deleteDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
