// @vitest-environment node
//
// SOS ESCALATION — end-to-end (RED by design).
//
// Encodes the ladder in docs/SOS_ESCALATION_SPEC.md: a pendant SOS with NO operator
// acknowledgement must escalate through each tier and reach a human on schedule.
//
// ─── What binds this test to reality (STEP 2A red → STEP 2B green) ─────────────
// The escalation LOGIC lives in supabase/functions/sos-escalation-runner/index.ts and is
// correct. STEP 2A proved it never ran: there was no `cron.schedule(...)` for it, so every
// tier assertion failed (the intended red). STEP 2B wired it — see
// supabase/migrations/20260716120000_sos_escalation_cron.sql.
//
// This test does NOT hard-code the outcome. It DISCOVERS the pg_cron wake from the real
// migration SQL at runtime (`discoverEscalationSchedule`) and only sweeps the runner if a
// wake exists AND the effective cadence is sub-minute — exactly as production behaves. The
// cadence it reasons about (ESCALATION_TICK_MS) is imported from the same shared module the
// runner uses, so it cannot drift from production. Remove the wake, or coarsen the cadence,
// and this test goes red again. Do NOT edit this test to force a pass — its green is only
// valid because escalation genuinely fires at the spec cadence.
//
// Runner unavailable to import directly: it targets Deno (`Deno.serve`, `Deno.env`,
// `npm:@supabase/supabase-js`) and cannot load under vitest/node. Per CLAUDE.md this loop
// changes no function code, so we cannot refactor it to be importable. Instead the tick
// function below MIRRORS the runner's stepping algorithm (index.ts:94-323) against an
// in-memory store, and is bound to reality through the discovered schedule. The binding
// assertion — "a pg_cron job actually invokes the runner" — is the one that cannot be faked.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
// The runner's REAL sweep cadence lives in this shared module and is imported by the runner
// itself — so the number the test reasons about is the number production uses (not a copy).
import {
  ESCALATION_TICK_MS,
  ESCALATION_MAX_RUNTIME_MS,
} from "../../supabase/functions/_shared/escalation-loop";

// ─── Ladder constants — mirrored from sos-escalation-runner/index.ts:24-40 ─────
const NORMAL_TIMINGS: Record<number, number> = { 1: 15_000, 2: 30_000, 3: 60_000, 4: 90_000, 5: 120_000 };
// (UNRESPONSIVE ladder 15/30/45/60/90s is a separate case — see SPEC §(c) item 4;
//  a raw pendant SOS uses the NORMAL ladder because ev07b-sos-alert never sets is_unresponsive.)

const TARGET_BY_LEVEL: Record<number, string> = {
  1: "browser_alert",
  2: "mobile_call",           // on-shift staff
  3: "mobile_call",           // supervisor
  4: "mobile_call",           // admin
  5: "emergency_contact_call", // emergency contacts
};

// A callout "reaches a human" when it dials a real phone. Level 1 is a browser toast, not a person.
const HUMAN_LEVELS = [2, 3, 4, 5] as const;

// ─── In-memory world (stands in for the Postgres tables the runner reads/writes) ──
interface AlertRow {
  id: string;
  alert_type: string;
  member_id: string;
  received_at: number; // ms epoch (fake clock)
  is_unresponsive: boolean;
  status: string;
  escalation_level_reached: number;
}
interface EscalationRow {
  alert_id: string;
  escalation_level: number;
  target_type: string;
  target_phone: string | null;
  responded: boolean;
}
interface World {
  alerts: AlertRow[];
  escalations: EscalationRow[];
  // Seeded humans, so that when a tier fires it CAN reach someone (isolates the schedule gap).
  onShiftStaffMobile: string | null;
  supervisorMobile: string | null;
  adminMobile: string | null;
  emergencyContactPhone: string | null;
}

// Phone the runner would dial for a given level, from seeded staffing.
function phoneForLevel(world: World, level: number): string | null {
  switch (level) {
    case 2: return world.onShiftStaffMobile;
    case 3: return world.supervisorMobile;
    case 4: return world.adminMobile;
    case 5: return world.emergencyContactPhone;
    default: return null; // level 1 = browser alert
  }
}

// One runner invocation. MIRRORS sos-escalation-runner/index.ts:94-323 stepping:
//   - scans incoming sos_button/fall_detected alerts
//   - picks the HIGHEST level whose timeout elapsed and is > escalation_level_reached
//   - de-dupes per level; stops the alert if a level was responded
//   - records an alert_escalations row and advances escalation_level_reached
function runnerTick(world: World, nowMs: number): void {
  const incoming = world.alerts.filter(
    (a) => a.status === "incoming" && ["sos_button", "fall_detected"].includes(a.alert_type),
  );
  for (const alert of incoming) {
    const elapsed = nowMs - alert.received_at;
    const timings = alert.is_unresponsive
      ? ({ 1: 15_000, 2: 30_000, 3: 45_000, 4: 60_000, 5: 90_000 } as Record<number, number>)
      : NORMAL_TIMINGS;
    const currentLevel = alert.escalation_level_reached || 0;

    let nextLevel = 0;
    for (let level = currentLevel + 1; level <= 5; level++) {
      if (elapsed >= timings[level]) nextLevel = level;
    }
    if (nextLevel === 0 || nextLevel <= currentLevel) continue;

    const existing = world.escalations.find(
      (e) => e.alert_id === alert.id && e.escalation_level === nextLevel,
    );
    if (existing) {
      if (existing.responded) break;
      continue;
    }

    world.escalations.push({
      alert_id: alert.id,
      escalation_level: nextLevel,
      target_type: TARGET_BY_LEVEL[nextLevel],
      target_phone: phoneForLevel(world, nextLevel),
      responded: false,
    });
    alert.escalation_level_reached = nextLevel;
  }
}

