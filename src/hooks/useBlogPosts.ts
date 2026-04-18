import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  ai_intro: string | null;
  language: string;
  published: boolean;
  published_at: string;
  facebook_post_id: string | null;
  social_post_id: string | null;
  image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export function useBlogPosts(limit?: number) {
  return useQuery({
    queryKey: ["blog-posts", limit],
    queryFn: async () => {
      // Only show blog posts linked to published social posts
      // This ensures the blog page matches the "Published Performance" section
      let query = supabase
        .from("blog_posts")
        .select(`
          *,
          social_posts!inner(id, status)
        `)
        .eq("published", true)
        .eq("social_posts.status", "published")
        .not("published_at", "is", null)
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Strip the joined social_posts data from response
      return (data || []).map(({ social_posts, ...blog }) => blog) as BlogPost[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useBlogPost(slug: string) {
  return useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("published", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null; // Not found
        }
        throw error;
      }
      return data as BlogPost;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!slug,
  });
}
