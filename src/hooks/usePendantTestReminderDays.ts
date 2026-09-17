import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PENDANT_TEST_REMINDER_DAYS,
  PENDANT_TEST_REMINDER_KEY,
  parsePendantTestReminderDays,
} from "@/lib/pendantTestReminder";

/** Shared, so two rungs on two surfaces cannot fetch the same integer twice. */
export const PENDANT_TEST_REMINDER_QUERY_KEY = ["pendant-test-reminder-days"] as const;

/**
 * HOW LONG A PENDANT TEST STAYS CURRENT FOR — read from `system_settings`, defaulted to 90.
 *
 * Same shape as `useMemberAlertHistory`, for the same reasons and with one difference worth
 * naming.
 *
 * WHY IT IS PUBLIC-WHITELISTED (20260917130000). A member is `authenticated` with no staff row,
 * so a key outside the whitelist reads back as nothing and the value is indistinguishable from
 * absent — which would leave the row inert and the threshold permanently 90 while an admin
 * edited a number that changed nothing. That is the exact silent failure four pricing keys were
 * in until 20260908120000.
 *
 * A FAILED READ IS 90, NOT AN ERROR ON SCREEN, AND NOT "NEVER STALE". This is the difference
 * from the alert-history flag, where an unreadable setting means OFF. There, off is the safe
 * direction — a member is shown one fewer thing. Here the equivalent of "off" would be telling a
 * member whose last test was fourteen months ago that their pendant is tested and current, which
 * is the sentence this whole change exists to stop. So the fallback is the default threshold,
 * never a disabled prompt.
 *
 * `retry: false` for the reason the alert-history hook gives: a whitelist miss is not transient,
 * and retrying it three times only delays the render.
 */
export function usePendantTestReminderDays(): number {
  const { data } = useQuery({
    queryKey: PENDANT_TEST_REMINDER_QUERY_KEY,
    retry: false,
    // It changes when somebody edits a setting, which is rare, and every member surface reads it.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      const { data: row, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", PENDANT_TEST_REMINDER_KEY)
        .maybeSingle();
      if (error) throw error;
      return parsePendantTestReminderDays(row?.value);
    },
  });

  return data ?? DEFAULT_PENDANT_TEST_REMINDER_DAYS;
}
