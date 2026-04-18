import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";

export interface PipelineRunResult {
  success: boolean;
  dry_run: boolean;
  started_at: string;
  finished_at: string;
  totals: {
    enriched: number;
    rated: number;
    drafted: number;
    sent: number;
    followups: number;
  };
  steps: Record<string, any>;
  errors?: string[];
}

export function useOutreachPipeline() {
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<PipelineRunResult | null>(null);

  const runPipelineMutation = useMutation({
    mutationFn: async (stepsOverride?: Record<string, boolean>) => {
      const { data, error } = await supabase.functions.invoke("outreach-pipeline-runner", {
        body: { steps_override: stepsOverride },
      });
      if (error) throw error;
      return data as PipelineRunResult;
    },
    onSuccess: (data) => {
      setLastRun(data);
      queryClient.invalidateQueries({ queryKey: ["outreach-raw-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-daily-usage"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-run-logs"] });
      toast({
        title: data.dry_run ? i18n.t("outreach.pipelineToasts.completedDryRun") : i18n.t("outreach.pipelineToasts.completed"),
        description: i18n.t("outreach.pipelineToasts.completedDesc", { enriched: data.totals.enriched, rated: data.totals.rated, drafted: data.totals.drafted, sent: data.totals.sent }),
      });
    },
    onError: (error) => {
      toast({ title: i18n.t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async (leadId?: string | void) => {
      const { data, error } = await supabase.functions.invoke("outreach-enrich-lead", {
        body: leadId ? { lead_id: leadId } : { enrich_all_unenriched: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["outreach-raw-leads"] });
      toast({ title: i18n.t("common.success"), description: i18n.t("outreach.pipelineToasts.enrichedCount", { count: data.enriched }) });
    },
    onError: (error) => {
      toast({ title: i18n.t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const draftMutation = useMutation({
    mutationFn: async (leadIds?: string[] | void) => {
      const { data, error } = await supabase.functions.invoke("outreach-generate-drafts", {
        body: leadIds && leadIds.length > 0 ? { lead_ids: leadIds } : { draft_all_qualified: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["outreach-crm-leads"] });
      toast({ title: i18n.t("common.success"), description: i18n.t("outreach.pipelineToasts.draftedCount", { count: data.drafted }) });
    },
    onError: (error) => {
      toast({ title: i18n.t("common.error"), description: error.message, variant: "destructive" });
    },
  });

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
    runPipeline: runPipelineMutation.mutateAsync,
    isRunningPipeline: runPipelineMutation.isPending,
    lastRun,
    enrichLeads: enrichMutation.mutateAsync,
    isEnriching: enrichMutation.isPending,
    generateDrafts: draftMutation.mutateAsync,
    isDrafting: draftMutation.isPending,
    sendEmails: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
  };
}
