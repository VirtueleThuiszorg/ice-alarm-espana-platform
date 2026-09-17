import { useMemberDisplaySettings } from "@/hooks/useMemberDisplaySettings";

/**
 * HOW LONG A PENDANT TEST STAYS CURRENT FOR — one field of the member-display settings read.
 *
 * Kept as its own named hook rather than left as a field access at the call site, because
 * `usePendantTestReminderDays()` says what the number is for and `settings.pendantTestReminderDays`
 * on a line of JSX does not. The read itself, the shared query and the reason both settings come
 * back together are in `useMemberDisplaySettings`.
 *
 * A FAILED READ IS 90, NOT "NEVER STALE" — the direction matters more than the number. The
 * alert-history flag in the same read falls back to OFF because showing a member less is the safe
 * side there; here the equivalent of "off" would be telling somebody whose last test was fourteen
 * months ago that their pendant is current, which is the sentence this feature exists to stop.
 */
export function usePendantTestReminderDays(): number {
  return useMemberDisplaySettings().pendantTestReminderDays;
}
