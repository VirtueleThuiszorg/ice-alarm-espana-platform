import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle,
    Activity,
    Zap,
    Megaphone,
    Crown,
    UserCheck,
    Cpu,
    Handshake,
    Sparkles,
    ShieldCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAIAgents, useUpdateAgent } from "@/hooks/useAIAgents";
import { useIsabellaSettings, useIsabellaStats } from "@/hooks/useIsabellaSettings";
import { Badge } from "@/components/ui/badge";
import { DeadSwitch } from "@/components/admin/ai/DeadSwitch";
import { BehaviorProfileCard } from "@/components/admin/ai/BehaviorProfileCard";
import type { BehaviorProfile } from "@/components/admin/ai/BehaviorProfileCard";
import { BehaviorDetailPanel } from "@/components/admin/ai/BehaviorDetailPanel";
import type { BehaviorSection } from "@/components/admin/ai/BehaviorDetailPanel";
import { useToast } from "@/hooks/use-toast";

/* ─── Behavior Sections Definition ──────────────────────────────────── */

const BEHAVIOR_SECTIONS: BehaviorSection[] = [
    {
        id: "alert-handling",
        titleKey: "isabella.sections.alertHandling",
        descKey: "isabella.sections.alertHandlingDesc",
        icon: AlertTriangle,
        iconColor: "text-red-500",
        iconBg: "from-red-400 to-rose-500",
        cardIconBg: "bg-red-500/10",
        agentKey: "customer_service_expert",
        functions: [
            { key: "device_offline_response", nameKey: "isabella.functions.deviceOfflineResponse", descKey: "isabella.functions.deviceOfflineResponseDesc" },
            { key: "low_battery_alerts", nameKey: "isabella.functions.lowBatteryAlerts", descKey: "isabella.functions.lowBatteryAlertsDesc" },
            { key: "sos_button_triage", nameKey: "isabella.functions.sosButtonTriage", descKey: "isabella.functions.sosButtonTriageDesc" },
            { key: "fall_detection_triage", nameKey: "isabella.functions.fallDetectionTriage", descKey: "isabella.functions.fallDetectionTriageDesc" },
        ],
    },
    {
        id: "inbound-comms",
        titleKey: "isabella.sections.inboundCommunications",
        descKey: "isabella.sections.inboundCommunicationsDesc",
        icon: Activity,
        iconColor: "text-blue-500",
        iconBg: "from-blue-400 to-indigo-500",
        cardIconBg: "bg-blue-500/10",
        agentKey: "customer_service_expert",
        functions: [
            { key: "inbound_phone_calls", nameKey: "isabella.functions.inboundPhoneCalls", descKey: "isabella.functions.inboundPhoneCallsDesc" },
            { key: "inbound_sms", nameKey: "isabella.functions.inboundSms", descKey: "isabella.functions.inboundSmsDesc" },
            { key: "inbound_whatsapp", nameKey: "isabella.functions.inboundWhatsapp", descKey: "isabella.functions.inboundWhatsappDesc" },
            { key: "inbound_email", nameKey: "isabella.functions.inboundEmail", descKey: "isabella.functions.inboundEmailDesc" },
            { key: "chat_widget", nameKey: "isabella.functions.chatWidget", descKey: "isabella.functions.chatWidgetDesc" },
        ],
    },
    {
        id: "outbound-comms",
        titleKey: "isabella.sections.outboundCommunications",
        descKey: "isabella.sections.outboundCommunicationsDesc",
        icon: Zap,
        iconColor: "text-amber-500",
        iconBg: "from-amber-400 to-yellow-500",
        cardIconBg: "bg-amber-500/10",
        agentKey: "customer_service_expert",
        functions: [
            { key: "courtesy_calls", nameKey: "isabella.functions.courtesyCalls", descKey: "isabella.functions.courtesyCallsDesc" },
            { key: "welcome_calls", nameKey: "isabella.functions.welcomeCalls", descKey: "isabella.functions.welcomeCallsDesc" },
            { key: "onboarding_checkins", nameKey: "isabella.functions.onboardingCheckins", descKey: "isabella.functions.onboardingCheckinsDesc" },
            { key: "payment_reminders", nameKey: "isabella.functions.paymentReminders", descKey: "isabella.functions.paymentRemindersDesc" },
            { key: "followup_calls", nameKey: "isabella.functions.followupCalls", descKey: "isabella.functions.followupCallsDesc" },
            { key: "birthday_calls", nameKey: "isabella.functions.birthdayCalls", descKey: "isabella.functions.birthdayCallsDesc" },
        ],
    },
    {
        id: "sales-leads",
        titleKey: "isabella.sections.salesAndLeads",
        descKey: "isabella.sections.salesAndLeadsDesc",
        icon: Megaphone,
        iconColor: "text-green-500",
        iconBg: "from-green-400 to-emerald-500",
        cardIconBg: "bg-green-500/10",
        agentKey: "customer_service_expert",
        functions: [
            { key: "lead_followup_calls", nameKey: "isabella.functions.leadFollowupCalls", descKey: "isabella.functions.leadFollowupCallsDesc" },
            { key: "abandoned_signup_recovery", nameKey: "isabella.functions.abandonedSignupRecovery", descKey: "isabella.functions.abandonedSignupRecoveryDesc" },
            { key: "partner_enquiry_handling", nameKey: "isabella.functions.partnerEnquiryHandling", descKey: "isabella.functions.partnerEnquiryHandlingDesc" },
            { key: "b2b_outreach_campaigns", nameKey: "isabella.functions.b2bOutreachCampaigns", descKey: "isabella.functions.b2bOutreachCampaignsDesc" },
        ],
    },
    {
        id: "boss-intelligence",
        titleKey: "isabella.sections.bossIntelligence",
        descKey: "isabella.sections.bossIntelligenceDesc",
        icon: Crown,
        iconColor: "text-yellow-500",
        iconBg: "from-yellow-400 to-amber-500",
        cardIconBg: "bg-yellow-500/10",
        agentKey: "main_brain",
        functions: [
            { key: "new_sale_notification", nameKey: "isabella.functions.newSaleNotification", descKey: "isabella.functions.newSaleNotificationDesc" },
            { key: "cancellation_alert", nameKey: "isabella.functions.cancellationAlert", descKey: "isabella.functions.cancellationAlertDesc" },
            { key: "failed_payment_escalation", nameKey: "isabella.functions.failedPaymentEscalation", descKey: "isabella.functions.failedPaymentEscalationDesc" },
            { key: "daily_boss_briefing", nameKey: "isabella.functions.dailyBossBriefing", descKey: "isabella.functions.dailyBossBriefingDesc" },
            { key: "weekly_revenue_summary", nameKey: "isabella.functions.weeklyRevenueSummary", descKey: "isabella.functions.weeklyRevenueSummaryDesc" },
            { key: "emergency_escalation_alert", nameKey: "isabella.functions.emergencyEscalationAlert", descKey: "isabella.functions.emergencyEscalationAlertDesc" },
            { key: "negative_feedback_alert", nameKey: "isabella.functions.negativeFeedbackAlert", descKey: "isabella.functions.negativeFeedbackAlertDesc" },
        ],
    },
    {
        id: "member-lifecycle",
        titleKey: "isabella.sections.memberLifecycle",
        descKey: "isabella.sections.memberLifecycleDesc",
        icon: UserCheck,
        iconColor: "text-teal-500",
        iconBg: "from-teal-400 to-cyan-500",
        cardIconBg: "bg-teal-500/10",
        agentKey: "member_specialist",
        functions: [
            { key: "membership_anniversary", nameKey: "isabella.functions.membershipAnniversary", descKey: "isabella.functions.membershipAnniversaryDesc" },
            { key: "inactivity_check", nameKey: "isabella.functions.inactivityCheck", descKey: "isabella.functions.inactivityCheckDesc" },
            { key: "subscription_renewal_reminder", nameKey: "isabella.functions.subscriptionRenewalReminder", descKey: "isabella.functions.subscriptionRenewalReminderDesc" },
            { key: "medical_profile_incomplete", nameKey: "isabella.functions.medicalProfileIncomplete", descKey: "isabella.functions.medicalProfileIncompleteDesc" },
            { key: "device_not_activated", nameKey: "isabella.functions.deviceNotActivated", descKey: "isabella.functions.deviceNotActivatedDesc" },
            { key: "upgrade_suggestion", nameKey: "isabella.functions.upgradeSuggestion", descKey: "isabella.functions.upgradeSuggestionDesc" },
        ],
    },
    {
        id: "device-infrastructure",
        titleKey: "isabella.sections.deviceInfrastructure",
        descKey: "isabella.sections.deviceInfrastructureDesc",
        icon: Cpu,
        iconColor: "text-purple-500",
        iconBg: "from-purple-400 to-violet-500",
        cardIconBg: "bg-purple-500/10",
        agentKey: "main_brain",
        functions: [
            { key: "stock_low_alert", nameKey: "isabella.functions.stockLowAlert", descKey: "isabella.functions.stockLowAlertDesc" },
            { key: "device_health_monitor", nameKey: "isabella.functions.deviceHealthMonitor", descKey: "isabella.functions.deviceHealthMonitorDesc" },
            { key: "sim_expiry_warning", nameKey: "isabella.functions.simExpiryWarning", descKey: "isabella.functions.simExpiryWarningDesc" },
            { key: "bulk_offline_alert", nameKey: "isabella.functions.bulkOfflineAlert", descKey: "isabella.functions.bulkOfflineAlertDesc" },
            { key: "provisioning_stalled", nameKey: "isabella.functions.provisioningStalled", descKey: "isabella.functions.provisioningStalledDesc" },
        ],
    },
    {
        id: "partner-network",
        titleKey: "isabella.sections.partnerNetwork",
        descKey: "isabella.sections.partnerNetworkDesc",
        icon: Handshake,
        iconColor: "text-orange-500",
        iconBg: "from-orange-400 to-amber-500",
        cardIconBg: "bg-orange-500/10",
        agentKey: "customer_service_expert",
        functions: [
            { key: "new_partner_signup", nameKey: "isabella.functions.newPartnerSignup", descKey: "isabella.functions.newPartnerSignupDesc" },
            { key: "partner_first_referral", nameKey: "isabella.functions.partnerFirstReferral", descKey: "isabella.functions.partnerFirstReferralDesc" },
            { key: "partner_commission_due", nameKey: "isabella.functions.partnerCommissionDue", descKey: "isabella.functions.partnerCommissionDueDesc" },
            { key: "partner_inactive_warning", nameKey: "isabella.functions.partnerInactiveWarning", descKey: "isabella.functions.partnerInactiveWarningDesc" },
            { key: "partner_agreement_expiring", nameKey: "isabella.functions.partnerAgreementExpiring", descKey: "isabella.functions.partnerAgreementExpiringDesc" },
        ],
    },
    {
        id: "content-marketing",
        titleKey: "isabella.sections.contentMarketing",
        descKey: "isabella.sections.contentMarketingDesc",
        icon: Sparkles,
        iconColor: "text-pink-500",
        iconBg: "from-pink-400 to-rose-500",
        cardIconBg: "bg-pink-500/10",
        agentKey: "main_brain",
        functions: [
            { key: "auto_generate_scheduled_content", nameKey: "isabella.functions.autoGenerateScheduledContent", descKey: "isabella.functions.autoGenerateScheduledContentDesc" },
            { key: "content_approval_reminder", nameKey: "isabella.functions.contentApprovalReminder", descKey: "isabella.functions.contentApprovalReminderDesc" },
            { key: "auto_publish_approved_content", nameKey: "isabella.functions.autoPublishApprovedContent", descKey: "isabella.functions.autoPublishApprovedContentDesc" },
            { key: "blog_post_performance", nameKey: "isabella.functions.blogPostPerformance", descKey: "isabella.functions.blogPostPerformanceDesc" },
            { key: "social_engagement_alert", nameKey: "isabella.functions.socialEngagementAlert", descKey: "isabella.functions.socialEngagementAlertDesc" },
        ],
    },
    {
        id: "compliance-legal",
        titleKey: "isabella.sections.complianceLegal",
        descKey: "isabella.sections.complianceLegalDesc",
        icon: ShieldCheck,
        iconColor: "text-emerald-500",
        iconBg: "from-emerald-400 to-green-500",
        cardIconBg: "bg-emerald-500/10",
        agentKey: "main_brain",
        functions: [
            { key: "gdpr_deletion_request", nameKey: "isabella.functions.gdprDeletionRequest", descKey: "isabella.functions.gdprDeletionRequestDesc" },
            { key: "gdpr_export_request", nameKey: "isabella.functions.gdprExportRequest", descKey: "isabella.functions.gdprExportRequestDesc" },
            { key: "sla_breach_alert", nameKey: "isabella.functions.slaBreachAlert", descKey: "isabella.functions.slaBreachAlertDesc" },
            { key: "audit_anomaly_detection", nameKey: "isabella.functions.auditAnomalyDetection", descKey: "isabella.functions.auditAnomalyDetectionDesc" },
            { key: "operational_cost_due", nameKey: "isabella.functions.operationalCostDue", descKey: "isabella.functions.operationalCostDueDesc" },
        ],
    },
];

