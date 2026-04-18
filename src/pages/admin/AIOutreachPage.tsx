import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Megaphone, Users, Target, Mail, BarChart3, HelpCircle, Settings, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OutreachLeadsTab } from "@/components/admin/outreach/OutreachLeadsTab";
import { OutreachCRMTab } from "@/components/admin/outreach/OutreachCRMTab";
import { OutreachCampaignsTab } from "@/components/admin/outreach/OutreachCampaignsTab";
import { OutreachInboxTab } from "@/components/admin/outreach/OutreachInboxTab";
import { OutreachAnalyticsTab } from "@/components/admin/outreach/OutreachAnalyticsTab";
import { OutreachSettingsTab } from "@/components/admin/outreach/OutreachSettingsTab";
import { OutreachHelpDialog } from "@/components/admin/outreach/OutreachHelpDialog";
import { OutreachCapsWidget } from "@/components/admin/outreach/OutreachCapsWidget";
import { useOutreachPipeline } from "@/hooks/useOutreachPipeline";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const AIOutreachPage = () => {
  const { t } = useTranslation();
  const { runPipeline, isRunningPipeline, lastRun } = useOutreachPipeline();
  const [activeTab, setActiveTab] = useState("leads");
  const [helpOpen, setHelpOpen] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [showRunResult, setShowRunResult] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("outreach.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("outreach.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setPipelineRunning(true);
              runPipeline(undefined).finally(() => {
                setPipelineRunning(false);
                setShowRunResult(true);
              }).catch(error => {
                toast({ title: t("common.error"), description: error.message, variant: "destructive" });
              });
            }}
            disabled={isRunningPipeline || pipelineRunning}
            className="gap-2"
          >
            <Zap className="h-4 w-4" />
            {isRunningPipeline || pipelineRunning ? t("outreach.runningPipeline") : t("outreach.runFullPipeline")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            {t("outreach.help.howToUse")}
          </Button>
        </div>
      </div>

      <OutreachHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {/* Pipeline Run Result Dialog */}
      <Dialog open={showRunResult} onOpenChange={setShowRunResult}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("outreach.pipelineComplete")}</DialogTitle>
            <DialogDescription>
              {lastRun?.dry_run ? t("outreach.dryRunMode") : t("outreach.liveMode")}
            </DialogDescription>
          </DialogHeader>
          {lastRun && (
            <div className="space-y-2 text-sm">
              <p><strong>{t("outreach.pipeline.enriched")}:</strong> {lastRun.totals?.enriched || 0}</p>
              <p><strong>{t("outreach.pipeline.rated")}:</strong> {lastRun.totals?.rated || 0}</p>
              <p><strong>{t("outreach.pipeline.drafted")}:</strong> {lastRun.totals?.drafted || 0}</p>
              <p><strong>{t("outreach.pipeline.sent")}:</strong> {lastRun.totals?.sent || 0}</p>
              <p><strong>{t("outreach.pipeline.followups")}:</strong> {lastRun.totals?.followups || 0}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Caps Widget */}
      <OutreachCapsWidget />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
          <TabsTrigger value="leads" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t("outreach.tabs.leads")}</span>
          </TabsTrigger>
          <TabsTrigger value="crm" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">{t("outreach.tabs.crm")}</span>
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">{t("outreach.tabs.campaigns")}</span>
          </TabsTrigger>
          <TabsTrigger value="inbox" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">{t("outreach.tabs.inbox")}</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t("outreach.tabs.analytics")}</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">{t("outreach.caps.tabs.settings")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4">
          <OutreachLeadsTab />
        </TabsContent>

        <TabsContent value="crm" className="space-y-4">
          <OutreachCRMTab />
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <OutreachCampaignsTab />
        </TabsContent>

        <TabsContent value="inbox" className="space-y-4">
          <OutreachInboxTab />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <OutreachAnalyticsTab />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <OutreachSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AIOutreachPage;
