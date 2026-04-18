import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Lock, Activity, AlertTriangle, Zap, Settings, ExternalLink, Info,
  Crown, UserCheck, Cpu, Handshake, Megaphone, ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIsabellaSettings, useUpdateIsabellaSetting, useIsabellaStats, IsabellaSetting } from "@/hooks/useIsabellaSettings";
import { useAuth } from "@/contexts/AuthContext";

const FUNCTION_KEY_MAP: Record<string, { nameKey: string; descKey: string }> = {
  device_offline_response: { nameKey: "isabella.functions.deviceOfflineResponse", descKey: "isabella.functions.deviceOfflineResponseDesc" },
  low_battery_alerts: { nameKey: "isabella.functions.lowBatteryAlerts", descKey: "isabella.functions.lowBatteryAlertsDesc" },
  sos_button_triage: { nameKey: "isabella.functions.sosButtonTriage", descKey: "isabella.functions.sosButtonTriageDesc" },
  fall_detection_triage: { nameKey: "isabella.functions.fallDetectionTriage", descKey: "isabella.functions.fallDetectionTriageDesc" },
  inbound_phone_calls: { nameKey: "isabella.functions.inboundPhoneCalls", descKey: "isabella.functions.inboundPhoneCallsDesc" },
  inbound_sms: { nameKey: "isabella.functions.inboundSms", descKey: "isabella.functions.inboundSmsDesc" },
  inbound_whatsapp: { nameKey: "isabella.functions.inboundWhatsapp", descKey: "isabella.functions.inboundWhatsappDesc" },
  inbound_email: { nameKey: "isabella.functions.inboundEmail", descKey: "isabella.functions.inboundEmailDesc" },
  chat_widget: { nameKey: "isabella.functions.chatWidget", descKey: "isabella.functions.chatWidgetDesc" },
  courtesy_calls: { nameKey: "isabella.functions.courtesyCalls", descKey: "isabella.functions.courtesyCallsDesc" },
  welcome_calls: { nameKey: "isabella.functions.welcomeCalls", descKey: "isabella.functions.welcomeCallsDesc" },
  onboarding_checkins: { nameKey: "isabella.functions.onboardingCheckins", descKey: "isabella.functions.onboardingCheckinsDesc" },
  payment_reminders: { nameKey: "isabella.functions.paymentReminders", descKey: "isabella.functions.paymentRemindersDesc" },
  followup_calls: { nameKey: "isabella.functions.followupCalls", descKey: "isabella.functions.followupCallsDesc" },
  birthday_calls: { nameKey: "isabella.functions.birthdayCalls", descKey: "isabella.functions.birthdayCallsDesc" },
  lead_followup_calls: { nameKey: "isabella.functions.leadFollowupCalls", descKey: "isabella.functions.leadFollowupCallsDesc" },
  abandoned_signup_recovery: { nameKey: "isabella.functions.abandonedSignupRecovery", descKey: "isabella.functions.abandonedSignupRecoveryDesc" },
  partner_enquiry_handling: { nameKey: "isabella.functions.partnerEnquiryHandling", descKey: "isabella.functions.partnerEnquiryHandlingDesc" },
  b2b_outreach_campaigns: { nameKey: "isabella.functions.b2bOutreachCampaigns", descKey: "isabella.functions.b2bOutreachCampaignsDesc" },
  new_sale_notification: { nameKey: "isabella.functions.newSaleNotification", descKey: "isabella.functions.newSaleNotificationDesc" },
  cancellation_alert: { nameKey: "isabella.functions.cancellationAlert", descKey: "isabella.functions.cancellationAlertDesc" },
  failed_payment_escalation: { nameKey: "isabella.functions.failedPaymentEscalation", descKey: "isabella.functions.failedPaymentEscalationDesc" },
  daily_boss_briefing: { nameKey: "isabella.functions.dailyBossBriefing", descKey: "isabella.functions.dailyBossBriefingDesc" },
  weekly_revenue_summary: { nameKey: "isabella.functions.weeklyRevenueSummary", descKey: "isabella.functions.weeklyRevenueSummaryDesc" },
  emergency_escalation_alert: { nameKey: "isabella.functions.emergencyEscalationAlert", descKey: "isabella.functions.emergencyEscalationAlertDesc" },
  negative_feedback_alert: { nameKey: "isabella.functions.negativeFeedbackAlert", descKey: "isabella.functions.negativeFeedbackAlertDesc" },
  membership_anniversary: { nameKey: "isabella.functions.membershipAnniversary", descKey: "isabella.functions.membershipAnniversaryDesc" },
  inactivity_check: { nameKey: "isabella.functions.inactivityCheck", descKey: "isabella.functions.inactivityCheckDesc" },
  subscription_renewal_reminder: { nameKey: "isabella.functions.subscriptionRenewalReminder", descKey: "isabella.functions.subscriptionRenewalReminderDesc" },
  medical_profile_incomplete: { nameKey: "isabella.functions.medicalProfileIncomplete", descKey: "isabella.functions.medicalProfileIncompleteDesc" },
  device_not_activated: { nameKey: "isabella.functions.deviceNotActivated", descKey: "isabella.functions.deviceNotActivatedDesc" },
  upgrade_suggestion: { nameKey: "isabella.functions.upgradeSuggestion", descKey: "isabella.functions.upgradeSuggestionDesc" },
  stock_low_alert: { nameKey: "isabella.functions.stockLowAlert", descKey: "isabella.functions.stockLowAlertDesc" },
  device_health_monitor: { nameKey: "isabella.functions.deviceHealthMonitor", descKey: "isabella.functions.deviceHealthMonitorDesc" },
  sim_expiry_warning: { nameKey: "isabella.functions.simExpiryWarning", descKey: "isabella.functions.simExpiryWarningDesc" },
  bulk_offline_alert: { nameKey: "isabella.functions.bulkOfflineAlert", descKey: "isabella.functions.bulkOfflineAlertDesc" },
  provisioning_stalled: { nameKey: "isabella.functions.provisioningStalled", descKey: "isabella.functions.provisioningStalledDesc" },
  new_partner_signup: { nameKey: "isabella.functions.newPartnerSignup", descKey: "isabella.functions.newPartnerSignupDesc" },
  partner_first_referral: { nameKey: "isabella.functions.partnerFirstReferral", descKey: "isabella.functions.partnerFirstReferralDesc" },
  partner_commission_due: { nameKey: "isabella.functions.partnerCommissionDue", descKey: "isabella.functions.partnerCommissionDueDesc" },
  partner_inactive_warning: { nameKey: "isabella.functions.partnerInactiveWarning", descKey: "isabella.functions.partnerInactiveWarningDesc" },
  partner_agreement_expiring: { nameKey: "isabella.functions.partnerAgreementExpiring", descKey: "isabella.functions.partnerAgreementExpiringDesc" },
  auto_generate_scheduled_content: { nameKey: "isabella.functions.autoGenerateScheduledContent", descKey: "isabella.functions.autoGenerateScheduledContentDesc" },
  content_approval_reminder: { nameKey: "isabella.functions.contentApprovalReminder", descKey: "isabella.functions.contentApprovalReminderDesc" },
  auto_publish_approved_content: { nameKey: "isabella.functions.autoPublishApprovedContent", descKey: "isabella.functions.autoPublishApprovedContentDesc" },
  blog_post_performance: { nameKey: "isabella.functions.blogPostPerformance", descKey: "isabella.functions.blogPostPerformanceDesc" },
  social_engagement_alert: { nameKey: "isabella.functions.socialEngagementAlert", descKey: "isabella.functions.socialEngagementAlertDesc" },
  gdpr_deletion_request: { nameKey: "isabella.functions.gdprDeletionRequest", descKey: "isabella.functions.gdprDeletionRequestDesc" },
  gdpr_export_request: { nameKey: "isabella.functions.gdprExportRequest", descKey: "isabella.functions.gdprExportRequestDesc" },
  sla_breach_alert: { nameKey: "isabella.functions.slaBreachAlert", descKey: "isabella.functions.slaBreachAlertDesc" },
  audit_anomaly_detection: { nameKey: "isabella.functions.auditAnomalyDetection", descKey: "isabella.functions.auditAnomalyDetectionDesc" },
  operational_cost_due: { nameKey: "isabella.functions.operationalCostDue", descKey: "isabella.functions.operationalCostDueDesc" },
};