// ─── Discover the REAL schedule from migrations (the un-fakeable binding) ───────
interface DiscoveredSchedule {
  scheduled: boolean;
  cronExpr: string | null;
  intervalMs: number | null;
}

// Parse a pg_cron expression into a tick interval. Supports the interval-string form
// (`'10 seconds'`, `'2 minutes'`) and classic 5/6-field `*/n` expressions. Returns null
// if the cadence can't be determined (documented under-specification, SPEC §(c) item 1).
function cronExprToMs(expr: string): number | null {
  const s = expr.trim().toLowerCase();
  const iv = s.match(/^(\d+)\s*(second|minute|hour)s?$/);
  if (iv) {
    const n = Number(iv[1]);
    const unit = { second: 1_000, minute: 60_000, hour: 3_600_000 }[iv[2] as "second" | "minute" | "hour"];
    return n * unit;
  }
  const fields = s.split(/\s+/);
  // 6-field form puts seconds first: `* * * * * *` (every 1s) or `*/10 * * * * *`.
  if (fields.length === 6) {
    if (fields[0] === "*") return 1_000;
    const sec = fields[0].match(/^\*\/(\d+)$/);
    if (sec) return Number(sec[1]) * 1_000;
  }
  // 5-field form, minute granularity: `* * * * *` (every 60s) or `*/2 * * * *`.
  if (fields.length === 5) {
    if (fields[0] === "*") return 60_000;
    const min = fields[0].match(/^\*\/(\d+)$/);
    if (min) return Number(min[1]) * 60_000;
  }
  return null;
}

function discoverEscalationSchedule(fnName: string): DiscoveredSchedule {
  const migrationsDir = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  for (const file of files) {
    const sql = readFileSync(`${migrationsDir}/${file}`, "utf8");
    // Locate each cron.schedule(...) block and check whether its body posts to this function.
    // The body is dollar-quoted; the tag may be $$ or a named tag like $CRON$ (the fixed
    // Vault/hardcoded-URL crons use $CRON$ with a nested $inner$ DO block). Capture the
    // opening tag and match its close via backreference; the non-greedy body stops at the
    // matching close (a different inner tag like $inner$ does not terminate it).
    const scheduleRe = /cron\.schedule\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\$[A-Za-z]*\$)([\s\S]*?)\3\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = scheduleRe.exec(sql)) !== null) {
      const [, , cronExpr, , body] = m;
      if (body.includes(`/functions/v1/${fnName}`)) {
        return { scheduled: true, cronExpr, intervalMs: cronExprToMs(cronExpr) };
      }
    }
  }
  return { scheduled: false, cronExpr: null, intervalMs: null };
}

// Build a fresh world with one un-acknowledged pendant SOS at t=0 and humans seeded at every tier.
function freshWorldWithSos(): World {
  return {
    alerts: [
      {
        id: "alert-under-test",
        alert_type: "sos_button",
        member_id: "member-1",
        received_at: 0,
        is_unresponsive: false,
        status: "incoming", // NEVER acknowledged: no operator accept/resolve during the run
        escalation_level_reached: 0,
      },
    ],
    escalations: [],
    onShiftStaffMobile: "+34600000002",
    supervisorMobile: "+34600000003",
    adminMobile: "+34600000004",
    emergencyContactPhone: "+34600000005",
  };
}

// Drive the fake clock from the SOS to `untilMs`. In production a per-minute pg_cron WAKE
// (re)starts the runner, which sweeps at its internal ESCALATION_TICK_MS cadence. So the runner
// sweeps at `effectiveCadenceMs` ONLY while a wake exists. No wake ⇒ zero sweeps ⇒ RED. A cadence
// coarser than the ladder ⇒ tiers missed ⇒ RED. Both failure modes are exactly what we want to catch.
function simulateUnacknowledgedSos(
  wakeScheduled: boolean,
  effectiveCadenceMs: number,
  untilMs: number,
): World {
  const world = freshWorldWithSos();
  // Guard mirrors reality: the sweep loop runs only if a wake fires it AND the cadence is tight
  // enough to be a real safety net. Either failing means escalation does not genuinely fire.
  if (!wakeScheduled || effectiveCadenceMs > 15_000) return world;
  for (let t = effectiveCadenceMs; t <= untilMs; t += effectiveCadenceMs) {
    runnerTick(world, t);
  }
  return world;
}

