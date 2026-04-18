import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n";

// Types
export interface MediaGoal {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MediaAudience {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MediaTopic {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  goal_ids?: string[];
}

export interface MediaImageStyle {
  id: string;
  name: string;
  description: string;
  ai_prompt_hint: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MediaScheduleSettings {
  id: string;
  posts_per_day: number;
  active_days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
  };
  anti_repetition_rules: {
    goal_hours: number;
    audience_hours: number;
    topic_days: number;
    no_consecutive_style: boolean;
  };
  auto_publish_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Goals Hook
export function useMediaGoals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["media-goals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_goals")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as MediaGoal[];
    },
  });

  const createGoal = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const { error } = await supabase.from("media_goals").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-goals"] });
      toast({ title: i18n.t("mediaStrategy.toasts.goalCreated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorCreatingGoal"), description: err.message, variant: "destructive" });
    },
  });

  const updateGoal = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; is_active?: boolean }) => {
      const { error } = await supabase.from("media_goals").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-goals"] });
      toast({ title: i18n.t("mediaStrategy.toasts.goalUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorUpdatingGoal"), description: err.message, variant: "destructive" });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-goals"] });
      toast({ title: i18n.t("mediaStrategy.toasts.goalDeleted") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorDeletingGoal"), description: err.message, variant: "destructive" });
    },
  });

  return {
    goals,
    isLoading,
    createGoal: createGoal.mutateAsync,
    updateGoal: updateGoal.mutateAsync,
    deleteGoal: deleteGoal.mutateAsync,
    isCreating: createGoal.isPending,
    isUpdating: updateGoal.isPending,
    isDeleting: deleteGoal.isPending,
  };
}

// Audiences Hook
export function useMediaAudiences() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: audiences = [], isLoading } = useQuery({
    queryKey: ["media-audiences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_audiences")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as MediaAudience[];
    },
  });

  const createAudience = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const { error } = await supabase.from("media_audiences").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-audiences"] });
      toast({ title: i18n.t("mediaStrategy.toasts.audienceCreated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorCreatingAudience"), description: err.message, variant: "destructive" });
    },
  });

  const updateAudience = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; is_active?: boolean }) => {
      const { error } = await supabase.from("media_audiences").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-audiences"] });
      toast({ title: i18n.t("mediaStrategy.toasts.audienceUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorUpdatingAudience"), description: err.message, variant: "destructive" });
    },
  });

  const deleteAudience = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_audiences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-audiences"] });
      toast({ title: i18n.t("mediaStrategy.toasts.audienceDeleted") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorDeletingAudience"), description: err.message, variant: "destructive" });
    },
  });

  return {
    audiences,
    isLoading,
    createAudience: createAudience.mutateAsync,
    updateAudience: updateAudience.mutateAsync,
    deleteAudience: deleteAudience.mutateAsync,
    isCreating: createAudience.isPending,
    isUpdating: updateAudience.isPending,
    isDeleting: deleteAudience.isPending,
  };
}

