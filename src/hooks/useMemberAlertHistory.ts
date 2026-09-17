import {
  MEMBER_DISPLAY_SETTINGS_QUERY_KEY,
  useMemberDisplaySettings,
} from "@/hooks/useMemberDisplaySettings";

/**
 * Shared so the sidebar, the dashboard and the route guard cannot fetch this three times.
 *
 * It is the member-display settings key, and the name is kept because that is what the admin
 * switch imports to invalidate after a save — one setting in that block changing is a reason to
 * re-read the block.
 */
export const MEMBER_ALERT_HISTORY_QUERY_KEY = MEMBER_DISPLAY_SETTINGS_QUERY_KEY;

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
 * A member's alert history is a list of the times their alarm went off. For most members most of
 * the time it is empty, and the empty state is the good outcome — but for the members it is NOT
 * empty for, it is a list of their own worst days on the screen they open to check their alarm
 * still works. Whether to show it is a product decision, so it is a setting rather than a
 * deletion, and it governs member DISPLAY only: alerts are still created, still escalate, and
 * every staff view is unaffected.
 *
 * THE READ MOVED, THE ANSWER DID NOT. It used to be this file's own `.eq("key", …)` query. It is
 * now one field of `useMemberDisplaySettings`, which fetches this flag and the pendant-test
 * threshold in a single `.in(…)` — because the performance gate counts distinct query shapes per
 * table and three against `system_settings` on the member dashboard reads as a per-row query.
 * Every consumer of this hook is unchanged, including the failed-read behaviour: OFF, not an
 * error on screen, because there is nothing a member can do about it and nothing dangerous about
 * seeing one fewer nav item.
 */
export function useMemberAlertHistory(): MemberAlertHistoryState {
  const { alertHistoryEnabled, settled } = useMemberDisplaySettings();
  return { enabled: alertHistoryEnabled, settled };
}
