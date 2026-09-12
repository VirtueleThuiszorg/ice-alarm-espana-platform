/**
 * WHO IS TOLD ABOUT A NO-SHOW, AND WHEN — the rung the brief asked for and the door it goes
 * through.
 *
 * A real no-show used to leave the runner by two bespoke doors: `notify-admin` for the admins and
 * `notify-staff-whatsapp` for the operator's mobile. Neither consults `notification_routes`, so
 * the `shift.no_show` rows that have sat in that table since 20260909121500 decided nothing, and
 * the event could not be switched on or off from Admin → Settings → Notifications like every
 * other event.
 *
 * It is also where the fan-out came from. `notify-admin` dispatches to EVERY admin on EVERY
 * channel — the 2 recipients x 5 channels that turned six alerts into the sixty log rows the bell
 * showed (SHIFT_NOSHOW_FINDINGS.md). Six became sixty not because the monitor repeated itself but
 * because nobody had done that arithmetic.
 *
 * THE LADDER, which is the part that needed designing rather than fixing:
 *
 *   at grace          the OPERATOR — they can still turn up or call in
 *                     the SUPERVISOR — they have to cover the shift
 *   at grace + 15     the ADMINS — and only if the person is STILL absent
 *
 * The admins are deliberately absent from the first rung. A shift five minutes light is not yet
 * news to them, and making it so is how an alert that matters stops being read.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const RUNNER = readFileSync(join(ROOT, "supabase/functions/staff-shift-monitor/index.ts"), "utf8");

/**
 * The runner's CODE, without comments. The comments quote the two doors this change removes, so a
 * search of the whole file for `notify-admin` finds the explanation of why it is gone — which is
 * the comment doing its job, and must not fail the test that says the code is gone.
 */
const CODE = RUNNER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20260912150000_noshow_ladder.sql"),
  "utf8",
);
const MIGRATION_SQL = MIGRATION.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

/**
 * The no-show region only: from its claim to the end of the escalation rung.
 *
 * BOUNDED DELIBERATELY. The first version of this ran to end-of-file and caught the
 * `notify-staff-whatsapp` call in the DISCONNECTED branch — a different alert type, untouched by
 * this change and out of the brief's scope. An over-wide slice does not find more defects; it
 * finds other people's code and reports it as yours.
 */
function noShowBlock(): string {
  const start = CODE.indexOf('alert_type: "no_show",');
  expect(start, "the no_show claim is gone from the runner").toBeGreaterThan(0);
  const end = CODE.indexOf("stats.noShowEscalations++", start);
  expect(end, "the escalation rung is gone from the runner").toBeGreaterThan(start);
  return CODE.slice(start, end);
}

