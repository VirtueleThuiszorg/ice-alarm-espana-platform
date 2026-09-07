import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  groupIsabellaEpisodes,
  type ConversationCall,
  type ConversationTurn,
  type IsabellaEpisode,
} from "@/lib/isabellaThread";

/**
 * ISABELLA'S EPISODES FOR ONE CONVERSATION — WP6 G7.
 *
 * Two reads, both scoped to the conversation the caller is already showing. RLS decides what
 * comes back and nothing here widens it: `20260213145106` gives staff every row and a member the
 * rows of their own conversations, which is exactly the audience each surface already has. There
 * is no service-role path in this hook (golden rule 5).
 */
export function useIsabellaThread(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ["isabella-thread", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<IsabellaEpisode[]> => {
      const id = conversationId as string;

      const [callsResult, turnsResult] = await Promise.all([
        supabase
          .from("conversation_calls")
          .select("*")
          .eq("conversation_id", id)
          .order("started_at", { ascending: true }),
        supabase
          .from("conversation_messages")
          .select("*")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true }),
      ]);

      if (callsResult.error) throw callsResult.error;
      if (turnsResult.error) throw turnsResult.error;

      return groupIsabellaEpisodes(
        id,
        (callsResult.data ?? []) as ConversationCall[],
        (turnsResult.data ?? []) as ConversationTurn[],
      );
    },
  });
}
