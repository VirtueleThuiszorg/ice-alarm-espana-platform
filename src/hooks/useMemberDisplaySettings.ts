import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MEMBER_ALERT_HISTORY_KEY,
  memberAlertHistoryEnabled,
} from "@/lib/memberDisplaySettings";
import {
  DEFAULT_PENDANT_TEST_REMINDER_DAYS,
  PENDANT_TEST_REMINDER_KEY,
  parsePendantTestReminderDays,
} from "@/lib/pendantTestReminder";

/**
 * THE MEMBER-DISPLAY SETTINGS, IN ONE READ.
 *
 * ── WHY ONE READ AND NOT TWO ────────────────────────────────────────────────
 *
 * The pendant-test threshold started life as its own `.eq("key", …)` query, and the performance
 * gate caught it within the hour: `e2e/perf/budgets.spec.ts` counts DISTINCT query shapes per
 * table and treats three against one table as a read-once-per-row smell. The member dashboard
 * already issued two against `system_settings` — the company block's `.in(…)` and the
 * alert-history flag's `.eq(…)` — so a third made three, on the page these members open most.
 *
 * The gate was right, and the fix is not a bigger budget. These are two settings of the same
 * KIND: neither is about a member, both say what a member is shown, and both are read by the
 * portal on load. One `.in(…)` answers both, react-query serves every consumer from one cache
 * entry, and the dashboard makes exactly as many settings round trips as it did before this
 * feature existed.
 *
 * ── WHAT EACH ONE DOES WHEN IT CANNOT BE READ, AND WHY THEY DIFFER ──────────
 *
 * `member_alert_history_enabled` falls back to OFF. A member is shown one fewer thing, and the
 * bad direction — showing somebody a list of their own worst days because a read failed — is the
 * one to avoid.
 *
 * `pendant_test_reminder_days` falls back to 90, never to "never stale". The equivalent of "off"
 * here would be telling a member whose last test was fourteen months ago that their pendant is
 * current, which is the sentence the feature exists to stop.
 *
 * Same read, opposite safe directions. That is a property of the settings, not of the query, so
 * each parser owns its own default and this hook only holds them together.
 *
 * ── AND WHY THE KEYS ARE PUBLIC-WHITELISTED ─────────────────────────────────
 *
 * A member is `authenticated` with no staff row, so a key outside the whitelist reads back as
 * nothing and is indistinguishable from absent — the setting appears to work while being
 * permanently stuck at its default. Both keys are on the list (20260910190000, 20260917130000)
 * and `scripts/rls/isolation.sql` names the whole list rather than counting it.
 */

/** Shared, so every consumer of either setting resolves to one request. */
export const MEMBER_DISPLAY_SETTINGS_QUERY_KEY = ["member-display-settings"] as const;

export interface MemberDisplaySettings {
  /** OFF until a read says otherwise — including while the read is in flight. */
  alertHistoryEnabled: boolean;
  /** How long a pendant test stays current for. 90 unless a readable row says otherwise. */
  pendantTestReminderDays: number;
  /**
   * Has the read finished, either way?
   *
   * Separate from the values, and the difference is load-bearing: hiding something while the
   * answer is unknown is safe, REDIRECTING while it is unknown is not. Display reads the values,
   * the `/dashboard/alerts` guard waits for this. An ERROR settles it too — "we asked and could
   * not find out" is an answer a guard has to be able to act on, or a whitelist regression
   * leaves the route spinning for ever instead of redirecting.
   */
  settled: boolean;
}

const FALLBACK = {
  alertHistoryEnabled: false,
  pendantTestReminderDays: DEFAULT_PENDANT_TEST_REMINDER_DAYS,
} as const;

export function useMemberDisplaySettings(): MemberDisplaySettings {
  const { data, isSuccess, isError } = useQuery({
    queryKey: MEMBER_DISPLAY_SETTINGS_QUERY_KEY,
    // A whitelist miss is not transient, and retrying it three times only delays the render.
    retry: false,
    // They change when an admin flips a switch, which is rare, and every member surface reads it.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [MEMBER_ALERT_HISTORY_KEY, PENDANT_TEST_REMINDER_KEY]);
      if (error) throw error;
      const byKey = new Map((rows ?? []).map((row) => [row.key, row.value]));
      return {
        alertHistoryEnabled: memberAlertHistoryEnabled(byKey.get(MEMBER_ALERT_HISTORY_KEY)),
        pendantTestReminderDays: parsePendantTestReminderDays(
          byKey.get(PENDANT_TEST_REMINDER_KEY),
        ),
      };
    },
  });

  return { ...(data ?? FALLBACK), settled: isSuccess || isError };
}
