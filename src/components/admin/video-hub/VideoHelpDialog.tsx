import { useTranslation } from "react-i18next";
import { HelpCircle, Video, Wand2, Layout, Download, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VideoHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoHelpDialog({ open, onOpenChange }: VideoHelpDialogProps) {
  const { t } = useTranslation();

  const sections = [
    {
      icon: Video,
      title: t("videoHub.help.projectsTitle"),
      description: t("videoHub.help.projectsDesc"),
    },
    {
      icon: Wand2,
      title: t("videoHub.help.createTitle"),
      description: t("videoHub.help.createDesc"),
    },
    {
      icon: Layout,
      title: t("videoHub.help.templatesTitle"),
      description: t("videoHub.help.templatesDesc"),
    },
    {
      icon: Download,
      title: t("videoHub.help.exportsTitle"),
      description: t("videoHub.help.exportsDesc"),
    },
    {
      icon: Settings,
      title: t("videoHub.help.settingsTitle"),
      description: t("videoHub.help.settingsDesc"),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {t("videoHub.help.title")}
          </DialogTitle>
          <DialogDescription>{t("videoHub.help.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {sections.map((section, index) => (
            <div key={index} className="flex gap-4 rounded-lg border p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <section.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">{section.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-muted p-4">
          <h4 className="font-medium">{t("videoHub.help.tipsTitle")}</h4>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>• {t("videoHub.help.tip1")}</li>
            <li>• {t("videoHub.help.tip2")}</li>
            <li>• {t("videoHub.help.tip3")}</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
