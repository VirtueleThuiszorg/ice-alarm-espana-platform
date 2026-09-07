import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cannedReplyLanguage, type CannedReply } from "@/lib/cannedReplies";

/**
 * THE ACTIVE CANNED REPLIES IN ONE MEMBER'S LANGUAGE — WP6 G5.
 *
 * The locale argument is the MEMBER's stored `preferred_language`, resolved by
 * `cannedReplyLanguage`. See `src/lib/cannedReplies.ts` for why it is never the operator's UI
 * language, and why there is no fallback to another language when the list comes back empty.
 *
 * `is_active` is filtered here rather than in the component: a reply is retired by unticking it,
 * and a retired script that three of four surfaces still offer is the same drift as a hard-coded
 * sender_type. `canned_replies` is staff-only by RLS ("Staff view canned replies"), so a member
 * session running this would get zero rows rather than the script we are reading from.
 */
export function useCannedReplies(preferredLanguage: string | null | undefined, enabled = true) {
  const locale = cannedReplyLanguage(preferredLanguage);

  return useQuery({
    queryKey: ["canned-replies", locale],
    enabled,
    // These change when an admin edits them, which is rare; refetching per conversation click
    // would be one query per selection for a list of a dozen rows.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CannedReply[]> => {
      const { data, error } = await supabase
        .from("canned_replies")
        .select("*")
        .eq("locale", locale)
        .eq("is_active", true)
        .order("category", { ascending: true, nullsFirst: false })
        .order("shortcut", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
