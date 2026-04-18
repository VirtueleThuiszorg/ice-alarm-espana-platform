import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VideoRender {
  id: string;
  project_id: string;
  status: string;
  progress: number;
  stage: string | null;
  error: string | null;
  worker_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useVideoRenders(projectId?: string) {
  const queryClient = useQueryClient();

  // Realtime subscription for live updates - optimized with direct cache updates
  useEffect(() => {
    const channel = supabase
      .channel('video-renders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_renders',
          ...(projectId ? { filter: `project_id=eq.${projectId}` } : {})
        },
        (payload) => {
          // Optimistically update the cache for faster UI updates
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const newRender = payload.new as VideoRender;
            queryClient.setQueryData<VideoRender[]>(
              ["video-renders", projectId],
              (old) => {
                if (!old) return [newRender];
                const index = old.findIndex(r => r.id === newRender.id);
                if (index >= 0) {
                  const updated = [...old];
                  updated[index] = newRender;
                  return updated;
                }
                return [newRender, ...old];
              }
            );
          } else if (payload.eventType === 'DELETE') {
            queryClient.invalidateQueries({ queryKey: ['video-renders'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, projectId]);

  const { data: renders, isLoading } = useQuery({
    queryKey: ["video-renders", projectId],
    queryFn: async () => {
      let query = supabase
        .from("video_renders")
        .select("*")
        .order("created_at", { ascending: false });

      if (projectId) {
        query = query.eq("project_id", projectId);
      } else {
        query = query.limit(200);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as VideoRender[];
    },
    enabled: true,
    staleTime: 1000 * 5, // 5 seconds - renders update frequently
  });

  // Memoized map of latest render per project
  const latestRenderByProject = useMemo(() => {
    if (!renders) return new Map<string, VideoRender>();
    const map = new Map<string, VideoRender>();
    // Since renders are ordered by created_at desc, first one for each project is latest
    for (const render of renders) {
      if (!map.has(render.project_id)) {
        map.set(render.project_id, render);
      }
    }
    return map;
  }, [renders]);

  const queueRenderMutation = useMutation({
    mutationFn: async (projectId: string) => {
      // Create a render record with queued status
      const { data, error } = await supabase
        .from("video_renders")
        .insert({ project_id: projectId, status: "queued", progress: 0 })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-renders"] });
    },
  });

  // Retry failed render
  const retryRenderMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { data, error } = await supabase.functions.invoke('video-render-queue', {
        body: { project_id: projectId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-renders"] });
      queryClient.invalidateQueries({ queryKey: ["video-projects"] });
    },
  });

  return {
    renders,
    isLoading,
    latestRenderByProject,
    queueRender: queueRenderMutation.mutateAsync,
    isQueuing: queueRenderMutation.isPending,
    retryRender: retryRenderMutation.mutateAsync,
    isRetrying: retryRenderMutation.isPending,
  };
}
