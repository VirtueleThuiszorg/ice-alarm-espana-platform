import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BlogPostAdmin {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  ai_intro: string | null;
  image_url: string | null;
  language: string | null;
  published: boolean | null;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  facebook_post_id: string | null;
  social_post_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BlogPostFormData {
  title: string;
  slug: string;
  content: string;
  excerpt?: string | null;
  image_url?: string | null;
  language?: string | null;
  published?: boolean;
  published_at?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
}

/**
 * Fetches all blog posts for admin (no filter on published status or social_posts join).
 */
export function useAdminBlogPosts(filter: "all" | "published" | "draft" = "all") {
  return useQuery({
    queryKey: ["admin-blog-posts", filter],
    queryFn: async () => {
      let query = supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false });

      if (filter === "published") {
        query = query.eq("published", true);
      } else if (filter === "draft") {
        query = query.or("published.eq.false,published.is.null");
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BlogPostAdmin[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Fetches a single blog post by ID for editing.
 */
export function useAdminBlogPost(id: string | null) {
  return useQuery({
    queryKey: ["admin-blog-post", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as BlogPostAdmin;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 2,
  });
}

export function useBlogEditor() {
  const queryClient = useQueryClient();

  const invalidateBlogQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-blog-post"] });
    queryClient.invalidateQueries({ queryKey: ["blog-posts"] });
    queryClient.invalidateQueries({ queryKey: ["blog-post"] });
  };

  const createPost = useMutation({
    mutationFn: async (data: BlogPostFormData) => {
      const { data: post, error } = await supabase
        .from("blog_posts")
        .insert({
          title: data.title,
          slug: data.slug,
          content: data.content,
          excerpt: data.excerpt || null,
          image_url: data.image_url || null,
          language: data.language || "en",
          published: data.published ?? false,
          published_at: data.published ? new Date().toISOString() : null,
          seo_title: data.seo_title || null,
          seo_description: data.seo_description || null,
        })
        .select()
        .single();

      if (error) throw error;
      return post as BlogPostAdmin;
    },
    onSuccess: () => {
      invalidateBlogQueries();
      toast.success("Blog post created successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create post: ${error.message}`);
    },
  });

  const updatePost = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BlogPostFormData> }) => {
      const updateData: Record<string, unknown> = { ...data };
      // Always set updated_at
      updateData.updated_at = new Date().toISOString();

      const { data: post, error } = await supabase
        .from("blog_posts")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return post as BlogPostAdmin;
    },
    onSuccess: () => {
      invalidateBlogQueries();
      toast.success("Blog post updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update post: ${error.message}`);
    },
  });

  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blog_posts")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateBlogQueries();
      toast.success("Blog post deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete post: ${error.message}`);
    },
  });

  const publishPost = useMutation({
    mutationFn: async (id: string) => {
      const { data: post, error } = await supabase
        .from("blog_posts")
        .update({
          published: true,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return post as BlogPostAdmin;
    },
    onSuccess: () => {
      invalidateBlogQueries();
      toast.success("Blog post published");
    },
    onError: (error: Error) => {
      toast.error(`Failed to publish post: ${error.message}`);
    },
  });

  const unpublishPost = useMutation({
    mutationFn: async (id: string) => {
      const { data: post, error } = await supabase
        .from("blog_posts")
        .update({
          published: false,
          published_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return post as BlogPostAdmin;
    },
    onSuccess: () => {
      invalidateBlogQueries();
      toast.success("Blog post unpublished");
    },
    onError: (error: Error) => {
      toast.error(`Failed to unpublish post: ${error.message}`);
    },
  });

  return {
    createPost: createPost.mutateAsync,
    updatePost: updatePost.mutateAsync,
    deletePost: deletePost.mutateAsync,
    publishPost: publishPost.mutateAsync,
    unpublishPost: unpublishPost.mutateAsync,
    isCreating: createPost.isPending,
    isUpdating: updatePost.isPending,
    isDeleting: deletePost.isPending,
    isPublishing: publishPost.isPending,
    isUnpublishing: unpublishPost.isPending,
  };
}
