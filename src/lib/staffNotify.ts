import { supabase } from "@/integrations/supabase/client";

/**
 * SINGLE WRITE PATH for staff-facing in-app notifications on the holiday /
 * shift-cover workflow (Lee's "never silent" requirement, 2026-07-24).
 *
 * Every row is TARGETED (admin_user_id set) so it lands on exactly the right
 * person's bell + badge; broadcast (NULL) rows are deliberately not used here
 * because mark-as-read on a shared row would clear it for everyone.
 *
 * Inserts are error-CHECKED and logged — a notification failure must never
 * abort the underlying action, but it must also never be silently swallowed
 * (that's how the previous system died: RLS-denied inserts, unchecked).
 */

type NotifyClient = Pick<typeof supabase, "from">;

export interface StaffNotification {
  eventType: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

/** Roles that own holiday approvals: supervisor primary, admins oversight. */
export const HOLIDAY_APPROVER_ROLES = [
  "call_centre_supervisor",
  "admin",
  "super_admin",
] as const;

/** Insert one targeted notification per auth user id. Returns true if all landed. */
export async function notifyUsers(
  userIds: Array<string | null | undefined>,
  notification: StaffNotification,
  client: NotifyClient = supabase,
): Promise<boolean> {
  const targets = [...new Set(userIds.filter((u): u is string => !!u))];
  if (targets.length === 0) return true;
  const rows = targets.map((admin_user_id) => ({
    admin_user_id,
    event_type: notification.eventType,
    message: notification.message,
    entity_type: notification.entityType ?? null,
    entity_id: notification.entityId ?? null,
    status: "pending",
  }));
  const { error } = await client.from("notification_log").insert(rows);
  if (error) {
    console.error("[staffNotify] notification insert failed:", error.message);
    return false;
  }
  return true;
}

/** auth user ids of everyone who owns holiday approvals (active only). */
export async function getApproverUserIds(client: NotifyClient = supabase): Promise<string[]> {
  const { data, error } = await client
    .from("staff")
    .select("user_id, role, is_active")
    .in("role", [...HOLIDAY_APPROVER_ROLES])
    .eq("is_active", true);
  if (error) {
    console.error("[staffNotify] approver lookup failed:", error.message);
    return [];
  }
  return (data ?? []).map((s) => s.user_id as string | null).filter((u): u is string => !!u);
}

/** auth user id + display name for one staff member. */
export async function getStaffContact(
  staffId: string,
  client: NotifyClient = supabase,
): Promise<{ userId: string | null; name: string }> {
  const { data, error } = await client
    .from("staff")
    .select("user_id, first_name, last_name")
    .eq("id", staffId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[staffNotify] staff lookup failed:", error.message);
    return { userId: null, name: "a staff member" };
  }
  return {
    userId: (data.user_id as string | null) ?? null,
    name: `${data.first_name} ${data.last_name}`.trim(),
  };
}
