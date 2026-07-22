/**
 * escalation-outcome.ts — pure decision for what a level's call results mean.
 *
 * Fixes the "silent advance" defect: previously `sos-escalation-runner` set
 * `escalation_level_reached: N` even when every Twilio call at level N failed, so a rung that
 * did NOT reach a human was recorded as reached with only a `console.error`. This module makes the
 * decision explicit and testable (the Deno runner can't be imported under vitest — same pattern as
 * `escalation-loop.ts` / `shift-time.ts`). The runner places the calls, hands the per-target results
 * here, and acts on the returned decision. See src/test/escalationOutcome.test.ts.
 *
 * Behaviour (Lee's call, 2026-07-16): **bounded retry, then advance.** If all targets at a tier
 * fail, the tier is NOT marked reached, so the runner's `nextLevel`-by-elapsed selection retries the
 * same tier on the next sweep — until the next tier's timeout elapses and the ladder advances on its
 * own (the bound for L2–L4). L5 is terminal (no higher tier), so it is bounded here by a retry grace.
 * NONE of the ladder timings/tiers/ack logic changes — this only decides mark-reached vs retry and
 * whether to fire the loud alert.
 */

export interface CallOutcome {
  /** "mobile_call" | "emergency_contact_call" | "browser_alert" */
  targetType: string;
  /** The number dialled (unmasked; masking happens at the alert boundary). */
  phone: string;
  staffId?: string | null;
  /** True iff placeEscalationCall returned a Twilio call SID (non-null == connected). */
  connected: boolean;
}

export interface LevelDecisionInput {
  level: number;
  /** Per-target results for THIS sweep at this level (empty if there were no targets to call). */
  outcomes: CallOutcome[];
  /** Were there already alert_escalations rows at this (alert, level) from a prior sweep? */
  priorAttemptExists: boolean;
  /** ms since the alert's received_at. */
  elapsedMs: number;
  /** The active ladder (normal or unresponsive) — read-only; used only for the L5 bound. */
  timings: Record<number, number>;
  /** How long past L5's timeout to keep retrying the terminal tier before giving up. */
  l5RetryGraceMs: number;
}

export interface LevelDecision {
  /** ≥1 target connected this sweep. */
  connected: boolean;
  /** Advance the ladder (set escalation_level_reached = level)? */
  markReached: boolean;
  /** Fire the LOUD notify-admin `escalation.call_failed` alert? */
  fireCallFailedAlert: boolean;
  /** The same tier will be retried on the next sweep (i.e. not connected and not bounded-out). */
  retrying: boolean;
}

/**
 * Decide what a level's results mean. Pure — no I/O, no time source (elapsedMs is injected).
 */
export function decideLevelOutcome(input: LevelDecisionInput): LevelDecision {
  const attempted = input.outcomes.length > 0;
  const connected = input.outcomes.some((o) => o.connected);

  // Happy path (unchanged behaviour): a human was dialled → advance the ladder.
  if (connected) {
    return { connected: true, markReached: true, fireCallFailedAlert: false, retrying: false };
  }

  // No connection this sweep. Fire the loud alert once — on the FIRST failed attempt at this tier
  // that actually placed calls (avoids a 10s alert storm on retries, and doesn't alert when the tier
  // simply had no targets to dial — that is a staffing gap the shift monitor covers).
  const fireCallFailedAlert = attempted && !input.priorAttemptExists;

  // Bounded retry: L2–L4 are advanced by the caller's nextLevel-by-elapsed once the next tier's
  // timeout passes, so we leave them unmarked to allow retry. L5 is terminal — bound it by a grace.
  let markReached = false;
  if (input.level === 5 && input.elapsedMs >= input.timings[5] + input.l5RetryGraceMs) {
    markReached = true; // give up retrying the terminal tier (loud alert already fired)
  }

  return { connected: false, markReached, fireCallFailedAlert, retrying: !markReached };
}