/* ─── Main Page Component ───────────────────────────────────────────── */

export default function AIBehaviorsPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { data: agents, isLoading: agentsLoading } = useAIAgents();
    const { data: settings, isLoading: settingsLoading } = useIsabellaSettings();
    const { data: stats } = useIsabellaStats();
    const updateAgent = useUpdateAgent();
    const [selectedBehavior, setSelectedBehavior] = useState<string | null>(null);

    const isLoading = agentsLoading || settingsLoading;

    // Build settings lookup
    const settingsMap = (settings || []).reduce<Record<string, any>>((acc, s) => {
        acc[s.function_key] = s;
        return acc;
    }, {});

    // Build agent lookup
    const agentMap = (agents || []).reduce<Record<string, any>>((acc, a) => {
        acc[a.agent_key] = a;
        return acc;
    }, {});

    // Map sections to profile cards
    const profiles: BehaviorProfile[] = BEHAVIOR_SECTIONS.map((section) => {
        const agent = agentMap[section.agentKey];
        const activeFns = section.functions.filter((f) => settingsMap[f.key]?.enabled).length;
        return {
            id: section.id,
            key: section.id,
            icon: section.icon,
            iconColor: section.iconColor,
            iconBg: section.cardIconBg,
            gradientBg: section.iconBg,
            name: t(section.titleKey),
            description: t(section.descKey),
            enabled: agent?.enabled ?? false,
            mode: agent?.mode ?? "advise_only",
            functionsCount: section.functions.length,
            activeFunctions: activeFns,
        };
    });

    const handleToggleAgent = async (sectionId: string, enabled: boolean) => {
        const section = BEHAVIOR_SECTIONS.find((s) => s.id === sectionId);
        if (!section) return;
        const agent = agentMap[section.agentKey];
        if (!agent) return;

        try {
            await updateAgent.mutateAsync({ agentId: agent.id, updates: { enabled } });
            toast({
                title: enabled
                    ? t("ai.agentEnabled", "Agent Enabled")
                    : t("ai.agentPaused", "Agent Paused"),
            });
        } catch {
            toast({ title: t("common.error", "Error"), variant: "destructive" });
        }
    };

    const selectedSection = BEHAVIOR_SECTIONS.find((s) => s.id === selectedBehavior);

    const totalFunctions = BEHAVIOR_SECTIONS.reduce((sum, s) => sum + s.functions.length, 0);
    const totalActive = BEHAVIOR_SECTIONS.reduce(
        (sum, s) => sum + s.functions.filter((f) => settingsMap[f.key]?.enabled).length,
        0
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    {t("ai.behaviors.title", "Isabella Behaviors")}
                </h1>
                <p className="text-muted-foreground mt-1">
                    {t("ai.behaviors.subtitle", "Configure how Isabella operates across every area of your business")}
                </p>
            </div>

            {/* Dead Switch */}
            {isLoading ? (
                <Skeleton className="h-24 rounded-xl" />
            ) : (
                <DeadSwitch agents={agents || []} />
            )}

            {/* Stats Strip */}
            <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="gap-1.5 py-1.5 px-3 text-sm">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    {t("ai.behaviors.stats.activeFunctions", "{{active}} of {{total}} functions active", {
                        active: totalActive,
                        total: totalFunctions,
                    })}
                </Badge>
                <Badge variant="outline" className="gap-1.5 py-1.5 px-3 text-sm">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    {t("ai.behaviors.stats.behaviors", "{{count}} behavior areas", {
                        count: BEHAVIOR_SECTIONS.length,
                    })}
                </Badge>
                {stats && (
                    <>
                        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 text-sm">
                            <Activity className="h-3.5 w-3.5 text-blue-500" />
                            {t("isabella.status.interactionsToday", "{{count}} interactions today", { count: stats.interactionsToday ?? 0 })}
                        </Badge>
                        <Badge variant="outline" className="gap-1.5 py-1.5 px-3 text-sm">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            {t("isabella.status.escalatedToHumans", "{{count}} escalated today", { count: stats.escalationsToday ?? 0 })}
                        </Badge>
                    </>
                )}
            </div>

            {/* Behavior Cards Grid */}
            {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <Skeleton key={i} className="h-[180px] rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {profiles.map((profile) => (
                        <BehaviorProfileCard
                            key={profile.key}
                            profile={profile}
                            isSelected={selectedBehavior === profile.key}
                            onSelect={(key) =>
                                setSelectedBehavior((prev) => (prev === key ? null : key))
                            }
                            onToggleEnabled={handleToggleAgent}
                            isToggling={updateAgent.isPending}
                        />
                    ))}
                </div>
            )}

            {/* Expanded Detail Panel */}
            {selectedSection && (
                <BehaviorDetailPanel
                    section={selectedSection}
                    onClose={() => setSelectedBehavior(null)}
                />
            )}
        </div>
    );
}
