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

// `shift_escalation_chain` is not present in the generated Supabase types, so a
// minimal typed façade exposes only the builder methods used here.
interface EscalationSelectBuilder
  extends PromiseLike<{ data: EscalationChainEntry[] | null; error: unknown }> {
  select: (columns?: string) => EscalationSelectBuilder;
  gte: (column: string, value: unknown) => EscalationSelectBuilder;
  lte: (column: string, value: unknown) => EscalationSelectBuilder;
}

interface EscalationTable {
  select: (columns?: string) => EscalationSelectBuilder;
  upsert: (
    values: unknown,
    options?: unknown,
  ) => {
    select: () => {
      single: () => Promise<{ data: EscalationChainEntry; error: unknown }>;
    };
  };
}

const escalationDb = supabase as unknown as {
  from: (table: string) => EscalationTable;
};

export function useEscalationChains(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["escalation-chains", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await escalationDb
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
      const { data, error } = await escalationDb
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
