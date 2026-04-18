import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FailedAction {
  id: string;
  system: "media" | "outreach" | "video";
  type: string;
  title: string;
  error: string;
  failed_at: string;
  retryable: boolean;
  entity_id: string;
}

export function useFailedActions() {
  const queryClient = useQueryClient();

  const { data: failedActions = [], isLoading } = useQuery({
    queryKey: ["failed-actions"],
    queryFn: async (): Promise<FailedAction[]> => {
      const actions: FailedAction[] = [];

      const [failedPosts, failedRenders, failedEmails] = await Promise.all([
        supabase
          .from("social_posts")
          .select("id, topic, error_message, updated_at")
          .eq("status", "failed")
          .order("updated_at", { ascending: false })
          .limit(20),

        supabase
          .from("video_renders")
          .select("id, project_id, error, updated_at")
          .eq("status", "failed")
          .order("updated_at", { ascending: false })
          .limit(20),

        supabase
          .from("outreach_email_drafts")
          .select("id, subject, created_at")
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (failedPosts.data) {
        for (const post of failedPosts.data) {
          actions.push({
            id: `media-${post.id}`,
            system: "media",
            type: "publish",
            title: post.topic || "Untitled post",
            error: post.error_message || "Unknown error",
            failed_at: post.updated_at || new Date().toISOString(),
            retryable: true,
            entity_id: post.id,
          });
        }
      }

      if (failedRenders.data) {
        for (const render of failedRenders.data) {
          actions.push({
            id: `video-${render.id}`,
            system: "video",
            type: "render",
            title: `Render ${render.id.slice(0, 8)}`,
            error: render.error || "Unknown error",
            failed_at: render.updated_at || new Date().toISOString(),
            retryable: true,
            entity_id: render.id,
          });
        }
      }

      if (failedEmails.data) {
        for (const email of failedEmails.data) {
          actions.push({
            id: `outreach-${email.id}`,
            system: "outreach",
            type: "email",
            title: email.subject || "Untitled email",
            error: "Send failed",
            failed_at: email.created_at || new Date().toISOString(),
            retryable: true,
            entity_id: email.id,
          });
        }
      }

      actions.sort((a, b) => new Date(b.failed_at).getTime() - new Date(a.failed_at).getTime());
      return actions;
    },
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });

  const retryAction = async (action: FailedAction) => {
    switch (action.system) {
      case "media":
        await supabase
          .from("social_posts")
          .update({ status: "approved", error_message: null, updated_at: new Date().toISOString() })
          .eq("id", action.entity_id);
        break;

      case "video": {
        const { data: render } = await supabase
          .from("video_renders")
          .select("project_id")
          .eq("id", action.entity_id)
          .single();

        if (render?.project_id) {
          const { data, error } = await supabase.functions.invoke("video-render-queue", {
            body: { project_id: render.project_id },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
        }
        break;
      }

      case "outreach":
        await supabase
          .from("outreach_email_drafts")
          .update({ status: "approved" })
          .eq("id", action.entity_id);
        break;
    }

    queryClient.invalidateQueries({ queryKey: ["failed-actions"] });
    queryClient.invalidateQueries({ queryKey: ["social-posts"] });
    queryClient.invalidateQueries({ queryKey: ["video-renders"] });
  };

  const retryAll = async () => {
    const retryableActions = failedActions.filter(a => a.retryable);
    for (const action of retryableActions) {
      try {
        await retryAction(action);
      } catch (err) {
        console.error(`Retry failed for ${action.id}:`, err);
      }
    }
  };

  return {
    failedActions,
    isLoading,
    retryAction,
    retryAll,
    failedCount: failedActions.length,
  };
}