interface SectionDef {
  titleKey: string;
  descKey?: string;
  keys: string[];
  icon: LucideIcon;
  iconColor: string;
}

const SECTIONS: SectionDef[] = [
  {
    titleKey: "isabella.sections.alertHandling",
    descKey: "isabella.sections.alertHandlingDesc",
    keys: ["device_offline_response", "low_battery_alerts", "sos_button_triage", "fall_detection_triage"],
    icon: AlertTriangle,
    iconColor: "text-red-500",
  },
  {
    titleKey: "isabella.sections.inboundCommunications",
    descKey: "isabella.sections.inboundCommunicationsDesc",
    keys: ["inbound_phone_calls", "inbound_sms", "inbound_whatsapp", "inbound_email", "chat_widget"],
    icon: Activity,
    iconColor: "text-blue-500",
  },
  {
    titleKey: "isabella.sections.outboundCommunications",
    descKey: "isabella.sections.outboundCommunicationsDesc",
    keys: ["courtesy_calls", "welcome_calls", "onboarding_checkins", "payment_reminders", "followup_calls", "birthday_calls"],
    icon: Zap,
    iconColor: "text-amber-500",
  },
  {
    titleKey: "isabella.sections.salesAndLeads",
    descKey: "isabella.sections.salesAndLeadsDesc",
    keys: ["lead_followup_calls", "abandoned_signup_recovery", "partner_enquiry_handling", "b2b_outreach_campaigns"],
    icon: Megaphone,
    iconColor: "text-green-500",
  },
  {
    titleKey: "isabella.sections.bossIntelligence",
    descKey: "isabella.sections.bossIntelligenceDesc",
    keys: ["new_sale_notification", "cancellation_alert", "failed_payment_escalation", "daily_boss_briefing", "weekly_revenue_summary", "emergency_escalation_alert", "negative_feedback_alert"],
    icon: Crown,
    iconColor: "text-yellow-500",
  },
  {
    titleKey: "isabella.sections.memberLifecycle",
    descKey: "isabella.sections.memberLifecycleDesc",
    keys: ["membership_anniversary", "inactivity_check", "subscription_renewal_reminder", "medical_profile_incomplete", "device_not_activated", "upgrade_suggestion"],
    icon: UserCheck,
    iconColor: "text-teal-500",
  },
  {
    titleKey: "isabella.sections.deviceInfrastructure",
    descKey: "isabella.sections.deviceInfrastructureDesc",
    keys: ["stock_low_alert", "device_health_monitor", "sim_expiry_warning", "bulk_offline_alert", "provisioning_stalled"],
    icon: Cpu,
    iconColor: "text-purple-500",
  },
  {
    titleKey: "isabella.sections.partnerNetwork",
    descKey: "isabella.sections.partnerNetworkDesc",
    keys: ["new_partner_signup", "partner_first_referral", "partner_commission_due", "partner_inactive_warning", "partner_agreement_expiring"],
    icon: Handshake,
    iconColor: "text-orange-500",
  },
  {
    titleKey: "isabella.sections.contentMarketing",
    descKey: "isabella.sections.contentMarketingDesc",
    keys: ["auto_generate_scheduled_content", "content_approval_reminder", "auto_publish_approved_content", "blog_post_performance", "social_engagement_alert"],
    icon: Megaphone,
    iconColor: "text-pink-500",
  },
  {
    titleKey: "isabella.sections.complianceLegal",
    descKey: "isabella.sections.complianceLegalDesc",
    keys: ["gdpr_deletion_request", "gdpr_export_request", "sla_breach_alert", "audit_anomaly_detection", "operational_cost_due"],
    icon: ShieldCheck,
    iconColor: "text-emerald-500",
  },
];

