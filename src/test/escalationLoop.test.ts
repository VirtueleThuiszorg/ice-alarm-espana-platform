// @vitest-environment node
//
// HAZARD 1 — proves the escalation runner delivers a SUB-MINUTE cadence (SOS_ESCALATION_SPEC.md §c
// item 1). pg_cron wakes the runner once a minute; the runner then drives runEscalationLoop, which
// sweeps every `tickMs` for just under a minute. These tests MEASURE that the loop honours its
// configured cadence (real timers) and pin the production constant below the tightest ladder rung.

import { describe, it, expect } from "vitest";
import {
  runEscalationLoop,
  ESCALATION_TICK_MS,
  ESCALATION_MAX_RUNTIME_MS,
} from "../../supabase/functions/_shared/escalation-loop";

describe("escalation cadence — configured to meet the ladder", () => {
  it("production tick is sub-minute and ≤ the tightest rung (unresponsive L1 = 15s)", () => {
    expect(ESCALATION_TICK_MS).toBeGreaterThan(0);
    expect(ESCALATION_TICK_MS).toBeLessThanOrEqual(15_000);
    // Comfortably below the normal first callout (30s) so L2 cannot be missed.
    expect(ESCALATION_TICK_MS).toBeLessThanOrEqual(30_000);
  });

  it("finishes within a minute so it never overlaps the next pg_cron wake", () => {
    expect(ESCALATION_MAX_RUNTIME_MS).toBeLessThan(60_000);
  });
});

describe("runEscalationLoop — deterministic cadence (fake clock)", () => {
  it("sweeps once per tick at exact spacing, passing an advancing clock", async () => {
    let clock = 0;
    const seenAt: number[] = [];
    const result = await runEscalationLoop({
      now: () => clock,
      sleep: (ms) => {
        clock += ms; // fake time only advances when the loop sleeps
        return Promise.resolve();
      },
      sweep: (nowMs) => {
        seenAt.push(nowMs);
      },
      tickMs: 10_000,
      maxRuntimeMs: 55_000,
    });

    // Sweeps fire at 0,10,20,30,40,50s; after 50s another tick (→60s) exceeds 55s budget → stop.
    expect(seenAt).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000]);
    expect(result.sweeps).toBe(6);
    expect(result.errors).toBe(0);
    expect(result.cadenceMs).toBe(10_000);
  });

  it("continues after a sweep throws (one bad sweep must not kill the safety net)", async () => {
    let clock = 0;
    const errorsSeen: number[] = [];
    let call = 0;
    const result = await runEscalationLoop({
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      sweep: () => {
        call++;
        if (call === 2) throw new Error("boom");
      },
      onError: (_err, sweepIndex) => {
        errorsSeen.push(sweepIndex);
      },
      tickMs: 10_000,
      maxRuntimeMs: 55_000,
    });

    expect(result.errors).toBe(1);
    expect(errorsSeen).toEqual([2]); // the 2nd sweep failed, loop kept going
    expect(result.sweeps).toBe(5); // 6 iterations, 1 failed → 5 successful
  });
});

describe("runEscalationLoop — MEASURED cadence (real timers)", () => {
  // Robust to CI timer starvation: under load, timers fire LATE (gaps grow), never early. The
  // safety-relevant, non-flaky property is the LOWER bound — the loop must not hammer sweeps faster
  // than its tick — plus proof that real sleeps actually occur. Count-in-a-window is deliberately
  // not asserted here (it is proven deterministically by the fake-clock test above).
  it("waits ~tickMs of real wall-clock time between sweeps (never faster)", async () => {
    const tickMs = 20; // scaled down so the measurement runs fast; the ratio is what matters
    const stamps: number[] = [];
    const start = Date.now();
    const result = await runEscalationLoop({
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      sweep: () => {
        stamps.push(Date.now() - start);
      },
      tickMs,
      maxRuntimeMs: 240,
    });

    expect(result.cadenceMs).toBe(tickMs);
    expect(result.sweeps).toBeGreaterThanOrEqual(1);

    // Every observed inter-sweep gap must be at least ~tickMs (allow small scheduling slack).
    // A broken/instant sleep would produce near-zero gaps and fail here; slowness only grows gaps.
    const gaps: number[] = [];
    for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(tickMs * 0.5);
    }
  });
});
