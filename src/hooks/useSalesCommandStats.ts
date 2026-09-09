import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Today's paid sales, straight from `get_sales_command_stats`.
 *
 * Extracted from SalesCommandStrip when that strip became a header pill (Lee's dashboard
 * correction, 9 Sep). One hook rather than the query inlined in each component: the pill and
 * the strip would otherwise hold two copies of the same RPC call and the same zero-defaults,
 * and the pair would drift the first time a field was added.
 */
export interface SalesCommandStats {
  paid_sales_today: number;
  paid_amount_today: number;
  paid_sales_60min: number;
  paid_amount_60min: number;
  new_subscriptions: number;
  partner_signups: number;
  ai_hot_items: number;
  followups_pending: number;
}

/**
 * Zeroes, not nulls. Every field is a count or a total, so zero is the honest reading of "the
 * RPC returned nothing" — and `€0 · 0 orders` on a quiet morning is a true statement, where a
 * dash would make the reader wonder whether it was broken.
 */
export const EMPTY_SALES_STATS: SalesCommandStats = {
  paid_sales_today: 0,
  paid_amount_today: 0,
  paid_sales_60min: 0,
  paid_amount_60min: 0,
  new_subscriptions: 0,
  partner_signups: 0,
  ai_hot_items: 0,
  followups_pending: 0,
};

export function useSalesCommandStats() {
  return useQuery({
    queryKey: ["sales-command-stats"],
    queryFn: async (): Promise<SalesCommandStats> => {
      const { data, error } = await supabase.rpc("get_sales_command_stats");
      if (error) throw error;
      return (data as unknown as SalesCommandStats) ?? EMPTY_SALES_STATS;
    },
    staleTime: 60_000,
  });
}
