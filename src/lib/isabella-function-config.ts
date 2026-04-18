import { supabase } from "@/integrations/supabase/client";

export interface IsabellaFunctionConfig {
  agent_key: string;
  triggers: string[];
  description: string;
  capabilities: string[];
  notify_roles?: ("admin" | "call_centre" | "partner")[];
  critical?: boolean;
}

export const ISABELLA_FUNCTION_CONFIG: Record<string, IsabellaFunctionConfig> = {
  // --- Alert Handling (4) ---
  device_offline_response: {
    agent_key: "customer_service_expert",
    triggers: ["device.offline", "alert.device_offline"],
    description: "Handle device offline alerts",
    capabilities: ["voice_call", "sms", "escalate"],
  },
  low_battery_alerts: {
    agent_key: "customer_service_expert",
    triggers: ["device.low_battery", "alert.low_battery"],
    description: "Send battery reminders",
    capabilities: ["sms"],
  },
  sos_button_triage: {
    agent_key: "customer_service_expert",
    triggers: ["alert.sos_button"],
    description: "Triage SOS alerts",
    capabilities: ["voice_call", "escalate"],
    critical: true,
  },
  fall_detection_triage: {
    agent_key: "customer_service_expert",
    triggers: ["alert.fall_detected"],
    description: "Triage fall alerts",
    capabilities: ["voice_call", "escalate"],
    critical: true,
  },

  // --- Inbound Communications (5) ---
  inbound_phone_calls: {
    agent_key: "customer_service_expert",
    triggers: ["call.inbound"],
    description: "Answer inbound calls",
    capabilities: ["voice_call", "escalate", "transfer"],
  },
  inbound_sms: {
    agent_key: "customer_service_expert",
    triggers: ["sms.inbound"],
    description: "Auto-respond to SMS",
    capabilities: ["sms", "escalate"],
  },
  inbound_whatsapp: {
    agent_key: "customer_service_expert",
    triggers: ["whatsapp.inbound"],
    description: "Auto-respond to WhatsApp",
    capabilities: ["whatsapp", "escalate"],
  },
  inbound_email: {
    agent_key: "customer_service_expert",
    triggers: ["email.inbound"],
    description: "Auto-respond to email",
    capabilities: ["email", "escalate"],
  },
  chat_widget: {
    agent_key: "customer_service_expert",
    triggers: ["chat.message"],
    description: "Handle website chat",
    capabilities: ["chat", "escalate"],
  },

  // --- Outbound Communications (6) ---
  courtesy_calls: {
    agent_key: "customer_service_expert",
    triggers: ["scheduled.courtesy_call"],
    description: "Make courtesy calls",
    capabilities: ["voice_call"],
  },
  welcome_calls: {
    agent_key: "customer_service_expert",
    triggers: ["member.created"],
    description: "Welcome new members",
    capabilities: ["voice_call"],
  },
  onboarding_checkins: {
    agent_key: "customer_service_expert",
    triggers: ["scheduled.onboarding_checkin"],
    description: "Onboarding check-in calls",
    capabilities: ["voice_call"],
  },
  payment_reminders: {
    agent_key: "customer_service_expert",
    triggers: ["payment.failed"],
    description: "Payment reminder calls",
    capabilities: ["voice_call", "sms"],
  },
  followup_calls: {
    agent_key: "customer_service_expert",
    triggers: ["scheduled.followup"],
    description: "Follow-up calls",
    capabilities: ["voice_call"],
  },
  birthday_calls: {
    agent_key: "customer_service_expert",
    triggers: ["scheduled.birthday"],
    description: "Birthday calls",
    capabilities: ["voice_call"],
  },

  // --- Sales & Leads (4) ---
  lead_followup_calls: {
    agent_key: "customer_service_expert",
    triggers: ["lead.created", "lead.stale"],
    description: "Lead follow-up calls",
    capabilities: ["voice_call", "sms"],
  },
  abandoned_signup_recovery: {
    agent_key: "customer_service_expert",
    triggers: ["registration.abandoned"],
    description: "Recover abandoned signups",
    capabilities: ["voice_call", "sms", "email"],
  },
  partner_enquiry_handling: {
    agent_key: "customer_service_expert",
    triggers: ["partner.enquiry"],
    description: "Handle partner enquiries",
    capabilities: ["voice_call", "email", "escalate"],
  },
  b2b_outreach_campaigns: {
    agent_key: "customer_service_expert",
    triggers: ["outreach.scheduled"],
    description: "B2B outreach",
    capabilities: ["email", "voice_call"],
  },

  // --- Boss / Owner Intelligence (7) ---
  new_sale_notification: {
    agent_key: "main_brain",
    triggers: ["subscription.created", "order.completed"],
    description: "Notify owner of new sales",
    capabilities: ["in_app", "email", "whatsapp"],
    notify_roles: ["admin"],
  },
  cancellation_alert: {
    agent_key: "main_brain",
    triggers: ["subscription.cancelled", "subscription.expired"],
    description: "Alert owner on cancellations",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  failed_payment_escalation: {
    agent_key: "main_brain",
    triggers: ["payment.failed_repeated"],
    description: "Escalate persistent failed payments",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  daily_boss_briefing: {
    agent_key: "main_brain",
    triggers: ["scheduled.daily_briefing"],
    description: "Daily morning briefing for owner",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  weekly_revenue_summary: {
    agent_key: "main_brain",
    triggers: ["scheduled.weekly_revenue"],
    description: "Weekly revenue summary report",
    capabilities: ["email"],
    notify_roles: ["admin"],
  },
  emergency_escalation_alert: {
    agent_key: "main_brain",
    triggers: ["alert.escalated_to_human"],
    description: "Alert owner on real emergencies",
    capabilities: ["in_app", "email", "whatsapp"],
    notify_roles: ["admin", "call_centre"],
    critical: true,
  },
  negative_feedback_alert: {
    agent_key: "main_brain",
    triggers: ["feedback.submitted_low"],
    description: "Alert on negative member feedback",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },

  // --- Member Lifecycle Automation (6) ---
  membership_anniversary: {
    agent_key: "customer_service_expert",
    triggers: ["scheduled.anniversary"],
    description: "Membership milestone celebrations",
    capabilities: ["voice_call", "sms"],
  },
  inactivity_check: {
    agent_key: "customer_service_expert",
    triggers: ["device.inactive_extended"],
    description: "Reach out to inactive device users",
    capabilities: ["sms", "voice_call"],
  },
  subscription_renewal_reminder: {
    agent_key: "customer_service_expert",
    triggers: ["subscription.renewal_approaching"],
    description: "Remind about upcoming renewal",
    capabilities: ["sms", "email"],
  },
  medical_profile_incomplete: {
    agent_key: "customer_service_expert",
    triggers: ["member.profile_incomplete"],
    description: "Nudge to complete medical profile",
    capabilities: ["sms", "email"],
  },
  device_not_activated: {
    agent_key: "customer_service_expert",
    triggers: ["device.not_activated"],
    description: "Follow up on unactivated devices",
    capabilities: ["sms", "voice_call"],
  },
  upgrade_suggestion: {
    agent_key: "customer_service_expert",
    triggers: ["member.upgrade_candidate"],
    description: "Suggest plan upgrades",
    capabilities: ["in_app", "email"],
  },

  // --- Device & Infrastructure Monitoring (5) ---
  stock_low_alert: {
    agent_key: "main_brain",
    triggers: ["inventory.stock_low"],
    description: "Alert on low pendant stock",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  device_health_monitor: {
    agent_key: "main_brain",
    triggers: ["device.flapping"],
    description: "Monitor device health flapping",
    capabilities: ["in_app"],
  },
  sim_expiry_warning: {
    agent_key: "main_brain",
    triggers: ["sim.expiry_approaching"],
    description: "Warn about expiring SIMs",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  bulk_offline_alert: {
    agent_key: "main_brain",
    triggers: ["device.bulk_offline"],
    description: "Alert on mass device outage",
    capabilities: ["in_app", "email", "whatsapp"],
    notify_roles: ["admin"],
    critical: true,
  },
  provisioning_stalled: {
    agent_key: "main_brain",
    triggers: ["device.provisioning_stalled"],
    description: "Flag stalled provisioning",
    capabilities: ["in_app"],
  },

  // --- Partner Network Management (5) ---
  new_partner_signup: {
    agent_key: "main_brain",
    triggers: ["partner.created"],
    description: "Notify on new partner signup",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  partner_first_referral: {
    agent_key: "customer_service_expert",
    triggers: ["partner.first_referral"],
    description: "Celebrate first partner referral",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin", "partner"],
  },
  partner_commission_due: {
    agent_key: "main_brain",
    triggers: ["partner.commission_threshold"],
    description: "Alert on commission payout due",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  partner_inactive_warning: {
    agent_key: "customer_service_expert",
    triggers: ["partner.inactive"],
    description: "Warn about inactive partners",
    capabilities: ["email"],
    notify_roles: ["admin"],
  },
  partner_agreement_expiring: {
    agent_key: "main_brain",
    triggers: ["partner.agreement_expiring"],
    description: "Alert on expiring agreements",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },

  // --- Content & Marketing Automation (5) ---
  auto_generate_scheduled_content: {
    agent_key: "main_brain",
    triggers: ["content.generation_due"],
    description: "Auto-generate scheduled content",
    capabilities: [],
  },
  content_approval_reminder: {
    agent_key: "main_brain",
    triggers: ["content.awaiting_approval"],
    description: "Remind admins of pending content",
    capabilities: ["in_app"],
    notify_roles: ["admin"],
  },
  auto_publish_approved_content: {
    agent_key: "main_brain",
    triggers: ["content.publish_due"],
    description: "Auto-publish approved content",
    capabilities: [],
  },
  blog_post_performance: {
    agent_key: "main_brain",
    triggers: ["scheduled.weekly_content_report"],
    description: "Weekly blog performance report",
    capabilities: ["email"],
    notify_roles: ["admin"],
  },
  social_engagement_alert: {
    agent_key: "main_brain",
    triggers: ["social.engagement_spike"],
    description: "Alert on social engagement spikes",
    capabilities: ["in_app"],
  },

  // --- Compliance & Legal (5) ---
  gdpr_deletion_request: {
    agent_key: "main_brain",
    triggers: ["gdpr.deletion_requested"],
    description: "Track GDPR deletion requests",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
    critical: true,
  },
  gdpr_export_request: {
    agent_key: "main_brain",
    triggers: ["gdpr.export_requested"],
    description: "Track GDPR export requests",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  sla_breach_alert: {
    agent_key: "main_brain",
    triggers: ["sla.breached"],
    description: "Alert on SLA breaches",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
    critical: true,
  },
  audit_anomaly_detection: {
    agent_key: "main_brain",
    triggers: ["audit.anomaly_detected"],
    description: "Detect audit anomalies",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },
  operational_cost_due: {
    agent_key: "main_brain",
    triggers: ["cost.payment_due"],
    description: "Remind about operational costs",
    capabilities: ["in_app", "email"],
    notify_roles: ["admin"],
  },

  // --- Staff Rota & Scheduling (3) ---
  shift_notifications: {
    agent_key: "main_brain",
    triggers: ["shift.assigned", "shift.daily_reminder"],
    description: "Notify staff of shift assignments and daily reminders",
    capabilities: ["in_app", "sms"],
    notify_roles: ["call_centre"],
  },
  holiday_management: {
    agent_key: "main_brain",
    triggers: ["holiday.requested", "holiday.approved", "holiday.rejected"],
    description: "Manage holiday request notifications and approvals",
    capabilities: ["in_app", "sms", "email"],
    notify_roles: ["admin", "call_centre"],
  },
  shift_cover_workflow: {
    agent_key: "main_brain",
    triggers: ["shift_cover.requested", "shift_cover.accepted", "shift_cover.declined"],
    description: "Manage shift cover request workflow and notifications",
    capabilities: ["in_app", "sms"],
    notify_roles: ["call_centre"],
  },
};

/** Check if a specific Isabella function is enabled */
export async function isIsabellaFunctionEnabled(functionKey: string): Promise<boolean> {
  const { data } = await supabase
    .from("isabella_settings")
    .select("enabled")
    .eq("function_key", functionKey)
    .single();
  return data?.enabled ?? false;
}

/** Get the config JSON for a specific Isabella function */
export async function getIsabellaFunctionConfig(functionKey: string): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from("isabella_settings")
    .select("config")
    .eq("function_key", functionKey)
    .single();
  return (data?.config as Record<string, any>) ?? null;
}
