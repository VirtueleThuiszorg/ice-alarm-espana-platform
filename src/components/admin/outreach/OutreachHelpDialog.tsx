import { useTranslation } from "react-i18next";
import { 
  HelpCircle, Users, Target, Megaphone, Mail, BarChart3, Lightbulb, 
  ArrowRight, CheckCircle2, Zap, BookOpen
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface OutreachHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper to safely get array from translation
const getArrayFromTranslation = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
};

export const OutreachHelpDialog = ({ open, onOpenChange }: OutreachHelpDialogProps) => {
  const { t } = useTranslation();

  const workflowSteps = [
    { label: t("outreach.help.workflow.import"), color: "bg-blue-500" },
    { label: t("outreach.help.workflow.rate"), color: "bg-amber-500" },
    { label: t("outreach.help.workflow.qualify"), color: "bg-emerald-500" },
    { label: t("outreach.help.workflow.research"), color: "bg-purple-500" },
    { label: t("outreach.help.workflow.email"), color: "bg-pink-500" },
    { label: t("outreach.help.workflow.convert"), color: "bg-primary" },
  ];

  const tabSections = [
    {
      id: "leads",
      icon: Users,
      title: t("outreach.help.leads.title"),
      badge: "1",
      intro: t("outreach.help.leads.intro"),
      items: getArrayFromTranslation(t("outreach.help.leads.steps", { returnObjects: true })),
      proTip: t("outreach.help.leads.proTip"),
    },
    {
      id: "crm",
      icon: Target,
      title: t("outreach.help.crm.title"),
      badge: "2",
      intro: t("outreach.help.crm.intro"),
      items: getArrayFromTranslation(t("outreach.help.crm.steps", { returnObjects: true })),
      proTip: t("outreach.help.crm.proTip"),
    },
    {
      id: "campaigns",
      icon: Megaphone,
      title: t("outreach.help.campaigns.title"),
      badge: "3",
      intro: t("outreach.help.campaigns.intro"),
      items: getArrayFromTranslation(t("outreach.help.campaigns.steps", { returnObjects: true })),
      proTip: t("outreach.help.campaigns.proTip"),
    },
    {
      id: "inbox",
      icon: Mail,
      title: t("outreach.help.inbox.title"),
      badge: "4",
      intro: t("outreach.help.inbox.intro"),
      items: getArrayFromTranslation(t("outreach.help.inbox.steps", { returnObjects: true })),
      proTip: t("outreach.help.inbox.proTip"),
    },
    {
      id: "analytics",
      icon: BarChart3,
      title: t("outreach.help.analytics.title"),
      badge: "5",
      intro: t("outreach.help.analytics.intro"),
      items: getArrayFromTranslation(t("outreach.help.analytics.metrics", { returnObjects: true })),
    },
  ];

  const bestPractices = getArrayFromTranslation(t("outreach.help.bestPractices.tips", { returnObjects: true }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                {t("outreach.help.title")}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("outreach.help.subtitle")}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="p-6 space-y-6">
            {/* Workflow Diagram */}
            <div className="rounded-xl border bg-gradient-to-br from-muted/50 to-muted/20 p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                {t("outreach.help.workflow.title")}
              </h3>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {workflowSteps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${step.color}`}>
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium whitespace-nowrap">{step.label}</span>
                    </div>
                    {index < workflowSteps.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground mx-1 hidden sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Overview */}
            <div className="rounded-lg border p-4 bg-primary/5">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <HelpCircle className="h-5 w-5 text-primary mt-0.5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">{t("outreach.help.overview.title")}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("outreach.help.overview.content")}
                  </p>
                </div>
              </div>
            </div>

            {/* Tab Sections Accordion */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                {t("outreach.help.tabGuides")}
              </h3>
              <Accordion type="single" collapsible className="w-full space-y-2">
                {tabSections.map((section) => (
                  <AccordionItem 
                    key={section.id} 
                    value={section.id}
                    className="border rounded-lg px-4 data-[state=open]:bg-muted/30"
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="h-6 w-6 p-0 justify-center rounded-full text-xs">
                          {section.badge}
                        </Badge>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <section.icon className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{section.title}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="pl-[4.5rem] space-y-3">
                        <p className="text-sm text-muted-foreground">{section.intro}</p>
                        <div className="space-y-2">
                          {section.items.map((item, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{item}</span>
                            </div>
                          ))}
                        </div>
                        {section.proTip && (
                          <div className="mt-3 rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
                            <div className="flex gap-2">
                              <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                  {t("outreach.help.proTipLabel")}
                                </span>
                                <p className="text-sm text-muted-foreground mt-0.5">{section.proTip}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* Best Practices */}
            <div className="rounded-xl border bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-emerald-500" />
                {t("outreach.help.bestPractices.title")}
              </h3>
              <div className="grid gap-2">
                {bestPractices.map((tip, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex-shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-sm text-muted-foreground">{tip}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                {t("outreach.help.quickActions.title")}
              </h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {t("outreach.help.quickActions.rateAll")}
                  </Badge>
                  <span className="text-muted-foreground">{t("outreach.help.quickActions.rateAllDesc")}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {t("outreach.help.quickActions.moveQualified")}
                  </Badge>
                  <span className="text-muted-foreground">{t("outreach.help.quickActions.moveQualifiedDesc")}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {t("outreach.help.quickActions.research")}
                  </Badge>
                  <span className="text-muted-foreground">{t("outreach.help.quickActions.researchDesc")}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {t("outreach.help.quickActions.generateEmail")}
                  </Badge>
                  <span className="text-muted-foreground">{t("outreach.help.quickActions.generateEmailDesc")}</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t("outreach.help.gotIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
