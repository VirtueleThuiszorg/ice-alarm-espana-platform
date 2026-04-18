import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VideoExport {
  id: string;
  project_id: string;
  render_id: string | null;
  mp4_url: string | null;
  srt_url: string | null;
  vtt_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  created_at: string;
  format: string; // Format variant (9:16, 16:9, 1:1)
  // YouTube fields
  youtube_video_id: string | null;
  youtube_url: string | null;
  youtube_status: string | null;
  youtube_error: string | null;
  youtube_published_at: string | null;
}

export function useVideoExports() {
  const queryClient = useQueryClient();

  // Realtime subscription for new exports - optimized with direct cache updates
  useEffect(() => {
    const channel = supabase
      .channel('video-exports-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_exports' },
        (payload) => {
          // Optimistically update the cache for faster UI updates
          if (payload.eventType === 'INSERT') {
            const newExport = payload.new as VideoExport;
            queryClient.setQueryData<VideoExport[]>(
              ["video-exports"], 
              (old) => {
                if (!old) return [newExport];
                // Add to beginning (newest first)
                return [newExport, ...old];
              }
            );
          } else if (payload.eventType === 'UPDATE') {
            const updatedExport = payload.new as VideoExport;
            queryClient.setQueryData<VideoExport[]>(
              ["video-exports"], 
              (old) => {
                if (!old) return [updatedExport];
                return old.map(e => e.id === updatedExport.id ? updatedExport : e);
              }
            );
          }
          // Also invalidate to ensure consistency
          queryClient.invalidateQueries({ queryKey: ['video-exports'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: exports, isLoading } = useQuery({
    queryKey: ["video-exports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_exports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as VideoExport[];
    },
    staleTime: 1000 * 10, // 10 seconds
  });

  // Get latest export by project ID
  const latestExportByProject = useMemo(() => {
    if (!exports) return new Map<string, VideoExport>();
    const map = new Map<string, VideoExport>();
    for (const exp of exports) {
      if (!map.has(exp.project_id)) {
        map.set(exp.project_id, exp);
      }
    }
    return map;
  }, [exports]);

  // Get exports grouped by project and format
  const exportsByProjectAndFormat = useMemo(() => {
    if (!exports) return new Map<string, Map<string, VideoExport>>();
    const projectMap = new Map<string, Map<string, VideoExport>>();
    
    for (const exp of exports) {
      if (!projectMap.has(exp.project_id)) {
        projectMap.set(exp.project_id, new Map());
      }
      const formatMap = projectMap.get(exp.project_id)!;
      // Only keep latest export per format
      if (!formatMap.has(exp.format)) {
        formatMap.set(exp.format, exp);
      }
    }
    return projectMap;
  }, [exports]);

  const sendToOutreachMutation = useMutation({
    mutationFn: async (exportId: string) => {
      // Create a link record in video_outreach_links
      const { data, error } = await supabase
        .from("video_outreach_links")
        .insert({ export_id: exportId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-outreach-links"] });
    },
  });

  return {
    exports,
    isLoading,
    latestExportByProject,
    exportsByProjectAndFormat,
    sendToOutreach: sendToOutreachMutation.mutateAsync,
    isSending: sendToOutreachMutation.isPending,
  };
}
