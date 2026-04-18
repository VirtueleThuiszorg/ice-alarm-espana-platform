import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TopicInsight {
  topic: string;
  description: string;
  frequency: number;
  suggested_angle: string;
}

export interface LeadInsightsResult {
  insights: TopicInsight[];
  analyzed_count: number;
  period_days: number;
}

export function useLeadTopicInsights() {
  return useQuery({
    queryKey: ["lead-topic-insights"],
    queryFn: async (): Promise<LeadInsightsResult> => {
      const { data, error } = await supabase.functions.invoke("outreach-topic-insights");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as LeadInsightsResult;
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
