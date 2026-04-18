import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format } from "date-fns";

export interface MarketingMetrics {
  // Media Manager
  postsPublished: number;
  postsDrafted: number;
  totalReach: number;
  totalEngagements: number;
  // Outreach
  leadsDiscovered: number;
  emailsSent: number;
  repliesReceived: number;
  conversions: number;
  // Video Hub
  videosRendered: number;
  videosExported: number;
  // Trends (recent half vs older half)
  trends: {
    posts: number;
    emails: number;
    videos: number;
  };
}

export function useMarketingAnalytics(days: number = 30) {
  return useQuery({
    queryKey: ["marketing-analytics", days],
    queryFn: async (): Promise<MarketingMetrics> => {
      const since = format(subDays(new Date(), days), "yyyy-MM-dd");
      const midpoint = format(subDays(new Date(), Math.floor(days / 2)), "yyyy-MM-dd");

      const [
        publishedPosts,
        draftPosts,
        metricsRes,
        rawLeads,
        sentEmails,
        replies,
        converted,
        renderedVideos,
        exportedVideos,
        // Trends
        recentPosts,
        olderPosts,
        recentEmails,
        olderEmails,
        recentVideos,
        olderVideos,
      ] = await Promise.all([
        // Media Manager
        supabase.from("social_posts").select("id", { count: "exact", head: true })
          .eq("status", "published").gte("published_at", since),
        supabase.from("social_posts").select("id", { count: "exact", head: true })
          .eq("status", "draft").gte("created_at", since),
        supabase.from("social_post_metrics")
          .select("reactions_total, comments_count, shares_count, impressions"),

        // Outreach
        supabase.from("outreach_raw_leads").select("id", { count: "exact", head: true })
          .gte("created_at", since),
        supabase.from("outreach_email_drafts").select("id", { count: "exact", head: true })
          .eq("status", "sent").gte("created_at", since),
        supabase.from("outreach_email_threads").select("id", { count: "exact", head: true })
          .eq("direction", "inbound").gte("created_at", since),
        supabase.from("outreach_crm_leads").select("id", { count: "exact", head: true })
          .eq("status", "converted").gte("created_at", since),

        // Video Hub
        supabase.from("video_renders").select("id", { count: "exact", head: true })
          .eq("status", "done").gte("created_at", since),
        supabase.from("video_exports").select("id", { count: "exact", head: true })
          .gte("created_at", since),

        // Trends: recent half
        supabase.from("social_posts").select("id", { count: "exact", head: true })
          .eq("status", "published").gte("published_at", midpoint),
        supabase.from("social_posts").select("id", { count: "exact", head: true })
          .eq("status", "published").gte("published_at", since).lt("published_at", midpoint),
        supabase.from("outreach_email_drafts").select("id", { count: "exact", head: true })
          .eq("status", "sent").gte("created_at", midpoint),
        supabase.from("outreach_email_drafts").select("id", { count: "exact", head: true })
          .eq("status", "sent").gte("created_at", since).lt("created_at", midpoint),
        supabase.from("video_renders").select("id", { count: "exact", head: true })
          .eq("status", "done").gte("created_at", midpoint),
        supabase.from("video_renders").select("id", { count: "exact", head: true })
          .eq("status", "done").gte("created_at", since).lt("created_at", midpoint),
      ]);

      // Aggregate metrics from real columns
      const metricsData = metricsRes.data || [];
      const totalReach = metricsData.reduce((sum, m) => sum + (m.impressions || 0), 0);
      const totalEngagements = metricsData.reduce(
        (sum, m) => sum + (m.reactions_total || 0) + (m.comments_count || 0) + (m.shares_count || 0),
        0
      );

      const calcTrend = (recent: number, older: number): number => {
        if (older === 0) return recent > 0 ? 100 : 0;
        return Math.round(((recent - older) / older) * 100);
      };

      return {
        postsPublished: publishedPosts.count || 0,
        postsDrafted: draftPosts.count || 0,
        totalReach,
        totalEngagements,
        leadsDiscovered: rawLeads.count || 0,
        emailsSent: sentEmails.count || 0,
        repliesReceived: replies.count || 0,
        conversions: converted.count || 0,
        videosRendered: renderedVideos.count || 0,
        videosExported: exportedVideos.count || 0,
        trends: {
          posts: calcTrend(recentPosts.count || 0, olderPosts.count || 0),
          emails: calcTrend(recentEmails.count || 0, olderEmails.count || 0),
          videos: calcTrend(recentVideos.count || 0, olderVideos.count || 0),
        },
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
