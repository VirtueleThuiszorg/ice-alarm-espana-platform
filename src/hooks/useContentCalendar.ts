import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n";

export interface ContentCalendarItem {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  goal_id: string | null;
  audience_id: string | null;
  topic_id: string | null;
  image_style_id: string | null;
  social_post_id: string | null;
  status: "planned" | "generating" | "ready" | "published" | "skipped";
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  goal?: { id: string; name: string } | null;
  audience?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  image_style?: { id: string; name: string } | null;
}

export function useContentCalendar(startDate?: string, endDate?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["content-calendar", startDate, endDate],
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

      if (startDate) {
        query = query.gte("scheduled_date", startDate);
      }
      if (endDate) {
        query = query.lte("scheduled_date", endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ContentCalendarItem[];
    },
    enabled: !!startDate || !!endDate || true,
  });

  const createItem = useMutation({
    mutationFn: async (data: Omit<ContentCalendarItem, "id" | "created_at" | "updated_at" | "goal" | "audience" | "topic" | "image_style">) => {
      const { error } = await supabase.from("media_content_calendar").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.creatingCalendarItem"), description: err.message, variant: "destructive" });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ContentCalendarItem> & { id: string }) => {
       
      const { goal: _goal, audience: _audience, topic: _topic, image_style: _image_style, ...updateData } = data;
      const { error } = await supabase.from("media_content_calendar").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.updatingCalendarItem"), description: err.message, variant: "destructive" });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("media_content_calendar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.deletingCalendarItem"), description: err.message, variant: "destructive" });
    },
  });

  const clearCalendar = useMutation({
    mutationFn: async (dateRange?: { start: string; end: string }) => {
      let query = supabase.from("media_content_calendar").delete();
      if (dateRange) {
        query = query.gte("scheduled_date", dateRange.start).lte("scheduled_date", dateRange.end);
      } else {
        query = query.neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all
      }
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      toast({ title: i18n.t("mediaStrategy.calendarCleared") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.clearingCalendar"), description: err.message, variant: "destructive" });
    },
  });

  const bulkInsert = useMutation({
    mutationFn: async (items: Array<Omit<ContentCalendarItem, "id" | "created_at" | "updated_at" | "goal" | "audience" | "topic" | "image_style">>) => {
      const { error } = await supabase.from("media_content_calendar").insert(items);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      toast({ title: i18n.t("mediaStrategy.calendarGeneratedSuccess") });
    },
    onError: (err: Error) => {
      toast({ title: i18n.t("mediaStrategy.errors.generatingCalendar"), description: err.message, variant: "destructive" });
    },
  });

  return {
    items,
    isLoading,
    createItem: createItem.mutateAsync,
    updateItem: updateItem.mutateAsync,
    deleteItem: deleteItem.mutateAsync,
    clearCalendar: clearCalendar.mutateAsync,
    bulkInsert: bulkInsert.mutateAsync,
    isCreating: createItem.isPending,
    isUpdating: updateItem.isPending,
    isDeleting: deleteItem.isPending,
    isClearing: clearCalendar.isPending,
    isBulkInserting: bulkInsert.isPending,
  };
}
