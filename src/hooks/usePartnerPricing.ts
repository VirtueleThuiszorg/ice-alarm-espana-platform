import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerPricingTier {
  id: string;
  partner_id: string;
  name: string;
  membership_type: "single" | "couple";
  billing_frequency: "monthly" | "annual";
  subscription_net_price: number;
  registration_fee: number;
  registration_fee_discount_percent: number;
  pendant_net_price: number | null;
  commission_amount: number;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
}

export function usePartnerPricing(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner-pricing", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      const { data, error } = await supabase
        .from("partner_pricing_tiers")
        .select("*")
        .eq("partner_id", partnerId)
        .order("effective_from", { ascending: false });

      if (error) throw error;
      return data as PartnerPricingTier[];
    },
    enabled: !!partnerId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useActivePartnerPricing(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner-pricing-active", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("partner_pricing_tiers")
        .select("*")
        .eq("partner_id", partnerId)
        .lte("effective_from", now)
        .or(`effective_to.is.null,effective_to.gt.${now}`)
        .order("effective_from", { ascending: false });

      if (error) throw error;
      return data as PartnerPricingTier[];
    },
    enabled: !!partnerId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePartnerPricingTier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tier: Omit<PartnerPricingTier, "id" | "created_at" | "created_by">) => {
      const { data: session } = await supabase.auth.getSession();
      
      const { data, error } = await supabase
        .from("partner_pricing_tiers")
        .insert({
          ...tier,
          created_by: session.session?.user.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-pricing", variables.partner_id] });
      queryClient.invalidateQueries({ queryKey: ["partner-pricing-active", variables.partner_id] });
    },
  });
}

export function useUpdatePartnerPricingTier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      partnerId,
      ...updates
    }: Partial<PartnerPricingTier> & { id: string; partnerId: string }) => {
      const { data, error } = await supabase
        .from("partner_pricing_tiers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-pricing", variables.partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner-pricing-active", variables.partnerId] });
    },
  });
}

export function useDeletePartnerPricingTier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, partnerId: _partnerId }: { id: string; partnerId: string }) => {
      const { error } = await supabase
        .from("partner_pricing_tiers")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["partner-pricing", variables.partnerId] });
      queryClient.invalidateQueries({ queryKey: ["partner-pricing-active", variables.partnerId] });
    },
  });
}
