import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Realtime subscription for the member roster.
 *
 * Anything that creates or changes a member must appear without a manual
 * reload: the add-member wizard, a CRM import, the payment webhook activating
 * a registration, or another admin editing in a second tab. React Query is
 * configured with `staleTime: 2 minutes` and `refetchOnWindowFocus: false`
 * (App.tsx), so without this the roster can sit stale for two minutes after a
 * write and only a hard refresh clears it.
 *
 * Invalidate-only by design: the broadcast payload is ignored entirely. We
 * mark the roster queries stale and let React Query refetch through the
 * caller's own RLS, so realtime never becomes a way to read a row the viewer
 * is not allowed to see.
 */
export function useMembersRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("members-roster-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-members"] });
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
