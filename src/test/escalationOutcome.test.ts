// @vitest-environment node
//
// Proves the "silent advance" defect is fixed: a FAILED escalation call must fire the loud alert
// AND must NOT report the tier as reached. Tests the pure decision the runner acts on
// (_shared/escalation-outcome.ts) — the Deno runner itself can't be imported under vitest.

import { describe, it, expect } from "vitest";
import { decideLevelOutcome } from "../../supabase/functions/_shared/escalation-outcome";

const NORMAL = { 1: 15_000, 2: 30_000, 3: 60_000, 4: 90_000, 5: 120_000 } as const;
const L5_GRACE = 120_000;

const base = {
  timings: NORMAL as unknown as Record<number, number>,
  l5RetryGraceMs: L5_GRACE,
  elapsedMs: 35_000,
  priorAttemptExists: false,
};

describe("decideLevelOutcome — a failed call is loud, never silently 'reached'", () => {
  it("all calls FAILED at L2 → NOT reached, loud alert fired, will retry", () => {
    const d = decideLevelOutcome({
      ...base,
      level: 2,
      outcomes: [
        { targetType: "mobile_call", phone: "+34600000002", staffId: "s1", connected: false },
      ],
    });
    expect(d.connected).toBe(false);
    expect(d.markReached).toBe(false); // <-- the fix: does NOT silently report success
    expect(d.fireCallFailedAlert).toBe(true); // <-- LOUD, not just logged
    expect(d.retrying).toBe(true);
  });

  it("at least one call CONNECTED → reached, no alert (unchanged happy path)", () => {
    const d = decideLevelOutcome({
      ...base,
      level: 2,
      outcomes: [
        { targetType: "mobile_call", phone: "+34600000002", staffId: "s1", connected: false },
        { targetType: "mobile_call", phone: "+34600000003", staffId: "s2", connected: true },
      ],
    });
    expect(d.connected).toBe(true);
    expect(d.markReached).toBe(true);
    expect(d.fireCallFailedAlert).toBe(false);
    expect(d.retrying).toBe(false);
  });

  it("retry of an already-failed tier does NOT re-fire the alert (no 10s storm)", () => {
    const d = decideLevelOutcome({
      ...base,
      level: 3,
      priorAttemptExists: true,
      outcomes: [{ targetType: "mobile_call", phone: "+34600000009", connected: false }],
    });
    expect(d.fireCallFailedAlert).toBe(false);
    expect(d.markReached).toBe(false);
    expect(d.retrying).toBe(true);
  });

  it("L2–L4 all-failed are left unmarked so nextLevel-by-elapsed advances them (bound)", () => {
    for (const level of [2, 3, 4]) {
      const d = decideLevelOutcome({
        ...base,
        level,
        elapsedMs: 999_000, // even long past, terminal-bound applies ONLY to L5
        outcomes: [{ targetType: "mobile_call", phone: "+34600000000", connected: false }],
      });
      expect(d.markReached).toBe(false);
    }
  });

  it("L5 (terminal) keeps retrying within the grace, then gives up (advance/stop)", () => {
    const within = decideLevelOutcome({
      ...base,
      level: 5,
      elapsedMs: NORMAL[5] + L5_GRACE - 1,
      outcomes: [{ targetType: "emergency_contact_call", phone: "+34600000005", connected: false }],
    });
    expect(within.markReached).toBe(false); // still retrying the terminal tier
    expect(within.retrying).toBe(true);

    const past = decideLevelOutcome({
      ...base,
      level: 5,
      elapsedMs: NORMAL[5] + L5_GRACE,
      outcomes: [{ targetType: "emergency_contact_call", phone: "+34600000005", connected: false }],
    });
    expect(past.markReached).toBe(true); // bounded: stop retrying the terminal tier
    expect(past.retrying).toBe(false);
  });

  it("a tier with NO targets does not fire call_failed (staffing gap, not a failed call)", () => {
    const d = decideLevelOutcome({ ...base, level: 3, outcomes: [] });
    expect(d.fireCallFailedAlert).toBe(false);
    expect(d.connected).toBe(false);
    expect(d.markReached).toBe(false);
  });
});
