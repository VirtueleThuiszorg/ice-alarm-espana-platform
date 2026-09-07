import { supabase } from "@/integrations/supabase/client";
import type { PreviewMessage } from "./conversationPreview";

/**
 * THE NEWEST THING ISABELLA SAID IN A CONVERSATION — the fallback every list preview needs.
 *
 * Kept out of `conversationPreview.ts` so that module stays pure and directly testable; kept out
 * of `useIsabellaThread` because a list row is not a component and cannot call a hook.
 *
 * CALL IT ONLY WHEN THERE IS NO ORDINARY MESSAGE. Every conversation list here is already one
 * query per row; this must not become two. An Isabella-only conversation is the whole case —
 * a thread that has both already has something to show.
 *
 * A failure is `null`, not an exception: a list must still render when one row's preview cannot
 * be read, and "no preview" is the same thing the caller already handles.
 */
export async function fetchLastIsabellaTurn(conversationId: string): Promise<PreviewMessage | null> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}
