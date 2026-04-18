import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES, INTERVALS } from "@/config/constants";

import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface IsabellaSetting {
  id: string;
  function_key: string;
  enabled: boolean;
  enabled_at: string | null;
  enabled_by: string | null;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function useIsabellaSettings() {
  return useQuery({
    queryKey: ["isabella-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("isabella_settings")
        .select("*")
        .order("function_key");
      if (error) throw error;
      return data as IsabellaSetting[];
    },
    staleTime: STALE_TIMES.MEDIUM,
  });
}

export function useIsabellaSetting(functionKey: string) {
  return useQuery({
    queryKey: ["isabella-settings", functionKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("isabella_settings")
        .select("*")
        .eq("function_key", functionKey)
        .single();
      if (error) throw error;
      return data as IsabellaSetting;
    },
    enabled: !!functionKey,
  });
}

export function useUpdateIsabellaSetting() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id, enabled, staffId }: { id: string; enabled: boolean; staffId?: string }) => {
      const updates: Record<string, any> = { enabled };
      if (enabled) {
        updates.enabled_at = new Date().toISOString();
        if (staffId) updates.enabled_by = staffId;
      } else {
        updates.enabled_at = null;
        updates.enabled_by = null;
      }
      const { data, error } = await supabase
        .from("isabella_settings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["isabella-settings"] });
      queryClient.invalidateQueries({ queryKey: ["isabella-stats"] });
      toast.success(t("common.saved", "Saved"));
    },
    onError: () => {
      toast.error(t("common.error", "Error"));
    },
  });
}

export function useIsabellaStats() {
  return useQuery({
    queryKey: ["isabella-stats"],
    queryFn: async () => {
      // Count enabled functions
      const { count: enabledCount } = await supabase
        .from("isabella_settings")
        .select("*", { count: "exact", head: true })
        .eq("enabled", true);

      // Today's interactions
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      const { count: interactionsToday } = await supabase
        .from("ai_runs")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("created_at", todayISO);

      // Today's escalations
      const { count: escalationsToday } = await supabase
        .from("ai_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "escalation")
        .gte("created_at", todayISO);

      return {
        enabledCount: enabledCount || 0,
        interactionsToday: interactionsToday || 0,
        escalationsToday: escalationsToday || 0,
      };
    },
    staleTime: STALE_TIMES.SHORT,
    refetchInterval: INTERVALS.DASHBOARD_REFRESH,
  });
}
