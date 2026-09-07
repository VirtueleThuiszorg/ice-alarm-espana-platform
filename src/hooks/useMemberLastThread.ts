import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { conversationPreview, type ConversationPreview } from "@/lib/conversationPreview";

export interface MemberLastThread {
  conversationId: string;
  subject: string | null;
  preview: ConversationPreview;
  /** True when the newest thing in the thread came from us. */
  fromUs: boolean;
}

/**
 * THE MEMBER'S MOST RECENT THREAD — WP4 M23, *"Messages' last thread"*.
 *
 * The dashboard card said "2 unread messages": how much is waiting, and nothing about what it
 * is. A member deciding whether to open it needs the second one.
 *
 * NOT A SECOND UNREAD COUNT. `useMemberUnread` stays the one definition of unread and the card
 * keeps using it; this hook answers "what is the last thing said, and by whom". Two hooks with
 * one query each beats one hook two callers use half of.
 *
 * ISABELLA COUNTS. Her turns live in `conversation_messages`, so a member whose last exchange
 * was with the chat widget would otherwise see an empty card — or, before this, the literal word
 * "undefined" (see `conversationPreview.ts`). Her turn is only read when the thread has no
 * ordinary message, and the newer of the two wins.
 *
 * RLS DOES THE FILTERING. Queried as the member, so a `staff_internal` note cannot appear in
 * their own preview — the RESTRICTIVE policy from `20260907100400` removes it from the result
 * rather than this hook filtering it out. One rule, in the database (G4).
 */
export function useMemberLastThread(memberIdOverride?: string | null) {
  const { memberId: authMemberId } = useAuth();
  const memberId = memberIdOverride === undefined ? authMemberId : memberIdOverride;

  return useQuery({
    queryKey: ["member-last-thread", memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<MemberLastThread | null> => {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("id, subject, last_message_at")
        .eq("member_id", memberId as string)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (convError) throw convError;
      if (!conv) return null;

      const { data: lastMessage, error: msgError } = await supabase
        .from("messages")
        .select("content, created_at, sender_type")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (msgError) throw msgError;

      // Only when there is nothing ordinary to show: one extra read for the Isabella-only case,
      // not one on every dashboard load.
      let lastTurn: { content: string | null; created_at: string | null } | null = null;
      if (!lastMessage) {
        const { data } = await supabase
          .from("conversation_messages")
          .select("content, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastTurn = data ?? null;
      }

      const preview = conversationPreview(lastMessage, lastTurn);
      if (preview.source === "none") return null;

      return {
        conversationId: conv.id,
        subject: conv.subject,
        preview,
        fromUs: preview.source === "isabella" || lastMessage?.sender_type !== "member",
      };
    },
  });
}
