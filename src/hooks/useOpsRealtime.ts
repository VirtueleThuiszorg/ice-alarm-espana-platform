import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Reusable hook for ops-related realtime subscriptions.
 * Subscribes to devices and alerts tables and invalidates relevant React Query caches.
 * 
 * Use this in dashboards/pages that need instant updates for:
 * - Device status changes (allocation, online/offline, check-ins)
 * - Alert lifecycle (created, claimed, resolved)
 */
export function useOpsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to device changes
    const devicesChannel = supabase
      .channel("ops-devices-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
        },
        () => {
          // Invalidate all device-related queries
          queryClient.invalidateQueries({ queryKey: ["device-stock"] });
          queryClient.invalidateQueries({ queryKey: ["device-stock-stats"] });
          queryClient.invalidateQueries({ queryKey: ["member-device"] });
          queryClient.invalidateQueries({ queryKey: ["admin-member-device"] });
          queryClient.invalidateQueries({ queryKey: ["admin-device-detail"] });
          queryClient.invalidateQueries({ queryKey: ["ev07b-status-summary"] });
          queryClient.invalidateQueries({ queryKey: ["staff-ev07b-stats"] });
          queryClient.invalidateQueries({ queryKey: ["staff-device-issues"] });
        }
      )
      .subscribe();

    // Subscribe to alert changes
    const alertsChannel = supabase
      .channel("ops-alerts-realtime")
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
          queryClient.invalidateQueries({ queryKey: ["staff-ev07b-stats"] });
          queryClient.invalidateQueries({ queryKey: ["staff-device-offline-alerts"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(devicesChannel);
      supabase.removeChannel(alertsChannel);
    };
  }, [queryClient]);
}
