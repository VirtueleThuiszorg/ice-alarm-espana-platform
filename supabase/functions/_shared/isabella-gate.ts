/**
 * Isabella settings-enforcement gate (shared)
 * ------------------------------------------------------------------
 * Single source of truth for deciding whether an Isabella function may run.
 * Imported by the ONLY three execution paths that may enforce it:
 *   - ai-run
 *   - ai-execute-action
 *   - ai-dispatch-events
 *
 * HARD SAFETY RULE (see ISABELLA_GATE_PLAN.md):
 *   Safety-critical (and legal) functions are NEVER gated. Membership is decided
 *   in code, in `NEVER_GATED_FUNCTIONS`, and is checked BEFORE any DB read — so a
 *   missing row, a `false` toggle, or a settings-lookup error can never suppress
 *   them. They always fail OPEN (run).
 *
 *   The EV07B emergency pipeline (ev07b-sos-alert, emergency-contact-notify,
 *   sos-escalation-runner, gps-gateway) is verified Isabella-independent and is
 *   NOT touched by this gate. This module must never be imported there.
 *
 * This file is intentionally dependency-free (no Deno / no https imports) so the
 * same logic runs in the edge functions and is unit-testable under vitest.
 */

/** Minimal structural type for the Supabase client calls this gate uses. */
export interface IsabellaSettingsClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{
          data: { enabled?: boolean | null } | null;
          error: unknown;
        }>;
      };
    };
  };
}

/**
 * SAFETY-CRITICAL — life-safety path. NEVER gated, ALWAYS fail open.
 * (Per ISABELLA_GATE_PLAN.md §2 + the SOS/fall verification.)
 */
export const SAFETY_CRITICAL_FUNCTIONS: ReadonlySet<string> = new Set<string>([
  "sos_button_triage",
  "fall_detection_triage",
  "emergency_escalation_alert",
  "bulk_offline_alert",
  "device_offline_response",
  "inactivity_check",
  "inbound_phone_calls",
]);

/** LEGAL — compliance obligations. NEVER gated (treated like safety-critical). */
export const LEGAL_NEVER_GATED_FUNCTIONS: ReadonlySet<string> = new Set<string>([
  "gdpr_deletion_request",
  "gdpr_export_request",
]);

/** The full never-gated set: anything in here always runs, no DB read. */
export const NEVER_GATED_FUNCTIONS: ReadonlySet<string> = new Set<string>([
  ...SAFETY_CRITICAL_FUNCTIONS,
  ...LEGAL_NEVER_GATED_FUNCTIONS,
]);

/**
 * Escalate-to-human action types. For inbound channels (sms/whatsapp/email/chat)
 * gating suppresses only Isabella's autonomous reply — never these. Always run.
 */
export const NEVER_GATED_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
  "escalate",
  "request_human",
]);

/**
 * Reverse map: trigger event_type -> Isabella function_key.
 * Mirrors `src/lib/isabella-function-config.ts` (ISABELLA_FUNCTION_CONFIG.triggers).
 * Duplicated here because edge functions (Deno) cannot import frontend code.
 * If you add/rename a trigger there, update this table too.
 */
export const TRIGGER_TO_FUNCTION_KEY: Readonly<Record<string, string>> = {
  "device.offline": "device_offline_response",
  "alert.device_offline": "device_offline_response",
  "device.low_battery": "low_battery_alerts",
  "alert.low_battery": "low_battery_alerts",
  "alert.sos_button": "sos_button_triage",
  "alert.fall_detected": "fall_detection_triage",
  "call.inbound": "inbound_phone_calls",
  "sms.inbound": "inbound_sms",
  "whatsapp.inbound": "inbound_whatsapp",
  "email.inbound": "inbound_email",
  "chat.message": "chat_widget",
  "scheduled.courtesy_call": "courtesy_calls",
  "member.created": "welcome_calls",
  "scheduled.onboarding_checkin": "onboarding_checkins",
  "payment.failed": "payment_reminders",
  "scheduled.followup": "followup_calls",
  "scheduled.birthday": "birthday_calls",
  "lead.created": "lead_followup_calls",
  "lead.stale": "lead_followup_calls",
  "registration.abandoned": "abandoned_signup_recovery",
  "partner.enquiry": "partner_enquiry_handling",
  "outreach.scheduled": "b2b_outreach_campaigns",
  "subscription.created": "new_sale_notification",
  "order.completed": "new_sale_notification",
  "subscription.cancelled": "cancellation_alert",
  "subscription.expired": "cancellation_alert",
  "payment.failed_repeated": "failed_payment_escalation",
  "scheduled.daily_briefing": "daily_boss_briefing",
  "scheduled.weekly_revenue": "weekly_revenue_summary",
  "alert.escalated_to_human": "emergency_escalation_alert",
  "feedback.submitted_low": "negative_feedback_alert",
  "scheduled.anniversary": "membership_anniversary",
  "device.inactive_extended": "inactivity_check",
  "subscription.renewal_approaching": "subscription_renewal_reminder",
  "member.profile_incomplete": "medical_profile_incomplete",
  "device.not_activated": "device_not_activated",
  "member.upgrade_candidate": "upgrade_suggestion",
  "inventory.stock_low": "stock_low_alert",
  "device.flapping": "device_health_monitor",
  "sim.expiry_approaching": "sim_expiry_warning",
  "device.bulk_offline": "bulk_offline_alert",
  "device.provisioning_stalled": "provisioning_stalled",
  "partner.created": "new_partner_signup",
  "partner.first_referral": "partner_first_referral",
  "partner.commission_threshold": "partner_commission_due",
  "partner.inactive": "partner_inactive_warning",
  "partner.agreement_expiring": "partner_agreement_expiring",
  "content.generation_due": "auto_generate_scheduled_content",
  "content.awaiting_approval": "content_approval_reminder",
  "content.publish_due": "auto_publish_approved_content",
  "scheduled.weekly_content_report": "blog_post_performance",
  "social.engagement_spike": "social_engagement_alert",
  "gdpr.deletion_requested": "gdpr_deletion_request",
  "gdpr.export_requested": "gdpr_export_request",
  "sla.breached": "sla_breach_alert",
  "audit.anomaly_detected": "audit_anomaly_detection",
  "cost.payment_due": "operational_cost_due",
  "shift.assigned": "shift_notifications",
  "shift.daily_reminder": "shift_notifications",
  "holiday.requested": "holiday_management",
  "holiday.approved": "holiday_management",
  "holiday.rejected": "holiday_management",
  "shift_cover.requested": "shift_cover_workflow",
  "shift_cover.accepted": "shift_cover_workflow",
  "shift_cover.declined": "shift_cover_workflow",
};

