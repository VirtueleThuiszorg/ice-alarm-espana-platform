/**
 * WHAT "SIGNED IN" MEANS — one definition, for the runner that alerts and the strip that displays.
 *
 * ── THE DEFECT THIS EXISTS TO END ───────────────────────────────────────────
 *
 * `staff-shift-monitor` decided a no-show from ONE column:
 *
 *     const onCallIds = new Set((onCallStaff || []).map((s) => s.id));
 *     if (onCallIds.has(scheduled.staff_id)) continue; // They signed in, skip
 *
 * `staff.is_on_call` is set by pressing "On duty". It is not the same question as "is this person
 * here". An operator who worked a whole night shift with the platform open but who never pressed
 * that button was ABSENT as far as this runner was concerned — and the bell filled with alerts
 * saying he had not turned up, while he was at the desk answering the phone.
 *
 * `staff_presence` carries `is_online` and `last_heartbeat_at`, and `useWhoIsOn` — the
 * supervisor's "who is on now" strip — has been reading exactly those to say PRESENT since it was
 * written. The runner and the strip disagreed about the same person at the same moment, on the
 * same data, because each had its own idea of what presence is.
 *
 * ── A CORRECTION TO THIS HEADER, AND IT MATTERED ────────────────────────────
 *
 * The paragraph above used to say that operator was "sending a heartbeat every thirty seconds".
 * THAT WAS NOT TRUE WHEN IT WAS WRITTEN. `useStaffHeartbeat` took an `isOnDuty` argument and
 * returned early unless it was set, so the ping only ran while `is_on_call` was already true.
 *
 * The rule below was therefore correct and inert: its second branch — a fresh heartbeat without
 * the button — could not be satisfied, because a heartbeat could only be fresh when the first
 * branch had already decided. PRESENT-BUT-NOT-ON-DUTY was unreachable in production, and the
 * three states were two wearing a third's name.
 *
 * Travis Nelison's row is the evidence (SHIFT_NOSHOW_FINDINGS.md): `last_heartbeat_at` equal to
 * `session_started_at` to the millisecond and three days stale, while `is_on_call` was false —
 * one ping, when the button was last pressed, and nothing since.
 *
 * The gate is gone as of this change. The sentence is true now.
 *
 * ── THE THREE STATES, WHICH ARE NOT TWO ─────────────────────────────────────
 *
 *   ON DUTY               `is_on_call` — they pressed the button. Alerts route to them.
 *   PRESENT, NOT ON DUTY  a fresh heartbeat and no button. They are HERE, and the alert routing
 *                         does not know it. That is worth a nudge, and it is not a no-show:
 *                         telling a supervisor at three in the morning that nobody turned up,
 *                         when somebody did, is how a real alert stops being believed.
 *   ABSENT                no fresh heartbeat and no button. The real no-show.
 *
 * Collapsing the middle state into either neighbour is a mistake in a different direction each
 * way: into ON DUTY and a genuinely mis-routed shift goes unremarked; into ABSENT and you get the
 * flood this fixes.
 *
 * ── WHY THE CONSTANT LIVES HERE ─────────────────────────────────────────────
 *
 * It was written twice — `HEARTBEAT_STALE_SECONDS` in the runner and again in `useWhoIsOn`, with
 * a comment in the hook explaining that it is "the same 90 seconds" and a test pinning them
 * together by reading the runner's source. Two constants that agree by test are still two
 * constants; the test says they have not drifted yet. `_shared` is importable by BOTH the edge
 * runtime and the vitest suite (`notifyMatrix.ts` already imports across that boundary), so they
 * can be one.
 *
 * Pure module: no Deno, no Node, no network. Every decision below is a function of its arguments,
 * which is what lets the runner's behaviour be tested without a database.
 */

/**
 * How stale a heartbeat may be before presence stops counting.
 *
 * 90 seconds is three missed 30-second heartbeats. It is also the threshold at which the monitor
 * marks a presence row offline and raises a DISCONNECTED alert, so anything longer here would
 * call somebody present after the platform had already announced they had dropped.
 */
export const HEARTBEAT_STALE_SECONDS = 90;

/**
 * How long after the nudge before the supervisor is told.
 *
 * The nudge asks the operator to press "On duty". Fifteen minutes is long enough that somebody
 * who is at the desk will have seen a text and fixed it themselves, and short enough that a shift
 * whose alerts are routed nowhere does not run that way for an hour.
 */
export const NOT_ON_DUTY_ESCALATE_MINUTES = 15;

export type PresenceState = "on_duty" | "present_not_on_duty" | "absent";

export interface PresenceInput {
  /** `staff.is_on_call` — they pressed the button. */
  isOnCall: boolean | null | undefined;
  /** `staff_presence.is_online` — the last thing the heartbeat said. */
  isOnline: boolean | null | undefined;
  /** `staff_presence.last_heartbeat_at`, ISO. */
  lastHeartbeatAt: string | null | undefined;
}

/**
 * Has a browser of theirs pinged recently enough to count?
 *
 * `is_online` ALONE IS NOT ENOUGH, and this is the subtle half. The monitor is what clears that
 * flag, and it runs every two minutes — so between somebody closing their laptop and the next
 * run, `is_online` is still true and means nothing. The timestamp is the observation; the flag is
 * a cache of it. `useWhoIsOn` has always required both, and so does this.
 *
 * An unparseable or missing timestamp is NOT fresh: "I cannot tell when they were last seen" must
 * not read as "just now" on the one screen a supervisor uses to find out who is covering.
 */
export function heartbeatIsFresh(
  lastHeartbeatAt: string | null | undefined,
  nowMs: number,
  staleSeconds: number = HEARTBEAT_STALE_SECONDS,
): boolean {
  if (!lastHeartbeatAt) return false;
  const beatMs = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(beatMs)) return false;
  return beatMs >= nowMs - staleSeconds * 1000;
}

/** Which of the three states this person is in, right now. */
export function presenceState(input: PresenceInput, nowMs: number): PresenceState {
  if (input.isOnCall === true) return "on_duty";
  if (input.isOnline === true && heartbeatIsFresh(input.lastHeartbeatAt, nowMs)) {
    return "present_not_on_duty";
  }
  return "absent";
}

/**
 * The brief's rule in one line: present is on duty OR a live heartbeat.
 *
 * Kept as its own function rather than left as `state !== "absent"` at each call site, because
 * that comparison is the one somebody writes as `state === "on_duty"` by mistake — which is the
 * original defect, restored.
 */
export function isPresent(input: PresenceInput, nowMs: number): boolean {
  return presenceState(input, nowMs) !== "absent";
}
