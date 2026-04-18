import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";

export interface EscalationChainEntry {
  id: string;
  shift_date: string;
  shift_type: string;
  primary_staff_id: string | null;
  backup_staff_id: string | null;
  supervisor_staff_id: string | null;
}

export function useEscalationChains(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["escalation-chains", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shift_escalation_chain")
        .select("*")
        .gte("shift_date", startDate)
        .lte("shift_date", endDate);
      if (error) throw error;
      return (data || []) as EscalationChainEntry[];
    },
    staleTime: STALE_TIMES.MEDIUM,
  });
}

export function useEscalationChainMutations() {
  const qc = useQueryClient();

  const upsertChain = useMutation({
    mutationFn: async (entry: {
      shift_date: string;
      shift_type: string;
      primary_staff_id: string | null;
      backup_staff_id: string | null;
      supervisor_staff_id: string | null;
      created_by?: string;
    }) => {
      const { data, error } = await (supabase as any)
        .from("shift_escalation_chain")
        .upsert(entry, { onConflict: "shift_date,shift_type" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalation-chains"] });
    },
  });

  return { upsertChain };
}
