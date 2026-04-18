import { supabase } from "@/integrations/supabase/client";

/**
 * Insert a notification into notification_log.
 * @param adminUserId - The auth user UUID to target. Pass null for broadcast to all staff.
 * @param eventType - e.g. "message", "alert", "task"
 * @param message - Human-readable notification text
 * @param entityType - e.g. "conversation"
 * @param entityId - The related entity ID
 */
export async function createNotification({
  adminUserId,
  eventType,
  message,
  entityType,
  entityId,
}: {
  adminUserId: string | null;
  eventType: string;
  message: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    await (supabase.from("notification_log") as any).insert({
      admin_user_id: adminUserId,
      event_type: eventType,
      message,
      entity_type: entityType || null,
      entity_id: entityId || null,
      status: "pending",
    });
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

/**
 * Look up a member's auth user_id from their member_id.
 */
export async function getMemberUserId(memberId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("members")
      .select("user_id")
      .eq("id", memberId)
      .maybeSingle();
    return data?.user_id || null;
  } catch {
    return null;
  }
}
