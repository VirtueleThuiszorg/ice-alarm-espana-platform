/**
 * escalation-loop.ts — sub-minute cadence driver for the SOS escalation runner.
 *
 * HAZARD 1 fix (SOS_ESCALATION_SPEC.md §c item 1). The ladder fires at 15/30/45/60/90s, but a
 * classic 5-field pg_cron entry runs at most once per minute — too coarse for those rungs, and
 * coarse invocation also risks tier-skipping (SPEC §c item 2). We do NOT rely on pg_cron
 * sub-minute support (not guaranteed across plans). Instead a per-minute pg_cron wake invokes the
 * runner, which then drives THIS loop: it sweeps, waits `tickMs`, and repeats until just under a
 * minute has passed — giving an effective ~`tickMs` cadence. The next wake restarts the loop, so a
 * crashed invocation self-heals within one minute.
 *
 * Pure module (no Deno/Node APIs): `sweep`, `sleep`, and `now` are injected. The runner passes real
 * implementations; tests pass fakes or real timers to MEASURE the delivered cadence
 * (see src/test/escalationLoop.test.ts).
 */

/** Effective escalation cadence. Must be ≤ the tightest ladder rung (unresponsive L1 = 15s). */
export const ESCALATION_TICK_MS = 10_000;

/**
 * Upper bound on one invocation's runtime. Kept < 60s so the loop finishes before the next
 * per-minute pg_cron wake arrives (no overlap), and so a long-running edge invocation stays well
 * inside platform wall-clock limits.
 */
export const ESCALATION_MAX_RUNTIME_MS = 55_000;

export interface EscalationLoopDeps {
  /** Run one escalation sweep for the given instant (ms since epoch). */
  sweep: (nowMs: number) => Promise<void> | void;
  /** Resolve after `ms` milliseconds. */
  sleep: (ms: number) => Promise<void>;
  /** Current instant (ms since epoch). */
  now: () => number;
  /** Cadence between sweeps. Defaults to ESCALATION_TICK_MS. */
  tickMs?: number;
  /** Stop starting new sweeps once this much wall-clock has elapsed. Defaults to ESCALATION_MAX_RUNTIME_MS. */
  maxRuntimeMs?: number;
  /** Called when a sweep throws. The loop CONTINUES — one bad sweep must not kill the safety net. */
  onError?: (err: unknown, sweepIndex: number) => Promise<void> | void;
  /** Structured log sink for per-sweep telemetry. */
  log?: (entry: Record<string, unknown>) => void;
}

export interface EscalationLoopResult {
  sweeps: number;
  errors: number;
  cadenceMs: number;
  elapsedMs: number;
}

/**
 * Drive escalation sweeps at `tickMs` cadence for up to `maxRuntimeMs`. Returns a summary so the
 * caller can log the achieved cadence. Never throws for a sweep error — it routes to `onError` and
 * keeps going; only a broken `sleep`/`now` (programmer error) would propagate.
 */
export async function runEscalationLoop(deps: EscalationLoopDeps): Promise<EscalationLoopResult> {
  const tickMs = deps.tickMs ?? ESCALATION_TICK_MS;
  const maxRuntimeMs = deps.maxRuntimeMs ?? ESCALATION_MAX_RUNTIME_MS;
  const start = deps.now();

  let sweeps = 0;
  let errors = 0;

  for (;;) {
    const iterStart = deps.now();
    try {
      await deps.sweep(iterStart);
      sweeps++;
      deps.log?.({ event: "escalation_sweep_ok", sweepIndex: sweeps, atMs: iterStart - start });
    } catch (err) {
      errors++;
      deps.log?.({
        event: "escalation_sweep_error",
        sweepIndex: sweeps + 1,
        atMs: iterStart - start,
        error: err instanceof Error ? err.message : String(err),
      });
      if (deps.onError) await deps.onError(err, sweeps + 1);
    }

    // Stop if another full tick would push us past the runtime budget.
    if (deps.now() - start + tickMs > maxRuntimeMs) break;
    await deps.sleep(tickMs);
  }

  return { sweeps, errors, cadenceMs: tickMs, elapsedMs: deps.now() - start };
}
