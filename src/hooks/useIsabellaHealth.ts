import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { INTERVALS, STALE_TIMES } from "@/config/constants";
import {
  ERROR_WINDOW_MS,
  commonestOf,
  isabellaHealth,
  type IsabellaHealthVerdict,
} from "@/lib/isabellaHealth";

/**
 * Isabella's health, read from what she actually did — `ai_runs`.
 *
 * WHY `ai_runs` AND NOT `conversation_messages` / `ai_events`, which the brief suggests.
 * `ai_events` is the INBOX: a row means something happened that Isabella might act on, written
 * whether or not she ever ran. `conversation_messages` is chat transcript. `ai_runs` is the
 * execution record — `ai-run/index.ts` inserts it as `running`, then updates it to `completed`
 * or to `failed` with the provider's error text (index.ts:1412/1442/1474). It is the only table
 * in the schema that distinguishes "she ran and it worked" from "she ran and it broke", which is
 * the whole question the card exists to answer.
 *
 * RLS, unchanged: `"Staff can view ai_runs" FOR SELECT USING (is_staff(auth.uid()))`
 * (20260123150444). The card reads as the signed-in admin, never with the service role, so no
 * migration and no new policy — golden rule 5 holds by construction.
 */

/** How many failure rows to pull for the mode. The COUNT is exact regardless of this. */
const FAILURE_SAMPLE = 200;

export interface IsabellaHealthData extends IsabellaHealthVerdict {
  /** The window the error count covers, in minutes — the card labels itself from this. */
  windowMinutes: number;
}

export function useIsabellaHealth() {
  return useQuery({
    queryKey: ["isabella-health"],
    queryFn: async (): Promise<IsabellaHealthData> => {
      const since = new Date(Date.now() - ERROR_WINDOW_MS).toISOString();

      // The last run that COMPLETED. Ordered and limited server-side; `maybeSingle` because a
      // brand-new database legitimately has none, and `.single()` would make that an error.
      const { data: lastRun, error: lastError } = await supabase
        .from("ai_runs")
        .select("created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) throw lastError;

      // Failures in the window: an EXACT count from the header, plus up to FAILURE_SAMPLE rows
      // to take the commonest message from. Counting the returned rows instead would silently
      // cap at the page size — and "200 errors" while the true figure is 4000 reads as calm.
      const {
        data: failures,
        count,
        error: failError,
      } = await supabase
        .from("ai_runs")
        .select("error_message", { count: "exact" })
        .eq("status", "failed")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(FAILURE_SAMPLE);
      if (failError) throw failError;

      const verdict = isabellaHealth({
        lastCompletedAt: lastRun?.created_at ?? null,
        errorsLast60Min: count ?? failures?.length ?? 0,
        commonestError: commonestOf((failures ?? []).map((r) => r.error_message)),
      });

      return { ...verdict, windowMinutes: Math.round(ERROR_WINDOW_MS / 60_000) };
    },
    // A card that claims a service is up must not be able to show a five-minute-old claim.
    staleTime: STALE_TIMES.REALTIME,
    refetchInterval: INTERVALS.ISABELLA_HEALTH_REFRESH,
    refetchIntervalInBackground: false,
  });
}
