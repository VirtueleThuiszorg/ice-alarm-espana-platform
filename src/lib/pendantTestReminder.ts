/**
 * WHEN A PENDANT TEST STOPS COUNTING — one threshold, one boundary, one default.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 *
 * `member_monitoring_readiness.device_tested_at` was already read on the member dashboard and
 * already handed to the protection checklist, which used it like this:
 *
 *     const tested = input.readiness?.device_tested_at != null;
 *
 * A NULL CHECK. The date itself was thrown away and shown nowhere in the member portal. So a
 * member who tested their pendant on the day it arrived fourteen months ago reads *"Your pendant
 * is tested and checking in"* — true, in the sense that the device is online — and has no way to
 * find out that the last time anybody pressed the button was fourteen months ago. Our own
 * knowledge base tells members to test monthly.
 *
 * ── THE THRESHOLD IS A ROW, NOT A CONSTANT ──────────────────────────────────
 *
 * `system_settings.pendant_test_reminder_days`, default 90 (20260917120000). The KB says monthly;
 * a monthly nag on a rung that otherwise reads "all well" is a lot of noise for a reader this
 * product is trying not to alarm, so 90 is the starting point and the ROW is what lets it become
 * 30 without a deploy.
 *
 * EVERY WAY OF FAILING TO READ IT FALLS BACK TO 90, and never to "never stale". An unreadable
 * setting must not silently switch a member-facing prompt off: "we could not read the threshold"
 * is not a reason to tell somebody their fourteen-month-old test is current.
 *
 * ── AND IT IS NOT A FAULT ───────────────────────────────────────────────────
 *
 * Nothing in here produces `action_needed`. An overdue test is not a broken alarm: the pendant is
 * online, the membership is active, an operator is watching. `protectionChecklist.ts` keeps the
 * rung at `ok` and changes only the sentence and the button, for the same reason a pendant in
 * transit is not `action_needed` — a member who is told their alarm needs attention when it does
 * not is a member who learns to ignore the one time it does.
 */

/** The `system_settings.key`. No `settings_` prefix: `pendant_` is its namespace. */
export const PENDANT_TEST_REMINDER_KEY = "pendant_test_reminder_days";

/** What the row is seeded with, and what every failure to read it falls back to. */
export const DEFAULT_PENDANT_TEST_REMINDER_DAYS = 90;

/**
 * A stored string, or anything else, reduced to a number of days we can act on.
 *
 * Rejected — and therefore 90 — are: absent, blank, not a number, not an INTEGER (a threshold of
 * 89.5 days is a typo, not an intention), zero and negative (which would mark every test stale
 * the moment it was made), and anything absurd enough to be a paste error. The upper bound is
 * 3650 days: ten years is already far past the point where the prompt means anything, and it is
 * there to catch a millisecond value pasted into a days field rather than to express a policy.
 */
export function parsePendantTestReminderDays(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") {
    return DEFAULT_PENDANT_TEST_REMINDER_DAYS;
  }
  const days = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(days) || days <= 0 || days > 3650) {
    return DEFAULT_PENDANT_TEST_REMINDER_DAYS;
  }
  return days;
}

/**
 * How many whole days ago the test was, or `null` when there is no readable date.
 *
 * `null` for an absent OR unparseable timestamp, and the two callers both treat that as "no test
 * on record" rather than as an old one — see `pendantTestIsStale`.
 */
export function daysSincePendantTest(
  testedAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (!testedAt) return null;
  const testedMs = Date.parse(testedAt);
  if (Number.isNaN(testedMs)) return null;
  return Math.floor((nowMs - testedMs) / 86_400_000);
}

/**
 * Is this test old enough to suggest another?
 *
 * THE BOUNDARY, STATED: stale at EXACTLY the threshold. At 89 days a 90-day threshold says
 * nothing; at 90 days it prompts. The setting is the INTERVAL BETWEEN TESTS, so once a whole
 * interval has passed the next one is due — which is also how the sentence reads to a member
 * ("it has been 90 days" is the moment you would say it, not the day after).
 *
 * Note this is deliberately the opposite convention to `_shared/presence.ts`, where a heartbeat
 * is still FRESH at exactly `HEARTBEAT_STALE_SECONDS`. That threshold is a TOLERANCE for
 * lateness — how long we wait before disbelieving a signal — and the generous edge belongs on the
 * side that avoids calling a present operator absent. This one is a schedule, and the generous
 * edge belongs on the side that gets the pendant tested.
 *
 * NO DATE IS NOT A STALE DATE. A member who has never tested is not "overdue"; they are at an
 * earlier point in the same story, and the checklist has had its own sentences for that since it
 * was written (`awaitingTest` / `notSent`). Returning false here is what keeps those reachable.
 */
export function pendantTestIsStale(
  testedAt: string | null | undefined,
  thresholdDays: number,
  nowMs: number,
): boolean {
  const age = daysSincePendantTest(testedAt, nowMs);
  if (age === null) return false;
  return age >= thresholdDays;
}
