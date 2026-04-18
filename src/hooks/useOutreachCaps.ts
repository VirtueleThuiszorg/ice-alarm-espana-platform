import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";

export interface CapSetting {
  value: number;
  enabled: boolean;
}

export interface OutreachCapsSettings {
  max_qualified_per_day: CapSetting;
  max_ai_ratings_per_day: CapSetting;
  max_ai_research_per_day: CapSetting;
  max_ai_emails_per_day: CapSetting;
  max_emails_per_inbox_per_day: CapSetting;
}

export interface DailyUsage {
  qualified: number;
  ai_ratings: number;
  ai_research: number;
  ai_emails: number;
  emails_sent: number;
}

const DEFAULT_CAPS: OutreachCapsSettings = {
  max_qualified_per_day: { value: 20, enabled: true },
  max_ai_ratings_per_day: { value: 100, enabled: true },
  max_ai_research_per_day: { value: 20, enabled: true },
  max_ai_emails_per_day: { value: 30, enabled: true },
  max_emails_per_inbox_per_day: { value: 30, enabled: true },
};

export function useOutreachCaps() {
  const queryClient = useQueryClient();

  // Fetch settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["outreach-caps-settings"],
    queryFn: async (): Promise<OutreachCapsSettings> => {
      const { data, error } = await supabase
        .from("outreach_settings")
        .select("setting_key, setting_value");

      if (error) throw error;

      const result = { ...DEFAULT_CAPS };
      if (data) {
        for (const row of data) {
          const key = row.setting_key as keyof OutreachCapsSettings;
          if (key in result && row.setting_value) {
            const val = row.setting_value as unknown as CapSetting;
            if (typeof val === "object" && "value" in val && "enabled" in val) {
              result[key] = val;
            }
          }
        }
      }
      return result;
    },
  });

  // Fetch today's usage
  const { data: usage, isLoading: isLoadingUsage } = useQuery({
    queryKey: ["outreach-daily-usage"],
    queryFn: async (): Promise<DailyUsage> => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("outreach_daily_usage")
        .select("usage_type, usage_count")
        .eq("usage_date", today);

      if (error) throw error;

      const result: DailyUsage = {
        qualified: 0,
        ai_ratings: 0,
        ai_research: 0,
        ai_emails: 0,
        emails_sent: 0,
      };

      if (data) {
        for (const row of data) {
          switch (row.usage_type) {
            case "qualified":
              result.qualified += row.usage_count;
              break;
            case "ai_ratings":
              result.ai_ratings += row.usage_count;
              break;
            case "ai_research":
              result.ai_research += row.usage_count;
              break;
            case "ai_emails":
              result.ai_emails += row.usage_count;
              break;
            case "emails_sent":
              result.emails_sent += row.usage_count;
              break;
          }
        }
      }
      return result;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Update a setting
  const updateSettingMutation = useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: keyof OutreachCapsSettings;
      value: CapSetting;
    }) => {
      const { error } = await supabase
        .from("outreach_settings")
        .update({ 
          setting_value: JSON.parse(JSON.stringify(value)), 
          updated_at: new Date().toISOString() 
        })
        .eq("setting_key", key);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-caps-settings"] });
      toast({
        title: i18n.t("common.success"),
        description: i18n.t("outreach.caps.settingsSaved"),
      });
    },
    onError: (error) => {
      toast({
        title: i18n.t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Increment usage
  const incrementUsageMutation = useMutation({
    mutationFn: async ({
      usageType,
      count = 1,
      inboxId,
    }: {
      usageType: string;
      count?: number;
      inboxId?: string;
    }) => {
      const today = new Date().toISOString().split("T")[0];
      
      // Check if record exists
      let query = supabase
        .from("outreach_daily_usage")
        .select("id, usage_count")
        .eq("usage_date", today)
        .eq("usage_type", usageType);
      
      if (inboxId) {
        query = query.eq("inbox_id", inboxId);
      } else {
        query = query.is("inbox_id", null);
      }

      const { data: existing } = await query.single();

      if (existing) {
        await supabase
          .from("outreach_daily_usage")
          .update({ usage_count: existing.usage_count + count })
          .eq("id", existing.id);
      } else {
        await supabase.from("outreach_daily_usage").insert({
          usage_date: today,
          usage_type: usageType,
          usage_count: count,
          inbox_id: inboxId || null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-daily-usage"] });
    },
  });

  // Check if a cap is reached
  const isCapReached = (capKey: keyof OutreachCapsSettings, currentUsage: number): boolean => {
    if (!settings) return false;
    const cap = settings[capKey];
    if (!cap.enabled) return false;
    return currentUsage >= cap.value;
  };

  // Get remaining capacity
  const getRemainingCapacity = (capKey: keyof OutreachCapsSettings, currentUsage: number): number => {
    if (!settings) return Infinity;
    const cap = settings[capKey];
    if (!cap.enabled) return Infinity;
    return Math.max(0, cap.value - currentUsage);
  };

  // Get next reset time (midnight UTC)
  const getNextResetTime = (): Date => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  };

  return {
    settings: settings || DEFAULT_CAPS,
    usage: usage || { qualified: 0, ai_ratings: 0, ai_research: 0, ai_emails: 0, emails_sent: 0 },
    isLoading: isLoadingSettings || isLoadingUsage,
    updateSetting: updateSettingMutation.mutateAsync,
    isUpdating: updateSettingMutation.isPending,
    incrementUsage: incrementUsageMutation.mutateAsync,
    isCapReached,
    getRemainingCapacity,
    getNextResetTime,
  };
}