describe("a no-show leaves by the router, not by a side door", () => {
  it("no longer calls notify-admin about a shift", () => {
    /*
      `notify-admin` survives in this file for exactly one thing — `system.runner_failure`, the
      alert that says the runner itself broke. That one must not depend on the router it is
      reporting the failure of, which is why it is asserted to remain rather than removed.
    */
    const adminCalls = [...CODE.matchAll(/notify-admin[\s\S]{0,400}?event_type:\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(adminCalls).not.toContain("shift.no_show");
    expect(adminCalls, "the runner-failure alarm must not go through the router it reports on").toContain(
      "system.runner_failure",
    );
  });

  it("no longer reaches for the operator's mobile directly", () => {
    // `notify-staff-whatsapp` bypasses both notification_routes AND staff_notification_prefs, so
    // an operator could not turn it off. The router owns the channel decision now.
    const block = noShowBlock();
    expect(block).not.toContain("notify-staff-whatsapp");
    expect(block).not.toContain("personal_mobile");
  });

  it("sends shift.no_show through notify-staff", () => {
    const block = noShowBlock();
    expect(block).toContain("/functions/v1/notify-staff");
    expect(block).toContain('type: "shift.no_show"');
  });
});

describe("the first rung: the operator and the supervisor", () => {
  it("names both, and does NOT name the admins", () => {
    const block = noShowBlock();
    const firstAudience = block.slice(block.indexOf("audience:"), block.indexOf("audience:") + 240);
    expect(firstAudience).toContain("staffIds: [scheduled.staff_id]");
    expect(firstAudience).toContain("call_centre_supervisor");
    // <-- load-bearing: the whole point of having two rungs.
    expect(firstAudience).not.toContain('"admin"');
  });
});

describe("the second rung: the admins, later, and only if still absent", () => {
  it("waits grace + 15 rather than firing with the first", () => {
    expect(CODE).toContain("NO_SHOW_GRACE_MINUTES + NO_SHOW_ESCALATE_MINUTES");
    expect(CODE).toMatch(/const NO_SHOW_ESCALATE_MINUTES = 15;/);
  });

  it("claims its own row, so it is sent once and not every two minutes", () => {
    expect(CODE).toContain('alert_type: "no_show_escalated"');
    const escalation = CODE.slice(CODE.indexOf('alert_type: "no_show_escalated"'));
    expect(escalation).toContain("if (escalated)");
  });

  it("is NOT gated on the first rung's claim", () => {
    /*
      THE SUBTLE ONE. On the run that escalates, rung one was claimed fifteen minutes earlier and
      `claimAlert` has already returned false for it. Putting rung two inside `if (raisedNoShow)`
      would mean the admins were told at the same moment as the supervisor — or, once the claim
      had been taken, never at all.
    */
    const raisedGuard = CODE.indexOf("if (!raisedNoShow) continue;");
    const escalationClaim = CODE.indexOf('alert_type: "no_show_escalated"');
    expect(raisedGuard).toBeGreaterThan(0);
    expect(escalationClaim).toBeGreaterThan(raisedGuard);
    // Between them there is no second `raisedNoShow` test that would re-gate it.
    const between = CODE.slice(raisedGuard + 30, escalationClaim);
    expect(between).not.toContain("raisedNoShow");
  });

  it("goes to the admins", () => {
    const escalation = CODE.slice(CODE.indexOf('alert_type: "no_show_escalated"'));
    expect(escalation).toMatch(/roles:\s*\["admin",\s*"super_admin"\]/);
  });

  it("reports itself, so a silent ladder is visible in the run stats", () => {
    expect(CODE).toContain("noShowEscalations");
  });
});

describe("the migration", () => {
  it("adds no_show_escalated without disturbing the other four types", () => {
    expect(MIGRATION_SQL).toMatch(/CHECK \(alert_type IN \([^)]*'no_show_escalated'[^)]*\)\)/);
    for (const kept of ["no_show", "no_coverage", "disconnected", "not_on_duty"]) {
      expect(MIGRATION_SQL).toContain(`'${kept}'`);
    }
  });

  it("turns SMS on for shift.no_show, and for nothing else", () => {
    // An operator who has not turned up is by definition not looking at the platform, so push and
    // in-app cannot reach them. Raising the CEILING only — staff_notification_prefs still decides
    // per person, so nobody starts receiving an SMS who has SMS switched off.
    expect(MIGRATION_SQL).toMatch(/event_type = 'shift\.no_show'[\s\S]*?channel = 'sms'/);
    expect(MIGRATION_SQL).not.toContain("shift.no_coverage");
    expect(MIGRATION_SQL).not.toContain("shift.disconnected");
  });

  it("needs no index change, because the dedupe key already covers a new type", () => {
    // The partial unique index from 20260912100000 is on
    // (alert_type, staff_id, shift_date, shift_type) WHERE resolved_at IS NULL.
    expect(MIGRATION_SQL).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
  });
});

describe("the schedule is untouched, because this is a safety runner", () => {
  it("changes what it decides and who it tells, not when it runs", () => {
    // The brief is explicit: staff-shift-monitor's cadence stays. A cron change hides in a diff
    // and turns a fix into an outage window.
    expect(CODE).not.toMatch(/cron\.schedule/);
  });

  it("leaves the dead-man's-switch for sos-escalation-runner intact", () => {
    /*
      The brief says sos-escalation-runner is untouched, and it is — no file under
      supabase/functions/sos-escalation-runner/ is in this change.

      What CANNOT be asserted by scanning this file is "does not mention it", because
      staff-shift-monitor is that runner's dead-man's-switch: it watches the SOS runner's
      heartbeat and raises the alarm when it stops. An earlier version of this test asserted the
      absence and failed on exactly that — the safety relationship reported as a scope violation.
      So it asserts the relationship still EXISTS, which is the thing worth protecting.
    */
    expect(CODE).toContain("sos-escalation-runner");
    expect(CODE).toMatch(/heartbeat/i);
  });
});