export type GateReason =
  | "safety_critical"
  | "legal_never_gated"
  | "enabled"
  | "disabled"
  | "no_row"
  | "lookup_error_fail_open"
  | "lookup_threw_fail_open";

export interface GateResult {
  allowed: boolean;
  reason: GateReason;
  /** True when allowed purely because the function is on the never-gated list. */
  neverGated: boolean;
}

/** Is this function exempt from gating (safety-critical or legal)? */
export function isNeverGated(functionKey: string): boolean {
  return NEVER_GATED_FUNCTIONS.has(functionKey);
}

/** Is this an escalate-to-human action that must never be suppressed? */
export function isActionNeverGated(actionType: string): boolean {
  return NEVER_GATED_ACTION_TYPES.has(actionType);
}

/** Resolve an event/trigger string to its Isabella function_key, if any. */
export function functionKeyForTrigger(eventType: string | null | undefined): string | null {
  if (!eventType) return null;
  return TRIGGER_TO_FUNCTION_KEY[eventType] ?? null;
}

/**
 * Decide whether an Isabella function may run.
 *
 *  - NEVER-GATED (safety-critical / legal): allowed without ANY DB read.
 *  - DISCRETIONARY: consult `isabella_settings.enabled`.
 *      • explicit true  -> allowed
 *      • explicit false -> blocked
 *      • no row         -> blocked (default-off / opt-in posture)
 *      • lookup error / throw -> ALLOWED + logged (fail-open on infra error, so a
 *        flaky DB cannot silently halt all discretionary automation)
 */
export async function isIsabellaFunctionAllowed(
  client: IsabellaSettingsClient,
  functionKey: string,
): Promise<GateResult> {
  // 1) NEVER-GATED — decided in code, before any DB access. Cannot be suppressed.
  if (SAFETY_CRITICAL_FUNCTIONS.has(functionKey)) {
    return { allowed: true, reason: "safety_critical", neverGated: true };
  }
  if (LEGAL_NEVER_GATED_FUNCTIONS.has(functionKey)) {
    return { allowed: true, reason: "legal_never_gated", neverGated: true };
  }

  // 2) DISCRETIONARY — honestly consult the toggle.
  try {
    const { data, error } = await client
      .from("isabella_settings")
      .select("enabled")
      .eq("function_key", functionKey)
      .maybeSingle();

    if (error) {
      console.error(
        `[isabella-gate] settings lookup error for "${functionKey}" — allowing (fail-open on infra error):`,
        (error as { message?: string })?.message ?? error,
      );
      return { allowed: true, reason: "lookup_error_fail_open", neverGated: false };
    }

    if (!data) {
      return { allowed: false, reason: "no_row", neverGated: false };
    }

    return data.enabled === true
      ? { allowed: true, reason: "enabled", neverGated: false }
      : { allowed: false, reason: "disabled", neverGated: false };
  } catch (e) {
    console.error(
      `[isabella-gate] settings lookup threw for "${functionKey}" — allowing (fail-open on infra error):`,
      e instanceof Error ? e.message : e,
    );
    return { allowed: true, reason: "lookup_threw_fail_open", neverGated: false };
  }
}
