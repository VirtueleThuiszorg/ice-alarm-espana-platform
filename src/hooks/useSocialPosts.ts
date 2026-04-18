import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { logSocialPostActivity } from "@/lib/auditLog";

export type SocialPostStatus = "draft" | "approved" | "published" | "failed";
export type SocialPostLanguage = "en" | "es" | "both";

export interface SocialPost {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  approved_by: string | null;
  platform: string;
  status: SocialPostStatus;
  language: SocialPostLanguage;
  goal: string | null;
  target_audience: string | null;
  topic: string | null;
  post_text: string | null;
  image_url: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  facebook_post_id: string | null;
  error_message: string | null;
  // Partner distribution fields
  partner_enabled: boolean;
  partner_audience: "none" | "all" | "selected";
  partner_selected_partner_ids: string[] | null;
  partner_published_at: string | null;
  content_channels: string[];
  primary_url: string | null;
}

export interface SocialPostResearch {
  id: string;
  created_at: string;
  post_id: string;
  sources: any[];
  key_points: string | null;
  compliance_notes: string | null;
}

export interface CreateSocialPostData {
  goal?: string;
  target_audience?: string;
  topic?: string;
  language?: SocialPostLanguage;
  post_text?: string;
  image_url?: string;
  // Partner distribution
  partner_enabled?: boolean;
  partner_audience?: "none" | "all" | "selected";
  partner_selected_partner_ids?: string[];
  content_channels?: string[];
}

export interface UpdateSocialPostData extends Partial<CreateSocialPostData> {
  status?: SocialPostStatus;
  scheduled_for?: string | null;
  primary_url?: string | null;
}

export function useSocialPosts(statusFilter?: SocialPostStatus | "all") {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Realtime subscription for live social post updates
  useEffect(() => {
    const channel = supabase
      .channel("social-posts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "social_posts" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["social-posts"] });
          queryClient.invalidateQueries({ queryKey: ["approved-posts"] });
          queryClient.invalidateQueries({ queryKey: ["social-post-metrics"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch all posts with optional status filter
  const postsQuery = useQuery({
    queryKey: ["social-posts", statusFilter],
    queryFn: async () => {
      let query = supabase.from("social_posts").select("*").order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SocialPost[];
    },
  });

  // Create a new draft
  const createMutation = useMutation({
    mutationFn: async (data: CreateSocialPostData) => {
      const { data: post, error } = await supabase
        .from("social_posts")
        .insert({
          ...data,
          created_by: user?.id,
          status: "draft",
          platform: "facebook",
        })
        .select()
        .single();

      if (error) throw error;
      return post as SocialPost;
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      queryClient.invalidateQueries({ queryKey: ["social-post-metrics"] });
      toast({ title: i18n.t("mediaManager.toasts.draftCreated"), description: i18n.t("mediaManager.toasts.draftCreatedDesc") });
      // Audit log
      logSocialPostActivity("draft_created", post.id, undefined, {
        goal: post.goal,
        topic: post.topic,
        language: post.language,
      });
    },
    onError: (error: any) => {
      toast({
        title: i18n.t("mediaManager.toasts.errorCreatingDraft"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update a post
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSocialPostData }) => {
      const { data: post, error } = await supabase
        .from("social_posts")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return post as SocialPost;
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      queryClient.invalidateQueries({ queryKey: ["approved-posts"] });
      queryClient.invalidateQueries({ queryKey: ["social-post-metrics"] });
      toast({ title: i18n.t("mediaManager.toasts.draftUpdated"), description: i18n.t("mediaManager.toasts.draftUpdatedDesc") });
      // Audit log
      logSocialPostActivity("draft_edited", post.id, undefined, {
        post_text_length: post.post_text?.length,
        has_image: !!post.image_url,
      });
    },
    onError: (error: any) => {
      toast({
        title: i18n.t("mediaManager.toasts.errorUpdatingDraft"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Approve a post
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: post, error } = await supabase
        .from("social_posts")
        .update({
          status: "approved",
          approved_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return post as SocialPost;
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      queryClient.invalidateQueries({ queryKey: ["approved-posts"] });
      queryClient.invalidateQueries({ queryKey: ["social-post-metrics"] });
      toast({ title: i18n.t("mediaManager.toasts.postApproved"), description: i18n.t("mediaManager.toasts.postApprovedDesc") });
      // Audit log
      logSocialPostActivity("approved", post.id, { status: "draft" }, { status: "approved" });
    },
    onError: (error: any) => {
      toast({
        title: i18n.t("mediaManager.toasts.errorApprovingPost"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Retry a failed post (reset to approved)
  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: post, error } = await supabase
        .from("social_posts")
        .update({
          status: "approved",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return post as SocialPost;
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      queryClient.invalidateQueries({ queryKey: ["approved-posts"] });
      queryClient.invalidateQueries({ queryKey: ["social-post-metrics"] });
      toast({ title: i18n.t("mediaManager.toasts.postReadyForRetry"), description: i18n.t("mediaManager.toasts.postReadyForRetryDesc") });
      logSocialPostActivity("retry_requested", post.id, { status: "failed" }, { status: "approved" });
    },
    onError: (error: any) => {
      toast({
        title: i18n.t("mediaManager.toasts.errorPreparingRetry"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Publish to Facebook (FIXED: force Authorization header)
  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      // Log publish attempt
      logSocialPostActivity("publish_attempted", id);

      // Force-get a fresh session token
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error("Not authenticated. Please log in again.");
      }

      const { data, error } = await supabase.functions.invoke("facebook-publish", {
        body: { post_id: id },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return { ...data, post_id: id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      queryClient.invalidateQueries({ queryKey: ["approved-posts"] });
      queryClient.invalidateQueries({ queryKey: ["social-post-metrics"] });
      toast({
        title: i18n.t("mediaManager.toasts.publishedToFacebook"),
        description: `Post ID: ${data.facebook_post_id}`,
      });
      // Log publish success
      logSocialPostActivity("publish_success", data.post_id, undefined, {
        facebook_post_id: data.facebook_post_id,
      });
    },
    onError: (error: any, postId: string) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast({ title: i18n.t("mediaManager.toasts.publishingFailed"), description: error.message, variant: "destructive" });
      // Log publish failure
      logSocialPostActivity("publish_failed", postId, undefined, {
        error: error.message,
      });
    },
  });

  // Delete a post
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("social_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      queryClient.invalidateQueries({ queryKey: ["approved-posts"] });
      queryClient.invalidateQueries({ queryKey: ["social-post-metrics"] });
      toast({ title: i18n.t("mediaManager.toasts.postDeleted"), description: i18n.t("mediaManager.toasts.postDeletedDesc") });
    },
    onError: (error: any) => {
      toast({
        title: i18n.t("mediaManager.toasts.errorDeletingPost"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    posts: postsQuery.data || [],
    isLoading: postsQuery.isLoading,
    error: postsQuery.error,
    createDraft: createMutation.mutateAsync,
    updateDraft: updateMutation.mutateAsync,
    approvePost: approveMutation.mutateAsync,
    retryPost: retryMutation.mutateAsync,
    publishPost: publishMutation.mutateAsync,
    deletePost: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isApproving: approveMutation.isPending,
    isRetrying: retryMutation.isPending,
    isPublishing: publishMutation.isPending,
  };
}

export function useSocialPost(id: string | null) {
  return useQuery({
    queryKey: ["social-post", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from("social_posts").select("*").eq("id", id).maybeSingle();

      if (error) throw error;
      return data as SocialPost | null;
    },
    enabled: !!id,
  });
}
