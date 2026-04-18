import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";

interface Filters {
  status?: string;
  pipeline?: string;
  source?: string;
  campaign?: string;
}

interface NewLead {
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  website_url?: string | null;
  phone?: string | null;
  location?: string | null;
  category?: string | null;
  pipeline_type: "sales" | "partner";
  source: string;
  notes?: string | null;
  campaign_id?: string | null;
}

interface CampaignInfo {
  id: string;
  name: string;
  min_ai_score: number | null;
}

export interface OutreachRawLead {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  website_url: string | null;
  phone: string | null;
  location: string | null;
  category: string | null;
  pipeline_type: "sales" | "partner";
  source: string;
  notes: string | null;
  status: string;
  ai_score: number | null;
  ai_reasoning: string | null;
  ai_rated_at: string | null;
  campaign_id: string | null;
  created_at: string;
  campaign?: CampaignInfo | null;
}

async function fetchCampaignsMap(campaignIds: string[]): Promise<Record<string, CampaignInfo>> {
  if (campaignIds.length === 0) return {};

  const { data: campaigns } = await supabase
    .from("outreach_campaigns")
    .select("id, name, min_ai_score")
    .in("id", campaignIds);

  if (!campaigns) return {};
  return campaigns.reduce((acc, c) => ({ ...acc, [c.id]: c }), {} as Record<string, CampaignInfo>);
}

// Helper to extract campaign_id from a row (handles new column not yet in types)
function getCampaignId(row: Record<string, unknown>): string | null {
  return (row.campaign_id as string | null) ?? null;
}

