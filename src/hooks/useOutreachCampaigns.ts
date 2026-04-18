import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";

export interface NewCampaign {
  name: string;
  description?: string | null;
  pipeline_type: "sales" | "partner";
  status?: "draft" | "active" | "paused" | "completed";
  target_description?: string | null;
  target_locations?: string[] | null;
  default_language: "en" | "es";
  email_tone: "professional" | "friendly" | "neutral";
  outreach_goal: "intro" | "partnership" | "meeting";
  follow_up_enabled: boolean;
  days_between_emails?: number;
  max_emails_per_lead?: number;
  min_ai_score?: number;
}

export interface Campaign extends NewCampaign {
  id: string;
  leads_count: number;
  emails_sent: number;
  replies_count: number;
  conversions_count: number;
  created_at: string;
  updated_at: string;
}

export function useOutreachCampaigns() {
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["outreach-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Campaign[];
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (campaign: NewCampaign) => {
      const { data, error } = await supabase
        .from("outreach_campaigns")
        .insert({
          name: campaign.name,
          description: campaign.description,
          pipeline_type: campaign.pipeline_type,
          status: campaign.status || "active",
          target_description: campaign.target_description,
          target_locations: campaign.target_locations,
          default_language: campaign.default_language,
          email_tone: campaign.email_tone,
          outreach_goal: campaign.outreach_goal,
          follow_up_enabled: campaign.follow_up_enabled,
          days_between_emails: campaign.days_between_emails || 3,
          max_emails_per_lead: campaign.max_emails_per_lead || 3,
          min_ai_score: campaign.min_ai_score || 3.5,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      toast({
        title: i18n.t("common.success"),
        description: i18n.t("outreach.campaigns.created"),
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

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Campaign> & { id: string }) => {
      const { data, error } = await supabase
        .from("outreach_campaigns")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      toast({
        title: i18n.t("common.success"),
        description: i18n.t("outreach.campaigns.updated"),
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

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("outreach_campaigns")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      toast({
        title: i18n.t("common.success"),
        description: i18n.t("outreach.campaigns.deleted"),
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
    campaigns,
    isLoading,
    createCampaign: createCampaignMutation.mutateAsync,
    isCreating: createCampaignMutation.isPending,
    updateCampaign: updateCampaignMutation.mutateAsync,
    isUpdating: updateCampaignMutation.isPending,
    deleteCampaign: deleteCampaignMutation.mutateAsync,
    isDeleting: deleteCampaignMutation.isPending,
  };
}
