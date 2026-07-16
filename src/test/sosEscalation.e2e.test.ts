// @vitest-environment node
//
// SOS ESCALATION — end-to-end (RED by design).
//
// Encodes the ladder in docs/SOS_ESCALATION_SPEC.md: a pendant SOS with NO operator
// acknowledgement must escalate through each tier and reach a human on schedule.
//
// ─── Why this test FAILS right now, and why that is the point ──────────────────
// The escalation LOGIC lives in supabase/functions/sos-escalation-runner/index.ts and is
// correct — but nothing invokes it. There is no `cron.schedule(...)` for it anywhere in
// supabase/migrations (only `ev07b-offline-monitor` and `shift-daily-reminders` are
// scheduled). See SOS_ESCALATION_SPEC.md §(b) for the file:line proof.
//
// This test does NOT hard-code "unscheduled". It DISCOVERS the schedule from the real
// migration SQL at runtime (`discoverEscalationSchedule`), and only ticks the runner if a
// schedule exists — exactly as production would. Because none exists today, the runner
// never ticks, no human is ever dialled, and every tier assertion fails. That failure IS
// the proof of the gap. STEP 2B (wiring the cron) will make discovery succeed → the runner
// ticks → the same assertions go green. Do NOT edit this test to force a pass.
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
  // 6-field form puts seconds first: `*/10 * * * * *`
  if (fields.length === 6) {
    const sec = fields[0].match(/^\*\/(\d+)$/);
    if (sec) return Number(sec[1]) * 1_000;
  }
  // 5-field form, minute granularity: `*/2 * * * *`
  if (fields.length === 5) {
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
    const scheduleRe = /cron\.schedule\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,([\s\S]*?)\$\$\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = scheduleRe.exec(sql)) !== null) {
      const [, , cronExpr, body] = m;
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

// Drive the fake clock from the SOS to `untilMs`, invoking the runner ONLY on the discovered
// cadence — i.e. only if a pg_cron job actually calls it. No schedule ⇒ zero ticks ⇒ RED.
function simulateUnacknowledgedSos(schedule: DiscoveredSchedule, untilMs: number): World {
  const world = freshWorldWithSos();
  if (!schedule.scheduled || schedule.intervalMs == null) {
    return world; // runner is never invoked in production, so it is never invoked here
  }
  for (let t = schedule.intervalMs; t <= untilMs; t += schedule.intervalMs) {
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
  const schedule = discoverEscalationSchedule("sos-escalation-runner");
  const RUN_UNTIL_MS = 130_000; // past level 5 (120s), per NORMAL ladder

  // The binding, un-fakeable assertion: production must actually invoke the runner.
  it("the escalation runner is scheduled to fire automatically (pg_cron → net.http_post)", () => {
    expect(
      schedule.scheduled,
      "sos-escalation-runner has NO cron schedule in supabase/migrations — the auto-escalation " +
        "safety net never fires. This is the gap STEP 2B must close (SOS_ESCALATION_SPEC.md §b).",
    ).toBe(true);
  });

  it("the scheduled cadence is tight enough to hit the 30s first-callout (SPEC §c item 1)", () => {
    // A 1-minute+ cadence would miss the 15/30/45/60s rungs and risk tier-skipping (SPEC §c item 2).
    expect(schedule.intervalMs, "no schedule ⇒ no cadence to check").not.toBeNull();
    expect(schedule.intervalMs!).toBeLessThanOrEqual(15_000);
  });

  it("level 2 (30s) calls on-shift staff — a human is dialled", () => {
    const world = simulateUnacknowledgedSos(schedule, RUN_UNTIL_MS);
    expect(reachedHuman(world, 2)).toBe(true);
  });

  it("level 3 (60s) calls the supervisor — a human is dialled", () => {
    const world = simulateUnacknowledgedSos(schedule, RUN_UNTIL_MS);
    expect(reachedHuman(world, 3)).toBe(true);
  });

  it("level 4 (90s) calls an admin — a human is dialled", () => {
    const world = simulateUnacknowledgedSos(schedule, RUN_UNTIL_MS);
    expect(reachedHuman(world, 4)).toBe(true);
  });

  it("level 5 (120s) calls emergency contacts — a human is dialled", () => {
    const world = simulateUnacknowledgedSos(schedule, RUN_UNTIL_MS);
    expect(reachedHuman(world, 5)).toBe(true);
  });

  it("every human tier (2→5) is reached in order, none skipped", () => {
    const world = simulateUnacknowledgedSos(schedule, RUN_UNTIL_MS);
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