export function useOutreachRawLeads(filters?: Filters) {
  const queryClient = useQueryClient();

  // Realtime subscription for live raw lead updates
  useEffect(() => {
    const channel = supabase
      .channel("outreach-raw-leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "outreach_raw_leads" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["outreach-raw-leads"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["outreach-raw-leads", filters],
    queryFn: async (): Promise<OutreachRawLead[]> => {
      // Build the query with server-side filters
      let query = supabase
        .from("outreach_raw_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.pipeline && filters.pipeline !== "all") {
        query = query.eq("pipeline_type", filters.pipeline);
      }
      if (filters?.source && filters.source !== "all") {
        query = query.eq("source", filters.source);
      }

      const { data, error } = await query;

      if (error) throw error;
      if (!data) return [];

      // Campaign filter stays client-side (column may not be in generated types)
      let filtered = data as unknown as Record<string, unknown>[];

      if (filters?.campaign && filters.campaign !== "all") {
        if (filters.campaign === "none") {
          filtered = filtered.filter(l => getCampaignId(l) === null);
        } else {
          filtered = filtered.filter(l => getCampaignId(l) === filters.campaign);
        }
      }

      // Get unique campaign IDs
      const campaignIds = [...new Set(
        filtered.map(getCampaignId).filter((id): id is string => id !== null)
      )];

      // Fetch campaigns
      const campaignsMap = await fetchCampaignsMap(campaignIds);

      // Transform the data
      return filtered.map((lead) => ({
        id: lead.id as string,
        company_name: lead.company_name as string,
        contact_name: lead.contact_name as string | null,
        email: lead.email as string | null,
        website_url: lead.website_url as string | null,
        phone: lead.phone as string | null,
        location: lead.location as string | null,
        category: lead.category as string | null,
        pipeline_type: lead.pipeline_type as "sales" | "partner",
        source: lead.source as string,
        notes: lead.notes as string | null,
        status: lead.status as string,
        ai_score: lead.ai_score as number | null,
        ai_reasoning: lead.ai_reasoning as string | null,
        ai_rated_at: lead.ai_rated_at as string | null,
        campaign_id: getCampaignId(lead),
        created_at: lead.created_at as string,
        campaign: getCampaignId(lead) ? campaignsMap[getCampaignId(lead)!] || null : null,
      }));
    },
  });

  const addLeadMutation = useMutation({
    mutationFn: async (lead: NewLead) => {
      const { data, error } = await supabase
        .from("outreach_raw_leads")
        .insert({
          company_name: lead.company_name,
          contact_name: lead.contact_name ?? null,
          email: lead.email ?? null,
          website_url: lead.website_url ?? null,
          phone: lead.phone ?? null,
          location: lead.location ?? null,
          category: lead.category ?? null,
          pipeline_type: lead.pipeline_type,
          source: lead.source,
          notes: lead.notes ?? null,
          campaign_id: lead.campaign_id === "none" ? null : (lead.campaign_id ?? null),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-raw-leads"] });
      toast({
        title: i18n.t("common.success"),
        description: i18n.t("outreach.leads.addLead"),
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

  const bulkAddLeadsMutation = useMutation({
    mutationFn: async (leads: NewLead[]) => {
      const leadsToInsert = leads.map((lead) => ({
        company_name: lead.company_name,
        contact_name: lead.contact_name ?? null,
        email: lead.email ?? null,
        website_url: lead.website_url ?? null,
        phone: lead.phone ?? null,
        location: lead.location ?? null,
        category: lead.category ?? null,
        pipeline_type: lead.pipeline_type,
        source: lead.source,
        notes: lead.notes ?? null,
        campaign_id: lead.campaign_id === "none" ? null : (lead.campaign_id ?? null),
      }));
      const { data, error } = await supabase
        .from("outreach_raw_leads")
        .insert(leadsToInsert)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-raw-leads"] });
    },
    onError: (error) => {
      toast({
        title: i18n.t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rateLeadsMutation = useMutation({
    mutationFn: async ({ leadIds, rateAllNew }: { leadIds?: string[]; rateAllNew?: boolean }) => {
      const response = await supabase.functions.invoke("rate-outreach-leads", {
        body: {
          lead_ids: leadIds,
          rate_all_new: rateAllNew,
        },
      });

      if (response.error) throw response.error;
      return response.data as { 
        rated: number; 
        total?: number; 
        queued?: number; 
        capReached?: boolean;
        errors?: string[] 
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["outreach-raw-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-daily-usage"] });
      
      if (data.capReached && data.queued && data.queued > 0) {
        toast({
          title: i18n.t("outreach.caps.capsReachedTitle"),
          description: i18n.t("outreach.caps.ratingCapReached", { queued: data.queued }),
          variant: "destructive",
        });
      } else if (data.rated > 0) {
        toast({
          title: i18n.t("common.success"),
          description: i18n.t("outreach.leads.ratingComplete", { count: data.rated }),
        });
      } else {
        toast({
          title: i18n.t("common.info"),
          description: i18n.t("outreach.leads.noLeadsToRate"),
        });
      }
    },
    onError: (error) => {
      toast({
        title: i18n.t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const qualifyLeadsMutation = useMutation({
    mutationFn: async ({ 
      leadIds, 
      capSettings, 
      currentUsage 
    }: { 
      leadIds: string[]; 
      capSettings?: { max_qualified_per_day: { value: number; enabled: boolean } };
      currentUsage?: { qualified: number };
    }) => {
      // Check qualification cap
      const qualifiedToday = currentUsage?.qualified ?? 0;
      const cap = capSettings?.max_qualified_per_day;
      const remaining = cap?.enabled ? Math.max(0, cap.value - qualifiedToday) : Infinity;

      if (remaining === 0) {
        return { qualified: 0, skipped: 0, queued: leadIds.length, capReached: true };
      }

      // Get lead details
      const { data: rawLeadsData, error: fetchError } = await supabase
        .from("outreach_raw_leads")
        .select("*")
        .in("id", leadIds);

      if (fetchError) throw fetchError;
      if (!rawLeadsData || rawLeadsData.length === 0) return { qualified: 0, skipped: 0, queued: 0, capReached: false };

      // Cast to generic record type
      const dbRows = rawLeadsData as unknown as Record<string, unknown>[];

      // Get unique campaign IDs
      const campaignIds = [...new Set(
        dbRows.map(getCampaignId).filter((id): id is string => id !== null)
      )];

      // Fetch campaigns
      const campaignsMap = await fetchCampaignsMap(campaignIds);

      // Transform leads with campaign info
      const rawLeads: OutreachRawLead[] = dbRows.map((lead) => ({
        id: lead.id as string,
        company_name: lead.company_name as string,
        contact_name: lead.contact_name as string | null,
        email: lead.email as string | null,
        website_url: lead.website_url as string | null,
        phone: lead.phone as string | null,
        location: lead.location as string | null,
        category: lead.category as string | null,
        pipeline_type: lead.pipeline_type as "sales" | "partner",
        source: lead.source as string,
        notes: lead.notes as string | null,
        status: lead.status as string,
        ai_score: lead.ai_score as number | null,
        ai_reasoning: lead.ai_reasoning as string | null,
        ai_rated_at: lead.ai_rated_at as string | null,
        campaign_id: getCampaignId(lead),
        created_at: lead.created_at as string,
        campaign: getCampaignId(lead) ? campaignsMap[getCampaignId(lead)!] || null : null,
      }));

      // Filter leads that meet their threshold
      const DEFAULT_THRESHOLD = 3.5;
      const qualifiedLeads: OutreachRawLead[] = [];
      const skippedLeads: OutreachRawLead[] = [];

      for (const lead of rawLeads) {
        const threshold = lead.campaign?.min_ai_score ?? DEFAULT_THRESHOLD;
        const score = Number(lead.ai_score) || 0;

        if (score >= threshold) {
          qualifiedLeads.push(lead);
        } else {
          skippedLeads.push(lead);
        }
      }

      if (qualifiedLeads.length === 0) {
        return { qualified: 0, skipped: skippedLeads.length, queued: 0, capReached: false };
      }

      // Apply cap - take only what we can process
      const leadsToProcess = qualifiedLeads.slice(0, remaining);
      const queuedLeads = qualifiedLeads.slice(remaining);

      // Queue leads that exceed cap
      if (queuedLeads.length > 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const queuedTasks = queuedLeads.map((lead) => ({
          task_type: "qualify",
          entity_id: lead.id,
          entity_type: "raw_lead",
          scheduled_for: tomorrow.toISOString().split("T")[0],
        }));

        await supabase.from("outreach_queued_tasks").insert(queuedTasks);
      }

      // Create CRM leads with campaign_id
      const crmLeads = leadsToProcess.map((lead) => ({
        raw_lead_id: lead.id,
        pipeline_type: lead.pipeline_type,
        company_name: lead.company_name,
        contact_name: lead.contact_name,
        email: lead.email,
        website_url: lead.website_url,
        phone: lead.phone,
        location: lead.location,
        category: lead.category,
        source: lead.source,
        ai_score: lead.ai_score,
        campaign_id: lead.campaign_id,
        status: "new" as const,
      }));

      const { error: insertError } = await supabase
        .from("outreach_crm_leads")
        .insert(crmLeads);

      if (insertError) throw insertError;

      // Update raw leads status
      const { error: updateError } = await supabase
        .from("outreach_raw_leads")
        .update({ status: "qualified" })
        .in("id", leadsToProcess.map((l) => l.id));

      if (updateError) throw updateError;

      // Update campaign leads_count
      const campaignCounts: Record<string, number> = {};
      for (const lead of leadsToProcess) {
        if (lead.campaign_id) {
          campaignCounts[lead.campaign_id] = (campaignCounts[lead.campaign_id] || 0) + 1;
        }
      }
      for (const [campaignId, count] of Object.entries(campaignCounts)) {
        const { data: campaign } = await supabase
          .from("outreach_campaigns")
          .select("leads_count")
          .eq("id", campaignId)
          .single();
        if (campaign) {
          await supabase.from("outreach_campaigns")
            .update({ leads_count: (campaign.leads_count || 0) + count })
            .eq("id", campaignId);
        }
      }

      // Track usage
      if (leadsToProcess.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const { data: existing } = await supabase
          .from("outreach_daily_usage")
          .select("id, usage_count")
          .eq("usage_date", today)
          .eq("usage_type", "qualified")
          .is("inbox_id", null)
          .single();

        if (existing) {
          await supabase
            .from("outreach_daily_usage")
            .update({ usage_count: existing.usage_count + leadsToProcess.length })
            .eq("id", existing.id);
        } else {
          await supabase.from("outreach_daily_usage").insert({
            usage_date: today,
            usage_type: "qualified",
            usage_count: leadsToProcess.length,
          });
        }
      }

      return { 
        qualified: leadsToProcess.length, 
        skipped: skippedLeads.length, 
        queued: queuedLeads.length,
        capReached: queuedLeads.length > 0
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["outreach-raw-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-daily-usage"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });

      if (data.capReached && data.queued > 0) {
        toast({
          title: i18n.t("outreach.caps.capsReachedTitle"),
          description: i18n.t("outreach.caps.qualificationCapReached", { queued: data.queued }),
          variant: "destructive",
        });
      } else if (data.qualified > 0) {
        toast({
          title: i18n.t("common.success"),
          description: i18n.t("outreach.leads.moveQualified"),
        });
      }

      if (data.skipped > 0) {
        toast({
          title: i18n.t("common.info"),
          description: i18n.t("outreach.leads.skippedBelowThreshold", { count: data.skipped }),
        });
      }
    },
    onError: (error) => {
      toast({
        title: i18n.t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectLeadsMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const { error } = await supabase
        .from("outreach_raw_leads")
        .update({ status: "rejected" })
        .in("id", leadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-raw-leads"] });
      toast({
        title: i18n.t("common.success"),
        description: i18n.t("outreach.leads.rejectLead"),
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
    addLead: addLeadMutation.mutateAsync,
    isAdding: addLeadMutation.isPending,
    bulkAddLeads: bulkAddLeadsMutation.mutateAsync,
    rateLeads: rateLeadsMutation.mutateAsync,
    isRating: rateLeadsMutation.isPending,
    qualifyLeads: qualifyLeadsMutation.mutateAsync,
    isQualifying: qualifyLeadsMutation.isPending,
    rejectLeads: rejectLeadsMutation.mutateAsync,
  };
}
