import { supabase } from "@/integrations/supabase/client";

type EntityType = 
  | "member" 
  | "device" 
  | "alert" 
  | "subscription" 
  | "order" 
  | "payment" 
  | "staff" 
  | "settings"
  | "partner"
  | "partner_invite"
  | "partner_attribution"
  | "partner_commission"
  | "social_post";

type ActionType = 
  | "create" 
  | "update" 
  | "delete" 
  | "view" 
  | "claim" 
  | "resolve" 
  | "escalate" 
  | "login" 
  | "logout"
  | "partner_created"
  | "partner_status_changed"
  | "invite_sent"
  | "attribution_created"
  | "commission_created"
  | "commission_approved"
  | "commission_paid"
  | "commission_cancelled"
  | "draft_created"
  | "draft_edited"
  | "approved"
  | "publish_attempted"
  | "publish_success"
  | "publish_failed"
  | "retry_requested";

interface AuditLogEntry {
  action: ActionType;
  entityType: EntityType;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

/**
 * Log an action to the activity_logs table for audit purposes.
 * This function is designed to be non-blocking - errors are logged but not thrown.
 */
export async function logActivity(entry: AuditLogEntry): Promise<void> {
  try {
    // Use getSession instead of getUser to avoid network validation
    // that could trigger session invalidation/logout
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    // Silently exit if no session - don't trigger any auth events
    if (sessionError || !sessionData.session?.user) {
      console.warn("Audit log skipped: no active session");
      return;
    }
    
    const userId = sessionData.session.user.id;

    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    // Get client IP (approximate via external service if needed, or null)
    const ipAddress = null; // Could be enhanced with an IP service

    const logEntry = {
      action: entry.action as string,
      entity_type: entry.entityType as string,
      entity_id: entry.entityId,
      old_values: entry.oldValues ? JSON.parse(JSON.stringify(entry.oldValues)) : null,
      new_values: entry.newValues ? JSON.parse(JSON.stringify(entry.newValues)) : null,
      staff_id: staff?.id || null,
      ip_address: ipAddress,
    };

    const { error } = await supabase.from("activity_logs").insert(logEntry);

    if (error) {
      console.error("Failed to log activity:", error);
    }
  } catch (error) {
    console.error("Error in audit logging:", error);
  }
}

/**
 * Log a member-related action
 */
export async function logMemberActivity(
  action: ActionType,
  memberId: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  return logActivity({
    action,
    entityType: "member",
    entityId: memberId,
    oldValues,
    newValues,
  });
}

/**
 * Log an alert-related action
 */
export async function logAlertActivity(
  action: ActionType,
  alertId: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  return logActivity({
    action,
    entityType: "alert",
    entityId: alertId,
    oldValues,
    newValues,
  });
}

/**
 * Log a device-related action
 */
export async function logDeviceActivity(
  action: ActionType,
  deviceId: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  return logActivity({
    action,
    entityType: "device",
    entityId: deviceId,
    oldValues,
    newValues,
  });
}

/**
 * Log a settings change
 */
export async function logSettingsActivity(
  settingKey: string,
  oldValue?: string,
  newValue?: string
): Promise<void> {
  return logActivity({
    action: "update",
    entityType: "settings",
    entityId: settingKey,
    oldValues: oldValue ? { value: oldValue } : undefined,
    newValues: newValue ? { value: newValue } : undefined,
  });
}

/**
 * Log a partner-related action
 */
export async function logPartnerActivity(
  action: ActionType,
  partnerId: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  return logActivity({
    action,
    entityType: "partner",
    entityId: partnerId,
    oldValues,
    newValues,
  });
}

/**
 * Log a partner invite action
 */
export async function logPartnerInviteActivity(
  action: ActionType,
  inviteId: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  return logActivity({
    action,
    entityType: "partner_invite",
    entityId: inviteId,
    oldValues,
    newValues,
  });
}

/**
 * Log a partner commission action
 */
export async function logCommissionActivity(
  action: ActionType,
  commissionId: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  return logActivity({
    action,
    entityType: "partner_commission",
    entityId: commissionId,
    oldValues,
    newValues,
  });
}

/**
 * Log a social post action
 */
export async function logSocialPostActivity(
  action: ActionType,
  postId: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  return logActivity({
    action,
    entityType: "social_post",
    entityId: postId,
    oldValues,
    newValues,
  });
}
