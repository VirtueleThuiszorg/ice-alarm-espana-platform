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
  // STAFF surfaces only — the INSERT policy is staff-scoped. Member surfaces
  // must use notifyStaffOfMemberMessage (server-side) below.
  const { error } = await supabase.from("notification_log").insert({
    admin_user_id: adminUserId,
    event_type: eventType,
    message,
    entity_type: entityType || null,
    entity_id: entityId || null,
    status: "pending",
  });
  if (error) console.error("Failed to create notification:", error);
}

/**
 * Member-surface staff notification. notification_log INSERT is
 * service/staff-only by design, so members cannot write it directly — this
 * routes through the member-self-service edge function, which verifies the
 * conversation belongs to the caller before broadcasting to staff.
 */
export async function notifyStaffOfMemberMessage(
  conversationId: string,
  kind: "new" | "reply",
  subject: string,
) {
  const { data, error } = await supabase.functions.invoke("member-self-service", {
    body: { action: "notify_staff", conversation_id: conversationId, kind, subject },
  });
  if (error || data?.error) {
    console.error("Failed to notify staff of member message:", error || data?.error);
  }
}

/**
 * Member-surface mark-as-read. Members have no UPDATE policy on messages
 * (by design) — the direct client update was silently RLS-denied, so unread
 * badges never cleared. Routed through member-self-service, which verifies
 * the conversation belongs to the caller.
 */
export async function markMemberConversationRead(conversationId: string) {
  const { data, error } = await supabase.functions.invoke("member-self-service", {
    body: { action: "mark_read", conversation_id: conversationId },
  });
  if (error || data?.error) {
    console.error("Failed to mark conversation read:", error || data?.error);
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