const ALWAYS_HUMAN = [
  "isabella.alwaysHumanItems.emergencyDispatch",
  "isabella.alwaysHumanItems.physicalHandling",
  "isabella.alwaysHumanItems.bankTransfers",
  "isabella.alwaysHumanItems.largeRefunds",
];

export default function IsabellaOperationsPage() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useIsabellaSettings();
  const { data: stats } = useIsabellaStats();
  const updateMutation = useUpdateIsabellaSetting();
  const { user } = useAuth();

  const settingsMap = (settings || []).reduce<Record<string, IsabellaSetting>>((acc, s) => {
    acc[s.function_key] = s;
    return acc;
  }, {});

  const handleToggle = (functionKey: string, newEnabled: boolean) => {
    const setting = settingsMap[functionKey];
    if (!setting) return;
    updateMutation.mutate({ id: setting.id, enabled: newEnabled, staffId: user?.id });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("isabella.title", "Isabella Operations")}</h1>
          <p className="text-muted-foreground mt-1">{t("isabella.subtitle", "Control which functions Isabella handles automatically")}</p>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4">
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
            <Zap className="h-3.5 w-3.5" />
            {t("isabella.status.functionsActive", { count: stats?.enabledCount ?? 0 })}
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
            <Activity className="h-3.5 w-3.5" />
            {t("isabella.status.interactionsToday", { count: stats?.interactionsToday ?? 0 })}
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("isabella.status.escalatedToHumans", { count: stats?.escalationsToday ?? 0 })}
          </Badge>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            {SECTIONS.map((section) => {
              const SectionIcon = section.icon;
              const activeCount = section.keys.filter((k) => settingsMap[k]?.enabled).length;
              const totalCount = section.keys.length;

              return (
                <Card key={section.titleKey}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <SectionIcon className={`h-5 w-5 ${section.iconColor}`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{t(section.titleKey)}</CardTitle>
                          {section.descKey && (
                            <CardDescription className="mt-0.5">{t(section.descKey)}</CardDescription>
                          )}
                        </div>
                      </div>
                      <Badge variant={activeCount > 0 ? "default" : "secondary"} className="text-xs">
                        {activeCount}/{totalCount} active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {section.keys.map((key) => {
                      const meta = FUNCTION_KEY_MAP[key];
                      const setting = settingsMap[key];
                      if (!meta) return null;
                      const configJson = setting?.config;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-4 py-2.5 px-2 rounded-md border-b last:border-0 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm">{t(meta.nameKey)}</p>
                              {configJson && Object.keys(configJson).length > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs">
                                    <pre className="text-xs whitespace-pre-wrap">
                                      {JSON.stringify(configJson, null, 2)}
                                    </pre>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{t(meta.descKey)}</p>
                          </div>
                          <Switch
                            checked={setting?.enabled ?? false}
                            onCheckedChange={(checked) => handleToggle(key, checked)}
                            disabled={updateMutation.isPending}
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}

            {/* Always Human */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{t("isabella.sections.alwaysHuman", "Always Human")}</CardTitle>
                    <CardDescription className="mt-0.5">{t("isabella.sections.alwaysHumanDesc", "These tasks are too critical or sensitive for automation and will always require a human.")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ALWAYS_HUMAN.map((key) => (
                  <div key={key} className="flex items-center gap-3 py-2 text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0" />
                    <p className="text-sm">{t(key)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Advanced Configuration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-lg">{t("isabella.advancedConfig.title", "Advanced Configuration")}</CardTitle>
                    <CardDescription>{t("isabella.advancedConfig.description", "Configure the AI agents that power Isabella's functions")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: t("isabella.advancedConfig.customerServiceAgent", "Customer Service & Sales Agent"), path: "/admin/ai/agents/customer_service_expert" },
                  { label: t("isabella.advancedConfig.mainBrain", "Main Brain"), path: "/admin/ai/agents/main_brain" },
                  { label: t("isabella.advancedConfig.memberSpecialist", "Member Specialist"), path: "/admin/ai/agents/member_specialist" },
                ].map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className="flex items-center justify-between py-2.5 px-3 rounded-md border hover:bg-muted/50 transition-colors group"
                  >
                    <span className="text-sm font-medium">{link.label}</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                ))}
                <p className="text-xs text-muted-foreground pt-2">
                  {t("isabella.advancedConfig.hint", "These links let you customise AI prompts, memory, and permissions.")}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
