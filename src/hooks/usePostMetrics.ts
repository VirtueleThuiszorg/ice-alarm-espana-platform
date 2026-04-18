import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SocialPost, SocialPostStatus } from "@/hooks/useSocialPosts";

export interface PostMetrics {
  draft: number;
  approved: number;
  published: number;
  failed: number;
}

// Fetch only approved posts (for Ready to Publish section)
export function useApprovedPosts() {
  return useQuery({
    queryKey: ["approved-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_posts")
        .select("*")
        .eq("status", "approved")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as SocialPost[];
    },
  });
}

// Fetch metrics (counts by status)
export function usePostMetrics() {
  return useQuery({
    queryKey: ["social-post-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_posts")
        .select("status");
      if (error) throw error;

      const counts: PostMetrics = { draft: 0, approved: 0, published: 0, failed: 0 };
      data.forEach((post) => {
        const status = post.status as SocialPostStatus;
        if (counts[status] !== undefined) counts[status]++;
      });
      return counts;
    },
  });
}
