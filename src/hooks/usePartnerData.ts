import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function usePartnerData(overridePartnerId?: string | null) {
  const { partnerId: authPartnerId } = useAuth();

  // Use override for admin view, or partnerId from AuthContext for regular partners
  const effectivePartnerId = overridePartnerId || authPartnerId;

  return useQuery({
    queryKey: ["my-partner-data", effectivePartnerId],
    queryFn: async () => {
      if (!effectivePartnerId) return null;

      // Always query by ID (works for both admin override and regular partner)
      const { data, error } = await supabase
        .from("partners")
        .select("*")
        .eq("id", effectivePartnerId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!effectivePartnerId,
    staleTime: 5 * 60 * 1000, // 5 minutes - partner data rarely changes
  });
}
