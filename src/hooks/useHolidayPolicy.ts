import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import {
  HOLIDAY_POLICY_DEFAULTS,
  HOLIDAY_POLICY_KEYS,
  parseHolidayPolicy,
  type HolidayPolicy,
} from "../../supabase/functions/_shared/holiday-policy";

/** The query key, exported so the card that edits the policy can invalidate exactly this. */
export const HOLIDAY_POLICY_QUERY_KEY = ["holiday-policy"] as const;

/**
 * The holiday rules in force, from `system_settings`.
 *
 * ONE query for the whole policy and one place that parses it, because the screens that need it
 * are not one screen: the approvals list warns on short notice, the per-person table pro-rates a
 * mid-year start, and the card edits both. Three reads of `system_settings` with three ideas of
 * what a missing row means is how a rule ends up applying on one screen and not the next.
 *
 * Returns the DEFAULTS while loading and on error, rather than undefined. A supervisor mid-way
 * through approving a request should see the two-month warning even if the settings read failed —
 * the defaults are the statutory reading, so failing to them is failing safe.
 */
export function useHolidayPolicy() {
  const query = useQuery<HolidayPolicy>({
    queryKey: HOLIDAY_POLICY_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [...HOLIDAY_POLICY_KEYS]);
      if (error) throw error;
      return parseHolidayPolicy(data);
    },
    staleTime: STALE_TIMES.LONG,
  });

  return { ...query, policy: query.data ?? HOLIDAY_POLICY_DEFAULTS };
}
