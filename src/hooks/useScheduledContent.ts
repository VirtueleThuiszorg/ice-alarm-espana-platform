import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n";

export interface ScheduledContentItem {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  goal_id: string | null;
  audience_id: string | null;
  topic_id: string | null;
  image_style_id: string | null;
  status: "planned" | "generating" | "ready" | "published" | "skipped";
  generated_post_text: string | null;
  generated_post_text_es: string | null;
  generated_blog_intro: string | null;
  generated_blog_content: string | null;
  generated_image_prompt: string | null;
  generated_image_url: string | null;
  is_approved: boolean;
  is_disabled: boolean;
  publish_to_blog: boolean;
  publish_to_facebook: boolean;
  publish_to_instagram: boolean;
  published_at: string | null;
  blog_post_id: string | null;
  facebook_post_id: string | null;
  publish_error: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  goal?: { id: string; name: string } | null;
  audience?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  image_style?: { id: string; name: string } | null;
}

export function useScheduledContent(status?: "ready" | "published" | "all") {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["scheduled-content", status],
    queryFn: async () => {
      let query = supabase
        .from("media_content_calendar")
        .select(`
          *,
          goal:media_goals(id, name),
          audience:media_audiences(id, name),
          topic:media_topics(id, name),
          image_style:media_image_styles(id, name)
        `)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      if (status === "ready") {
        query = query.eq("status", "ready");
      } else if (status === "published") {
        query = query.eq("status", "published");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ScheduledContentItem[];
    },
  });

  // Generate content for slots
  const generateContent = useMutation({
    mutationFn: async (slotIds: string[]) => {
      const { data, error } = await supabase.functions.invoke("generate-slot-content", {
        body: { slot_ids: slotIds },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-content"] });
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      const successCount = data.results?.filter((r: { success: boolean }) => r.success).length || 0;
      toast({
        title: i18n.t("mediaStrategy.contentGenerated"),
        description: i18n.t("mediaStrategy.slotsGeneratedSuccess", { success: successCount, total: data.results?.length || 0 }),
      });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.generationFailed"), description: err.message, variant: "destructive" });
    },
  });

  // Approve a slot
  const approveSlot = useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase
        .from("media_content_calendar")
        .update({ is_approved: true, updated_at: new Date().toISOString() })
        .eq("id", slotId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-content"] });
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      toast({ title: i18n.t("mediaStrategy.slotApproved") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.approvingSlot"), description: err.message, variant: "destructive" });
    },
  });

  // Disable a slot
  const disableSlot = useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase
        .from("media_content_calendar")
        .update({ is_disabled: true, status: "skipped", updated_at: new Date().toISOString() })
        .eq("id", slotId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-content"] });
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      toast({ title: i18n.t("mediaStrategy.slotDisabled") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.disablingSlot"), description: err.message, variant: "destructive" });
    },
  });

  // Enable a slot
  const enableSlot = useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase
        .from("media_content_calendar")
        .update({ is_disabled: false, status: "ready", updated_at: new Date().toISOString() })
        .eq("id", slotId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-content"] });
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      toast({ title: i18n.t("mediaStrategy.slotEnabled") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.enablingSlot"), description: err.message, variant: "destructive" });
    },
  });

  // Update slot content
  const updateSlot = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Partial<ScheduledContentItem> & { id: string }) => {
      // Remove joined data from update
      const { goal: _g, audience: _a, topic: _t, image_style: _i, ...updateData } = data;
      const { error } = await supabase
        .from("media_content_calendar")
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-content"] });
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      toast({ title: i18n.t("mediaStrategy.slotUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.updatingSlot"), description: err.message, variant: "destructive" });
    },
  });

  // Publish a slot
  const publishSlot = useMutation({
    mutationFn: async (slotId: string) => {
      const { data, error } = await supabase.functions.invoke("publish-scheduled", {
        body: { slot_id: slotId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-content"] });
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["publishing-history"] });
      toast({ title: i18n.t("mediaStrategy.publishedSuccessfully") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.publishingFailed"), description: err.message, variant: "destructive" });
    },
  });

  // Toggle publish targets
  const togglePublishTarget = useMutation({
    mutationFn: async ({
      id,
      target,
      value,
    }: {
      id: string;
      target: "publish_to_blog" | "publish_to_facebook" | "publish_to_instagram";
      value: boolean;
    }) => {
      const { error } = await supabase
        .from("media_content_calendar")
        .update({ [target]: value, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-content"] });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.updating"), description: err.message, variant: "destructive" });
    },
  });

  return {
    items,
    isLoading,
    refetch,
    generateContent: generateContent.mutateAsync,
    approveSlot: approveSlot.mutateAsync,
    disableSlot: disableSlot.mutateAsync,
    enableSlot: enableSlot.mutateAsync,
    updateSlot: updateSlot.mutateAsync,
    publishSlot: publishSlot.mutateAsync,
    togglePublishTarget: togglePublishTarget.mutateAsync,
    isGenerating: generateContent.isPending,
    isApproving: approveSlot.isPending,
    isDisabling: disableSlot.isPending,
    isPublishing: publishSlot.isPending,
    isUpdating: updateSlot.isPending,
  };
}
