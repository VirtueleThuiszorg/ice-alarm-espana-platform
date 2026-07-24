import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SocialPostStatus } from "@/hooks/useSocialPosts";

export interface PostMetrics {
  draft: number;
  approved: number;
  published: number;
  failed: number;
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