// Topics Hook
export function useMediaTopics() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: topics = [], isLoading } = useQuery({
    queryKey: ["media-topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_topics")
        .select("*")
        .order("name");
      if (error) throw error;

      // Fetch goal links
      const { data: links } = await supabase.from("media_topic_goals").select("*");
      const linkMap = new Map<string, string[]>();
      (links || []).forEach((l: { topic_id: string; goal_id: string }) => {
        if (!linkMap.has(l.topic_id)) linkMap.set(l.topic_id, []);
        linkMap.get(l.topic_id)!.push(l.goal_id);
      });

      return (data as MediaTopic[]).map((t) => ({
        ...t,
        goal_ids: linkMap.get(t.id) || [],
      }));
    },
  });

  const createTopic = useMutation({
    mutationFn: async (data: { name: string; description?: string; goal_ids?: string[] }) => {
      const { goal_ids, ...topicData } = data;
      const { data: newTopic, error } = await supabase
        .from("media_topics")
        .insert(topicData)
        .select()
        .single();
      if (error) throw error;

      if (goal_ids?.length) {
        const links = goal_ids.map((goal_id) => ({ topic_id: newTopic.id, goal_id }));
        await supabase.from("media_topic_goals").insert(links);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-topics"] });
      toast({ title: i18n.t("mediaStrategy.toasts.topicCreated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorCreatingTopic"), description: err.message, variant: "destructive" });
    },
  });

  const updateTopic = useMutation({
    mutationFn: async ({ id, goal_ids, ...data }: { id: string; name?: string; description?: string; is_active?: boolean; goal_ids?: string[] }) => {
      const { error } = await supabase.from("media_topics").update(data).eq("id", id);
      if (error) throw error;

      if (goal_ids !== undefined) {
        await supabase.from("media_topic_goals").delete().eq("topic_id", id);
        if (goal_ids.length) {
          const links = goal_ids.map((goal_id) => ({ topic_id: id, goal_id }));
          await supabase.from("media_topic_goals").insert(links);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-topics"] });
      toast({ title: i18n.t("mediaStrategy.toasts.topicUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorUpdatingTopic"), description: err.message, variant: "destructive" });
    },
  });

  const deleteTopic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-topics"] });
      toast({ title: i18n.t("mediaStrategy.toasts.topicDeleted") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorDeletingTopic"), description: err.message, variant: "destructive" });
    },
  });

  return {
    topics,
    isLoading,
    createTopic: createTopic.mutateAsync,
    updateTopic: updateTopic.mutateAsync,
    deleteTopic: deleteTopic.mutateAsync,
    isCreating: createTopic.isPending,
    isUpdating: updateTopic.isPending,
    isDeleting: deleteTopic.isPending,
  };
}

// Image Styles Hook
export function useMediaImageStyles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: imageStyles = [], isLoading } = useQuery({
    queryKey: ["media-image-styles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_image_styles")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as MediaImageStyle[];
    },
  });

  const createImageStyle = useMutation({
    mutationFn: async (data: { name: string; description?: string; ai_prompt_hint?: string }) => {
      const { error } = await supabase.from("media_image_styles").insert({ ...data, description: data.description || "" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-image-styles"] });
      toast({ title: i18n.t("mediaStrategy.toasts.imageStyleCreated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorCreatingImageStyle"), description: err.message, variant: "destructive" });
    },
  });

  const updateImageStyle = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; ai_prompt_hint?: string; is_active?: boolean }) => {
      const { error } = await supabase.from("media_image_styles").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-image-styles"] });
      toast({ title: i18n.t("mediaStrategy.toasts.imageStyleUpdated") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorUpdatingImageStyle"), description: err.message, variant: "destructive" });
    },
  });

  const deleteImageStyle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_image_styles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-image-styles"] });
      toast({ title: i18n.t("mediaStrategy.toasts.imageStyleDeleted") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorDeletingImageStyle"), description: err.message, variant: "destructive" });
    },
  });

  return {
    imageStyles,
    isLoading,
    createImageStyle: createImageStyle.mutateAsync,
    updateImageStyle: updateImageStyle.mutateAsync,
    deleteImageStyle: deleteImageStyle.mutateAsync,
    isCreating: createImageStyle.isPending,
    isUpdating: updateImageStyle.isPending,
    isDeleting: deleteImageStyle.isPending,
  };
}

// Schedule Settings Hook
export function useMediaScheduleSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["media-schedule-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_schedule_settings")
        .select("*")
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data as MediaScheduleSettings | null;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (data: Partial<Omit<MediaScheduleSettings, "id" | "created_at" | "updated_at">>) => {
      if (settings?.id) {
        const { error } = await supabase
          .from("media_schedule_settings")
          .update(data)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("media_schedule_settings").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-schedule-settings"] });
      toast({ title: i18n.t("mediaStrategy.toasts.scheduleSettingsSaved") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.toasts.errorSavingSettings"), description: err.message, variant: "destructive" });
    },
  });

  return {
    settings,
    isLoading,
    updateSettings: updateSettings.mutateAsync,
    isUpdating: updateSettings.isPending,
  };
}
