import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";

export interface BankHoliday {
  holiday_date: string;
  name: string;
  region: string;
}

/**
 * The bank holidays (`festivos`) of one year.
 *
 * On the rota these are not days off — the call centre runs on 25 December like any other day —
 * so an operator needs to see which of their shifts land on one. Whether a festivo inside a
 * holiday range counts against `vacaciones` is a convenio question and is handled as a SETTING
 * elsewhere, not by this hook.
 *
 * `region` distinguishes national from Andalucía/local entries; both are returned and the caller
 * labels them, because a local festivo is exactly the one an operator is likely to be surprised by.
 *
 * `enabled` so a page with this on a tab does not fetch a year of festivos for somebody who
 * opened it to check tomorrow's shift on their phone.
 */
export function useBankHolidays(year: number, enabled = true) {
  return useQuery<BankHoliday[]>({
    enabled,
    queryKey: ["bank-holidays", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_holidays")
        .select("holiday_date, name, region")
        .gte("holiday_date", `${year}-01-01`)
        .lte("holiday_date", `${year}-12-31`)
        .order("holiday_date");
      if (error) throw error;
      return (data || []) as BankHoliday[];
    },
    // Fixed for the year once published; no reason to refetch on focus.
    staleTime: STALE_TIMES.LONG,
  });
}
