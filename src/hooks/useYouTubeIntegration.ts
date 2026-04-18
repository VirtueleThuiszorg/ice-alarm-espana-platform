import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import i18n from "@/i18n";

export interface YouTubeIntegration {
  connected: boolean;
  channel_id: string | null;
  channel_name: string | null;
  last_used_at: string | null;
  connected_at: string | null;
  thumbnail_url: string | null;
  channel_mismatch: boolean;
  expected_channel_id: string;
  status: string;
}

export function useYouTubeIntegration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: integration, isLoading } = useQuery({
    queryKey: ["youtube-integration-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("youtube-integration-status");
      if (error) throw error;
      return data as YouTubeIntegration;
    },
    refetchOnWindowFocus: true,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("youtube-oauth-start");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(
        data.authUrl,
        "youtube-oauth",
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Listen for completion
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "youtube-oauth-complete") {
          window.removeEventListener("message", handleMessage);
          queryClient.invalidateQueries({ queryKey: ["youtube-integration-status"] });
          
          if (event.data.success) {
            toast({
              title: i18n.t("videoHub.youtube.toasts.connected"),
              description: i18n.t("videoHub.youtube.toasts.connectedDesc"),
            });
          }
        }
      };
      window.addEventListener("message", handleMessage);

      // Cleanup on popup close
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
          queryClient.invalidateQueries({ queryKey: ["youtube-integration-status"] });
        }
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: i18n.t("videoHub.youtube.toasts.connectionFailed"),
        description: error?.message || i18n.t("videoHub.youtube.toasts.connectionFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("youtube-disconnect");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["youtube-integration-status"] });
      toast({
        title: i18n.t("videoHub.youtube.toasts.disconnected"),
        description: i18n.t("videoHub.youtube.toasts.disconnectedDesc"),
      });
    },
    onError: (error: any) => {
      toast({
        title: i18n.t("videoHub.youtube.toasts.disconnectFailed"),
        description: error?.message || i18n.t("videoHub.youtube.toasts.disconnectFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (params: {
      video_export_id: string;
      title: string;
      description: string;
      visibility: "public" | "unlisted" | "private";
      tags?: string;
      playlist_id?: string;
      made_for_kids?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke("youtube-publish", {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-exports"] });
      toast({
        title: i18n.t("videoHub.youtube.toasts.videoPublished"),
        description: i18n.t("videoHub.youtube.toasts.videoPublishedDesc"),
      });
    },
    onError: (error: any) => {
      toast({
        title: i18n.t("videoHub.youtube.toasts.publishFailed"),
        description: error?.message || i18n.t("videoHub.youtube.toasts.publishFailedDesc"),
        variant: "destructive",
      });
    },
  });

  return {
    integration,
    isLoading,
    isConnected: integration?.connected ?? false,
    connect: connectMutation.mutate,
    isConnecting: connectMutation.isPending,
    disconnect: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isPending,
    publish: publishMutation.mutateAsync,
    isPublishing: publishMutation.isPending,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["youtube-integration-status"] }),
  };
}
