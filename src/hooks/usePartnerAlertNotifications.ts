import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES, INTERVALS } from "@/config/constants";

export interface PartnerAlertNotification {
  id: string;
  partner_id: string;
  alert_id: string;
  member_id: string;
  notification_method: "email" | "sms" | "dashboard";
  sent_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  alert?: {
    id: string;
    alert_type: string;
    status: string;
    received_at: string;
    location_address: string | null;
  };
  member?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export function usePartnerAlertNotifications(partnerId: string | undefined, limit = 50) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["partner-alert-notifications", partnerId, limit],
    queryFn: async () => {
      if (!partnerId) return [];

      const { data, error } = await supabase
        .from("partner_alert_notifications")
        .select(`
          *,
          alert:alerts(id, alert_type, status, received_at, location_address),
          member:members(id, first_name, last_name)
        `)
        .eq("partner_id", partnerId)
        .order("sent_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as PartnerAlertNotification[];
    },
    enabled: !!partnerId,
    staleTime: STALE_TIMES.REALTIME,
  });

  const acknowledgeNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      const { data, error } = await supabase
        .from("partner_alert_notifications")
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: "Partner",
        })
        .eq("id", notificationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-alert-notifications", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner-unacknowledged-alerts", partnerId] });
    },
  });

  return {
    notifications: query.data,
    isLoading: query.isLoading,
    error: query.error,
    acknowledgeNotification,
  };
}

export function useUnacknowledgedAlerts(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner-unacknowledged-alerts", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      const { data, error } = await supabase
        .from("partner_alert_notifications")
        .select(`
          *,
          alert:alerts(id, alert_type, status, received_at, location_address),
          member:members(id, first_name, last_name)
        `)
        .eq("partner_id", partnerId)
        .is("acknowledged_at", null)
        .order("sent_at", { ascending: false });

      if (error) throw error;
      return data as PartnerAlertNotification[];
    },
    enabled: !!partnerId,
    staleTime: STALE_TIMES.REALTIME,
    refetchInterval: INTERVALS.DASHBOARD_REFRESH,
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      notificationId,
      partnerId: _partnerId,
      acknowledgedBy,
    }: {
      notificationId: string;
      partnerId: string;
      acknowledgedBy?: string;
    }) => {
      const { data, error } = await supabase
        .from("partner_alert_notifications")
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: acknowledgedBy || null,
        })
        .eq("id", notificationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-alert-notifications", variables.partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner-unacknowledged-alerts", variables.partnerId] });
    },
  });
}
