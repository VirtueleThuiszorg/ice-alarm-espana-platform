import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";

// The AI pipeline steps (enrich / rate / draft / full run) were archived with
// their edge functions (archive/supabase-functions/) — only sending remains.
export function useOutreachPipeline() {
  const queryClient = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: async (draftIds?: string[] | void) => {
      const { data, error } = await supabase.functions.invoke("outreach-send-email", {
        body: draftIds && draftIds.length > 0 ? { draft_ids: draftIds } : { send_all_approved: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["outreach-crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-daily-usage"] });
      toast({
        title: data.dry_run ? i18n.t("outreach.pipelineToasts.sentDryRun") : i18n.t("common.success"),
        description: data.dry_run
          ? i18n.t("outreach.pipelineToasts.sentCountSimulated", { count: data.sent })
          : i18n.t("outreach.pipelineToasts.sentCount", { count: data.sent }),
      });
    },
    onError: (error) => {
      toast({ title: i18n.t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  return {
    sendEmails: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
  };
}
