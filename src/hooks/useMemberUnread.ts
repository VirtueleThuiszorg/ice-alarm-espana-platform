import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * HOW MANY MESSAGES FROM US THE MEMBER HAS NOT READ — WP6.
 *
 * *"read_at, unread count on the nav."* The count existed, inline in `ClientDashboard`, and
 * nothing else could reach it — so the nav had no badge and there was no shared definition of
 * "unread" to put one on.
 *
 * WHAT COUNTS, and each exclusion is deliberate:
 *
 *   `sender_type = 'staff'`   a member's own messages are not unread TO THEM, and — since
 *                             `20260907100400` — `staff_internal` is a legal sender_type. An
 *                             internal note must never raise a badge on the member's screen,
 *                             and the RESTRICTIVE policy means they cannot read one anyway;
 *                             counting by "not mine" would have produced a badge for a message
 *                             that does not exist as far as they are concerned.
 *   `is_read = false`         written by `member-self-service`'s `mark_read`, which members
 *                             reach through `markMemberConversationRead`. They have no UPDATE
 *                             policy on `messages` by design, so the direct client update this
 *                             replaced was silently RLS-denied and badges never cleared.
 *
 * THE `memberId` OVERRIDE is for `ClientDashboard`'s admin preview (`?memberId=`), the same
 * reason `useMemberSubscriptions` and `useMemberAlerts` take one. One definition of unread,
 * three callers.
 */
export function useMemberUnread(memberIdOverride?: string | null) {
  const { memberId: authMemberId } = useAuth();
  const memberId = memberIdOverride === undefined ? authMemberId : memberIdOverride;

  return useQuery({
    queryKey: ["member-unread-messages", memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<number> => {
      const { data: convs, error: convError } = await supabase
        .from("conversations")
        .select("id")
        .eq("member_id", memberId as string);
      if (convError) throw convError;
      if (!convs?.length) return 0;

      const { count, error } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in(
          "conversation_id",
          convs.map((c) => c.id),
        )
        .eq("sender_type", "staff")
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
