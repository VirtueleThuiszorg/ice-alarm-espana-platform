import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Image as ImageIcon,
  BarChart3,
  CheckCircle2,
  Lightbulb,
  ArrowRight,
  Zap,
  FileText,
  Calendar,
  Send,
} from "lucide-react";

interface MediaHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MediaHelpDialog = ({ open, onOpenChange }: MediaHelpDialogProps) => {
  const { t } = useTranslation();

  // Helper to safely get array from translation
  const getArrayFromTranslation = (value: unknown): string[] => {
    return Array.isArray(value) ? value : [];
  };

  const workflowSteps = getArrayFromTranslation(
    t("mediaManager.help.workflow.steps", { returnObjects: true })
  );

  const tabSections = [
    {
      id: "create",
      icon: Sparkles,
      title: t("mediaManager.help.create.title"),
      subtitle: t("mediaManager.help.create.subtitle"),
      intro: t("mediaManager.help.create.intro"),
      items: getArrayFromTranslation(t("mediaManager.help.create.steps", { returnObjects: true })),
      proTip: t("mediaManager.help.create.proTip"),
    },
    {
      id: "images",
      icon: ImageIcon,
      title: t("mediaManager.help.images.title"),
      subtitle: t("mediaManager.help.images.subtitle"),
      intro: t("mediaManager.help.images.intro"),
      items: getArrayFromTranslation(t("mediaManager.help.images.steps", { returnObjects: true })),
      proTip: t("mediaManager.help.images.proTip"),
    },
    {
      id: "publishing",
      icon: Send,
      title: t("mediaManager.help.publishing.title"),
      subtitle: t("mediaManager.help.publishing.subtitle"),
      intro: t("mediaManager.help.publishing.intro"),
      items: getArrayFromTranslation(t("mediaManager.help.publishing.steps", { returnObjects: true })),
      proTip: t("mediaManager.help.publishing.proTip"),
    },
    {
      id: "strategy",
      icon: Calendar,
      title: t("mediaManager.help.strategy.title"),
      subtitle: t("mediaManager.help.strategy.subtitle"),
      intro: t("mediaManager.help.strategy.intro"),
      items: getArrayFromTranslation(t("mediaManager.help.strategy.steps", { returnObjects: true })),
      proTip: t("mediaManager.help.strategy.proTip"),
    },
    {
      id: "analytics",
      icon: BarChart3,
      title: t("mediaManager.help.analytics.title"),
      subtitle: t("mediaManager.help.analytics.subtitle"),
      intro: t("mediaManager.help.analytics.intro"),
      items: getArrayFromTranslation(t("mediaManager.help.analytics.metrics", { returnObjects: true })),
      proTip: t("mediaManager.help.analytics.proTip"),
    },
  ];

  const bestPractices = getArrayFromTranslation(
    t("mediaManager.help.bestPractices.tips", { returnObjects: true })
  );

  const quickActions = getArrayFromTranslation(
    t("mediaManager.help.quickActions.items", { returnObjects: true })
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">{t("mediaManager.help.title")}</DialogTitle>
              <DialogDescription>{t("mediaManager.help.description")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-160px)] px-6">
          <div className="space-y-6 pb-4">
            {/* Overview Section */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary" />
                {t("mediaManager.help.overview.title")}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("mediaManager.help.overview.content")}
              </p>
            </div>

            {/* Visual Workflow */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                {t("mediaManager.help.workflow.title")}
              </h3>
              <div className="flex flex-wrap items-center gap-2 p-4 rounded-lg border bg-gradient-to-r from-primary/5 to-transparent">
                {workflowSteps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-medium">
                      {step}
                    </Badge>
                    {index < workflowSteps.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tab Sections Accordion */}
            <Accordion type="single" collapsible className="space-y-2">
              {tabSections.map((section) => (
                <AccordionItem
                  key={section.id}
                  value={section.id}
                  className="border rounded-lg px-4 data-[state=open]:bg-muted/20"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <section.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">{section.title}</div>
                        <div className="text-xs text-muted-foreground">{section.subtitle}</div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="space-y-3 pl-11">
                      <p className="text-sm text-muted-foreground">{section.intro}</p>
                      <ul className="space-y-2">
                        {section.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      {section.proTip && (
                        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                          <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            <span className="font-medium">{t("mediaManager.help.proTipLabel")}: </span>
                            {section.proTip}
                          </p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {/* Quick Actions Reference */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                {t("mediaManager.help.quickActions.title")}
              </h3>
              <div className="grid gap-2">
                {quickActions.map((action, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2 rounded-md border bg-card text-sm"
                  >
                    <Badge variant="outline" className="shrink-0 font-mono text-xs">
                      {index + 1}
                    </Badge>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Best Practices */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                {t("mediaManager.help.bestPractices.title")}
              </h3>
              <div className="grid gap-2">
                {bestPractices.map((tip, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-3 rounded-md border bg-primary/5"
                  >
                    <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t">
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t("mediaManager.help.gotIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
