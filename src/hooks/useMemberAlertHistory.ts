import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MEMBER_ALERT_HISTORY_KEY,
  memberAlertHistoryEnabled,
} from "@/lib/memberDisplaySettings";

/** Shared so the sidebar, the dashboard and the route guard cannot fetch this three times. */
export const MEMBER_ALERT_HISTORY_QUERY_KEY = ["member-alert-history-enabled"] as const;

export interface MemberAlertHistoryState {
  /** OFF until a read says otherwise — including while the read is in flight. */
  enabled: boolean;
  /**
   * Has the read finished?
   *
   * THE REASON THIS IS SEPARATE FROM `enabled`, and it is not symmetry. Hiding something while
   * the answer is unknown is safe: a nav item that appears a beat late is a nav item that
   * appears. REDIRECTING while the answer is unknown is not — a member with the feature ON who
   * follows a link to `/dashboard/alerts` would be bounced to the dashboard before the setting
   * arrived, and the page would be unreachable by link for as long as the read took.
   *
   * So the two consumers use different fields, and the difference is deliberate: display reads
   * `enabled`, the guard waits for `settled`. It is the same rule `MEMBER_UX_RULES` R3 states
   * for the readiness notice — *"never while loading"* — applied to the other direction.
   */
  settled: boolean;
}

/**
 * IS THE MEMBER'S ALERT HISTORY SHOWN AT ALL?
 *
 * One read, shared by every consumer through react-query's cache. A member is `authenticated`
 * with no staff row, so this only returns anything because 20260910140000 put the key in the
 * public whitelist — without that the value would be permanently indistinguishable from "off"
 * and the admin switch would appear to do nothing.
 *
 * A FAILED READ IS "OFF", NOT AN ERROR ON SCREEN. There is nothing a member can do about it and
 * nothing dangerous about the outcome: they see one fewer nav item. `retry: false` because a
 * whitelist miss is not transient and retrying it three times just delays the render.
 */
export function useMemberAlertHistory(): MemberAlertHistoryState {
  const { data, isSuccess, isError } = useQuery({
    queryKey: MEMBER_ALERT_HISTORY_QUERY_KEY,
    retry: false,
    // It changes when an admin flips a switch, which is rare, and every member surface reads it.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data: row, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", MEMBER_ALERT_HISTORY_KEY)
        .maybeSingle();
      if (error) throw error;
      return memberAlertHistoryEnabled(row?.value);
    },
  });

  return {
    enabled: data === true,
    // An ERROR settles it too: "we asked and could not find out" is an answer the guard has to
    // be able to act on, or a whitelist regression would leave /dashboard/alerts spinning
    // forever instead of redirecting.
    settled: isSuccess || isError,
  };
}
