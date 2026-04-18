import { useTranslation } from "react-i18next";
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
import { AlertTriangle, Facebook, FileText, BarChart3, Loader2 } from "lucide-react";

interface UnpublishPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
  postTopic?: string;
}

export function UnpublishPostDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  postTopic,
}: UnpublishPostDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertDialogTitle>
              {t("mediaManager.unpublish.title")}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-4">
            <p>
              {t("mediaManager.unpublish.description")}
            </p>
            
            {postTopic && (
              <p className="font-medium text-foreground bg-muted p-2 rounded text-sm">
                "{postTopic}"
              </p>
            )}

            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">
                {t("mediaManager.unpublish.willBeDeleted")}:
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Facebook className="h-4 w-4 text-blue-600" />
                  <span>{t("mediaManager.unpublish.items.facebook")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span>{t("mediaManager.unpublish.items.blog")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-amber-600" />
                  <span>{t("mediaManager.unpublish.items.metrics")}</span>
                </li>
              </ul>
            </div>

            <p className="text-destructive font-medium text-sm">
              {t("mediaManager.unpublish.warning")}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t("mediaManager.unpublish.unpublishing")}
              </>
            ) : (
              t("mediaManager.unpublish.confirm")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
