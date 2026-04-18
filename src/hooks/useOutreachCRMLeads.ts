import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";

interface Filters {
  status?: string;
  pipeline?: string;
}

type CRMLeadStatus = "new" | "contacted" | "replied" | "interested" | "converted" | "closed";

export function useOutreachCRMLeads(filters?: Filters) {
  const queryClient = useQueryClient();

  // Realtime subscription for live CRM lead updates
  useEffect(() => {
    const channel = supabase
      .channel("outreach-crm-leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "outreach_crm_leads" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["outreach-crm-leads"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["outreach-crm-leads", filters],
    queryFn: async () => {
      let query = supabase
        .from("outreach_crm_leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.pipeline && filters.pipeline !== "all") {
        query = query.eq("pipeline_type", filters.pipeline);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: CRMLeadStatus }) => {
      const updates: Record<string, unknown> = { status };
      
      if (status === "contacted") {
        updates.last_contacted_at = new Date().toISOString();
      }
      if (status === "replied") {
        updates.last_reply_at = new Date().toISOString();
      }
      if (status === "converted") {
        updates.converted_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("outreach_crm_leads")
        .update(updates)
        .eq("id", leadId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-crm-leads"] });
    },
    onError: (error) => {
      toast({
        title: i18n.t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateResearchMutation = useMutation({
    mutationFn: async ({ 
      leadId, 
      research_summary, 
      personalization_hooks 
    }: { 
      leadId: string; 
      research_summary: string; 
      personalization_hooks: Record<string, string>;
    }) => {
      const { data, error } = await supabase
        .from("outreach_crm_leads")
        .update({ research_summary, personalization_hooks })
        .eq("id", leadId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-crm-leads"] });
      toast({
        title: i18n.t("common.success"),
        description: i18n.t("outreach.crm.research.title"),
      });
    },
    onError: (error) => {
      toast({
        title: i18n.t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    leads,
    isLoading,
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
    updateResearch: updateResearchMutation.mutateAsync,
    isUpdatingResearch: updateResearchMutation.isPending,
  };
}
