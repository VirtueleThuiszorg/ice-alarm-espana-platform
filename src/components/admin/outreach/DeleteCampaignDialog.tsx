import { useTranslation } from "react-i18next";
import { Campaign } from "@/hooks/useOutreachCampaigns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

interface DeleteCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign | null;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteCampaignDialog({
  open,
  onOpenChange,
  campaign,
  onConfirm,
  isDeleting,
}: DeleteCampaignDialogProps) {
  const { t } = useTranslation();

  if (!campaign) return null;

  const hasActivity = campaign.emails_sent > 0 || campaign.leads_count > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>
              {t("outreach.campaigns.deleteTitle")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            {t("outreach.campaigns.deleteDescription", { name: campaign.name })}
          </AlertDialogDescription>
          
          {hasActivity && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>{t("common.warning")}:</strong> {t("outreach.campaigns.deleteWarning", {
                  leads: campaign.leads_count,
                  emails: campaign.emails_sent,
                })}
              </p>
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
