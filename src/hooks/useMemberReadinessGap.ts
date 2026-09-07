import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  READINESS_VIEW_COLUMNS,
  readinessGapFromView,
  type ReadinessGap,
  type ReadinessViewRow,
} from "@/lib/readinessGap";

/**
 * ONE MEMBER'S READINESS GAP — WP6 G8's context panel, and anything else that needs it.
 *
 * Reads `member_monitoring_readiness` and nothing else: READINESS_MODEL.md §2 makes the view the
 * answer, and re-deriving it from `orders` or `emergency_contacts` is how three screens end up
 * with three opinions about whether a member is monitored.
 *
 * RLS-scoped, no service role. The view delegates to the underlying policies, so a caller who
 * may not see this member gets no row — which arrives here as `unknown`, not as ready.
 */
export function useMemberReadinessGap(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["member-readiness-gap", memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<ReadinessGap> => {
      const { data, error } = await supabase
        .from("member_monitoring_readiness")
        .select(READINESS_VIEW_COLUMNS)
        .eq("member_id", memberId as string)
        .maybeSingle();
      // A failed read is "unknown", never "ready": an operator must not be told a member is
      // monitored because a query timed out.
      if (error) return "unknown";
      return readinessGapFromView(data as ReadinessViewRow | null);
    },
  });
}