function reachedHuman(world: World, level: number): boolean {
  const row = world.escalations.find((e) => e.escalation_level === level);
  if (!row) return false;
  if (level === 1) return row.target_type === "browser_alert"; // browser, not a person
  return row.target_type === TARGET_BY_LEVEL[level] && !!row.target_phone; // a phone was dialled
}

// ═══════════════════════════════════════════════════════════════════════════════
describe("SOS escalation E2E — pendant SOS, no operator acknowledgement", () => {
  const wake = discoverEscalationSchedule("sos-escalation-runner");
  const effectiveCadenceMs = ESCALATION_TICK_MS; // the runner's real sweep cadence (escalation-loop.ts)
  const RUN_UNTIL_MS = 130_000; // past level 5 (120s), per NORMAL ladder

  // The binding, un-fakeable assertion: a pg_cron job must actually invoke the runner.
  it("a pg_cron wake actually invokes the escalation runner (→ net.http_post)", () => {
    expect(
      wake.scheduled,
      "sos-escalation-runner has NO cron schedule in supabase/migrations — the auto-escalation " +
        "safety net never fires (SOS_ESCALATION_SPEC.md §b).",
    ).toBe(true);
  });

  it("the wake arrives before the internal loop's coverage lapses (no blackout window)", () => {
    // The runner self-loops for ESCALATION_MAX_RUNTIME_MS then stops; the next per-minute wake must
    // arrive within one tick of that, or there is an uncovered gap every cycle. (SPEC §c item 1.)
    expect(wake.intervalMs, "no wake ⇒ no cadence to check").not.toBeNull();
    expect(wake.intervalMs!).toBeLessThanOrEqual(ESCALATION_MAX_RUNTIME_MS + ESCALATION_TICK_MS);
  });

  it("the effective sweep cadence is sub-minute — meets the 30s first callout (SPEC §c item 1)", () => {
    // A minute-granular cadence would miss the 15/30/45/60s rungs and risk tier-skipping (SPEC §c item 2).
    expect(effectiveCadenceMs).toBeLessThanOrEqual(15_000);
  });

  it("level 2 (30s) calls on-shift staff — a human is dialled", () => {
    const world = simulateUnacknowledgedSos(wake.scheduled, effectiveCadenceMs, RUN_UNTIL_MS);
    expect(reachedHuman(world, 2)).toBe(true);
  });

  it("level 3 (60s) calls the supervisor — a human is dialled", () => {
    const world = simulateUnacknowledgedSos(wake.scheduled, effectiveCadenceMs, RUN_UNTIL_MS);
    expect(reachedHuman(world, 3)).toBe(true);
  });

  it("level 4 (90s) calls an admin — a human is dialled", () => {
    const world = simulateUnacknowledgedSos(wake.scheduled, effectiveCadenceMs, RUN_UNTIL_MS);
    expect(reachedHuman(world, 4)).toBe(true);
  });

  it("level 5 (120s) calls emergency contacts — a human is dialled", () => {
    const world = simulateUnacknowledgedSos(wake.scheduled, effectiveCadenceMs, RUN_UNTIL_MS);
    expect(reachedHuman(world, 5)).toBe(true);
  });

  it("every human tier (2→5) is reached in order, none skipped", () => {
    const world = simulateUnacknowledgedSos(wake.scheduled, effectiveCadenceMs, RUN_UNTIL_MS);
    for (const level of HUMAN_LEVELS) {
      expect(reachedHuman(world, level), `tier ${level} never reached a human`).toBe(true);
    }
  });
});

// ─── staff-shift-monitor: the night-cover SPOF net must also be scheduled ───────
describe("staff-shift-monitor is scheduled (night-cover SPOF safety net)", () => {
  it("has a pg_cron schedule (intended '*/2 * * * *', TECHNICAL_SPEC.md:700)", () => {
    const s = discoverEscalationSchedule("staff-shift-monitor");
    expect(
      s.scheduled,
      "staff-shift-monitor has NO cron schedule — no-show/no-coverage/disconnect alerts never fire.",
    ).toBe(true);
  });
});

// ─── <1s inbound SOS latency (GOALS G1 / plan target) — placeholder ─────────────
// Skipped until a real ingress-latency probe exists. Un-skip and record the measured
// number once ev07b-sos-alert can be timed end-to-end (pendant press → alerts row visible).
describe("SOS inbound latency < 1s (target)", () => {
  // TODO(STEP-2B / SOS latency): replace with a measured assertion. Needs a harness that
  // times pendant press → `alerts` row observable by the operator (Supabase local or a
  // deployed probe). No timing instrumentation exists in the path today (STATE.md §1),
  // so there is nothing truthful to assert yet — a fabricated number would violate GOALS G5.
  it.skip("pendant press → operator-visible alert completes in < 1000ms (measured)", () => {
    const measuredMs = Number.NaN; // not yet measurable
    expect(measuredMs).toBeLessThan(1000);
  });
});
