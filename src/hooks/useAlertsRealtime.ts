import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook to subscribe to realtime alert updates and invalidate React Query caches.
 * Subscribes to INSERT/UPDATE/DELETE on public.alerts.
 */
export function useAlertsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("alerts-realtime-invalidation")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
        },
        () => {
          // Invalidate all alert-related queries
          queryClient.invalidateQueries({ queryKey: ["device-offline-alerts"] });
          queryClient.invalidateQueries({ queryKey: ["ev07b-status-summary"] });
          queryClient.invalidateQueries({ queryKey: ["ev07b-open-alerts-count"] });
          queryClient.invalidateQueries({ queryKey: ["admin-alerts-list"] });
          queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
