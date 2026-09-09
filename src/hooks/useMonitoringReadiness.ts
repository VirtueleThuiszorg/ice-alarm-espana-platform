import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";

/**
 * HOW MANY PAID MEMBERS ARE NOT YET MONITORED — the one number this business cannot look away
 * from, and the dashboard did not have it.
 *
 * `get_admin_dashboard_stats` counts active members. It does not count READY ones, and the two
 * are not the same thing: a member can be paying, activated by the webhook, and still not
 * monitored because their pendant has not been tested or they have no emergency contact. Money
 * has been taken and nobody is watching — READINESS_MODEL.md §2 is why the view exists.
 *
 * ONE HOOK, BOTH SURFACES. The phone home and the desktop dashboard read this; the readiness
 * queue page keeps its own richer query because it needs the per-member gap, not a count. What
 * must never happen is two places deriving readiness differently — the view is the answer, and
 * re-deriving it from `orders` is how three screens end up with three opinions about whether
 * somebody is monitored.
 *
 * `head: true` with an exact count: this asks Postgres for a number, not for rows.
 */
export interface MonitoringReadiness {
  /** Paid members whose monitoring is not yet ready. */
  waiting: number;
}

export function useMonitoringReadiness() {
  return useQuery({
    queryKey: ["admin-monitoring-readiness-count"],
    queryFn: async (): Promise<MonitoringReadiness> => {
      const { count, error } = await supabase
        .from("member_monitoring_readiness")
        .select("member_id", { count: "exact", head: true })
        .eq("monitoring_ready", false)
        // Paid only. An unpaid enquiry is not "waiting to be monitored", and counting it would
        // make the number meaningless on the day somebody imports a lead list.
        .not("paid_since", "is", null);

      // A failed read must not read as "nobody is waiting" — the one wrong answer here that
      // looks like good news. Thrown, so the caller renders an error rather than a zero.
      if (error) throw error;
      return { waiting: count ?? 0 };
    },
    staleTime: STALE_TIMES.MEDIUM,
  });
}
