import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Bot, User } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useIsabellaSettings, useIsabellaStats } from "@/hooks/useIsabellaSettings";

const FUNCTION_LABELS: Record<string, string> = {
  device_offline_response: "isabella.functions.deviceOfflineResponse",
  low_battery_alerts: "isabella.functions.lowBatteryAlerts",
  sos_button_triage: "isabella.functions.sosButtonTriage",
  fall_detection_triage: "isabella.functions.fallDetectionTriage",
  inbound_phone_calls: "isabella.functions.inboundPhoneCalls",
  inbound_sms: "isabella.functions.inboundSms",
  inbound_whatsapp: "isabella.functions.inboundWhatsapp",
  inbound_email: "isabella.functions.inboundEmail",
  chat_widget: "isabella.functions.chatWidget",
  courtesy_calls: "isabella.functions.courtesyCalls",
  welcome_calls: "isabella.functions.welcomeCalls",
  onboarding_checkins: "isabella.functions.onboardingCheckins",
  payment_reminders: "isabella.functions.paymentReminders",
  followup_calls: "isabella.functions.followupCalls",
  birthday_calls: "isabella.functions.birthdayCalls",
  lead_followup_calls: "isabella.functions.leadFollowupCalls",
  abandoned_signup_recovery: "isabella.functions.abandonedSignupRecovery",
  partner_enquiry_handling: "isabella.functions.partnerEnquiryHandling",
  b2b_outreach_campaigns: "isabella.functions.b2bOutreachCampaigns",
  // Boss / Owner Intelligence
  new_sale_notification: "isabella.functions.newSaleNotification",
  cancellation_alert: "isabella.functions.cancellationAlert",
  failed_payment_escalation: "isabella.functions.failedPaymentEscalation",
  daily_boss_briefing: "isabella.functions.dailyBossBriefing",
  weekly_revenue_summary: "isabella.functions.weeklyRevenueSummary",
  emergency_escalation_alert: "isabella.functions.emergencyEscalationAlert",
  negative_feedback_alert: "isabella.functions.negativeFeedbackAlert",
  // Member Lifecycle
  membership_anniversary: "isabella.functions.membershipAnniversary",
  inactivity_check: "isabella.functions.inactivityCheck",
  subscription_renewal_reminder: "isabella.functions.subscriptionRenewalReminder",
  medical_profile_incomplete: "isabella.functions.medicalProfileIncomplete",
  device_not_activated: "isabella.functions.deviceNotActivated",
  upgrade_suggestion: "isabella.functions.upgradeSuggestion",
  // Device & Infrastructure
  stock_low_alert: "isabella.functions.stockLowAlert",
  device_health_monitor: "isabella.functions.deviceHealthMonitor",
  sim_expiry_warning: "isabella.functions.simExpiryWarning",
  bulk_offline_alert: "isabella.functions.bulkOfflineAlert",
  provisioning_stalled: "isabella.functions.provisioningStalled",
  // Partner Network
  new_partner_signup: "isabella.functions.newPartnerSignup",
  partner_first_referral: "isabella.functions.partnerFirstReferral",
  partner_commission_due: "isabella.functions.partnerCommissionDue",
  partner_inactive_warning: "isabella.functions.partnerInactiveWarning",
  partner_agreement_expiring: "isabella.functions.partnerAgreementExpiring",
  // Content & Marketing
  auto_generate_scheduled_content: "isabella.functions.autoGenerateScheduledContent",
  content_approval_reminder: "isabella.functions.contentApprovalReminder",
  auto_publish_approved_content: "isabella.functions.autoPublishApprovedContent",
  blog_post_performance: "isabella.functions.blogPostPerformance",
  social_engagement_alert: "isabella.functions.socialEngagementAlert",
  // Compliance & Legal
  gdpr_deletion_request: "isabella.functions.gdprDeletionRequest",
  gdpr_export_request: "isabella.functions.gdprExportRequest",
  sla_breach_alert: "isabella.functions.slaBreachAlert",
  audit_anomaly_detection: "isabella.functions.auditAnomalyDetection",
  operational_cost_due: "isabella.functions.operationalCostDue",
};

export function IsabellaStatusBanner() {
  const { t } = useTranslation();
  const { data: settings } = useIsabellaSettings();
  const { data: stats } = useIsabellaStats();

  const enabledFunctions = (settings || []).filter((s) => s.enabled);
  const isActive = enabledFunctions.length > 0;

  if (!settings) return null;

  return (
    <Alert className={isActive ? "border-green-500/50 bg-green-500/5" : ""}>
      {isActive ? <Bot className="h-4 w-4 text-green-600" /> : <User className="h-4 w-4" />}
      <AlertTitle className="flex items-center justify-between">
        <span>
          {isActive
            ? `🤖 ${t("isabella.banner.isabellaActive", "ISABELLA ACTIVE")}`
            : `👤 ${t("isabella.banner.humanMode", "HUMAN MODE: All alerts and communications routed to staff")}`}
        </span>
        <Link to="/admin/ai/operations" className="text-sm font-normal text-primary hover:underline">
          {t("common.manage", "Manage")}
        </Link>
      </AlertTitle>
      {isActive && (
        <AlertDescription className="mt-1">
          <span className="text-xs">
            {enabledFunctions.map((f) => t(FUNCTION_LABELS[f.function_key] || f.function_key)).join(", ")}
          </span>
          <span className="block text-xs text-muted-foreground mt-1">
            {t("isabella.banner.managing", {
              interactions: stats?.interactionsToday ?? 0,
              escalated: stats?.escalationsToday ?? 0,
            })}
          </span>
        </AlertDescription>
      )}
    </Alert>
  );
}
