import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay } from "date-fns";

export interface PublishingHistoryItem {
  id: string;
  calendar_item_id: string | null;
  goal_id: string | null;
  audience_id: string | null;
  topic_id: string | null;
  image_style_id: string | null;
  published_at: string;
  platform: "blog" | "facebook" | "instagram";
  post_text: string | null;
  image_url: string | null;
  external_post_id: string | null;
  created_at: string;
  // Joined data
  goal?: { id: string; name: string } | null;
  audience?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  image_style?: { id: string; name: string } | null;
}

export interface HistoryFilters {
  startDate?: string;
  endDate?: string;
  goalId?: string;
  audienceId?: string;
  platform?: "blog" | "facebook" | "instagram";
}

export function usePublishingHistory(filters?: HistoryFilters) {
  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["publishing-history", filters],
    queryFn: async () => {
      let query = supabase
        .from("media_publishing_history")
        .select(`
          *,
          goal:media_goals(id, name),
          audience:media_audiences(id, name),
          topic:media_topics(id, name),
          image_style:media_image_styles(id, name)
        `)
        .order("published_at", { ascending: false });

      if (filters?.startDate) {
        query = query.gte("published_at", startOfDay(new Date(filters.startDate)).toISOString());
      }
      if (filters?.endDate) {
        query = query.lte("published_at", endOfDay(new Date(filters.endDate)).toISOString());
      }
      if (filters?.goalId) {
        query = query.eq("goal_id", filters.goalId);
      }
      if (filters?.audienceId) {
        query = query.eq("audience_id", filters.audienceId);
      }
      if (filters?.platform) {
        query = query.eq("platform", filters.platform);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data as PublishingHistoryItem[];
    },
  });

  // Get recent usage for anti-repetition
  const getRecentUsage = () => {
    const now = new Date();
    const last48Hours = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
      recentGoals: items
        .filter((i) => new Date(i.published_at) >= last48Hours && i.goal_id)
        .map((i) => i.goal_id!),
      recentAudiences: items
        .filter((i) => new Date(i.published_at) >= last24Hours && i.audience_id)
        .map((i) => i.audience_id!),
      recentTopics: items
        .filter((i) => new Date(i.published_at) >= last7Days && i.topic_id)
        .map((i) => i.topic_id!),
      lastStyle: items[0]?.image_style_id || null,
    };
  };

  // Group by date
  const groupedByDate = () => {
    const groups: Record<string, PublishingHistoryItem[]> = {};
    items.forEach((item) => {
      const date = format(new Date(item.published_at), "yyyy-MM-dd");
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return groups;
  };

  // Stats
  const stats = {
    total: items.length,
    blogPosts: items.filter((i) => i.platform === "blog").length,
    facebookPosts: items.filter((i) => i.platform === "facebook").length,
    instagramPosts: items.filter((i) => i.platform === "instagram").length,
    byGoal: items.reduce((acc, i) => {
      const goalName = i.goal?.name || "Unknown";
      acc[goalName] = (acc[goalName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byAudience: items.reduce((acc, i) => {
      const audienceName = i.audience?.name || "Unknown";
      acc[audienceName] = (acc[audienceName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  return {
    items,
    isLoading,
    refetch,
    getRecentUsage,
    groupedByDate,
    stats,
  };
}
