/**
 * WHAT COUNTS AS BEING AT WORK — the decision that filled a bell with alerts about a man at his desk.
 *
 * `staff-shift-monitor` answered "did this person turn up" with one column, `staff.is_on_call`,
 * which is set by pressing "On duty". Travis worked a night shift with the platform open, sending
 * a heartbeat every thirty seconds, and never pressed it. He was ABSENT as far as the runner was
 * concerned, and the notifications said so, repeatedly, all night.
 *
 * The platform knew he was there the whole time — `staff_presence` said so, and the supervisor's
 * "who is on now" strip rendered him as PRESENT off exactly those rows. One question, two
 * answers, because the runner and the strip each had their own idea of what presence is.
 *
 * These tests are about the shared answer: the three states, the freshness rule, and the two
 * clocks that made one shift look like two.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HEARTBEAT_STALE_SECONDS,
  NOT_ON_DUTY_ESCALATE_MINUTES,
  heartbeatIsFresh,
  isPresent,
  presenceState,
} from "../../supabase/functions/_shared/presence";

const NOW = Date.parse("2026-09-11T02:30:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe("the three states", () => {
  it("ON DUTY when they pressed the button, whatever the heartbeat says", () => {
    // The button is the strongest signal there is: it is the one that routes alerts to them.
    expect(presenceState({ isOnCall: true, isOnline: false, lastHeartbeatAt: null }, NOW)).toBe(
      "on_duty",
    );
    expect(
      presenceState({ isOnCall: true, isOnline: true, lastHeartbeatAt: ago(5) }, NOW),
    ).toBe("on_duty");
  });

  it("PRESENT BUT NOT ON DUTY with a fresh heartbeat and no button — Travis's night", () => {
    expect(
      presenceState({ isOnCall: false, isOnline: true, lastHeartbeatAt: ago(20) }, NOW),
    ).toBe("present_not_on_duty");
  });

  it("ABSENT with neither", () => {
    expect(presenceState({ isOnCall: false, isOnline: false, lastHeartbeatAt: null }, NOW)).toBe(
      "absent",
    );
  });

  it("is PRESENT for the first two and not the third — the brief's rule in one line", () => {
    expect(isPresent({ isOnCall: true, isOnline: false, lastHeartbeatAt: null }, NOW)).toBe(true);
    expect(isPresent({ isOnCall: false, isOnline: true, lastHeartbeatAt: ago(20) }, NOW)).toBe(true);
    expect(isPresent({ isOnCall: false, isOnline: false, lastHeartbeatAt: ago(600) }, NOW)).toBe(
      false,
    );
  });

  it("does not collapse the middle state into either neighbour", () => {
    /*
      Into ON DUTY and a shift whose alerts route to nobody goes unremarked; into ABSENT and you
      get the flood. It has to be its own answer, so the caller can nudge rather than alarm.
    */
    const middle = presenceState({ isOnCall: false, isOnline: true, lastHeartbeatAt: ago(1) }, NOW);
    expect(middle).not.toBe("on_duty");
    expect(middle).not.toBe("absent");
  });
});

describe("what makes a heartbeat fresh", () => {
  it("counts up to the threshold and not past it", () => {
    expect(heartbeatIsFresh(ago(HEARTBEAT_STALE_SECONDS - 1), NOW)).toBe(true);
    expect(heartbeatIsFresh(ago(HEARTBEAT_STALE_SECONDS), NOW)).toBe(true);
    expect(heartbeatIsFresh(ago(HEARTBEAT_STALE_SECONDS + 1), NOW)).toBe(false);
  });

  it("is 90 seconds — three missed thirty-second pings", () => {
    expect(HEARTBEAT_STALE_SECONDS).toBe(90);
  });

  it("treats a missing or unreadable timestamp as NOT fresh", () => {
    // "I cannot tell when they were last seen" must never read as "just now" on the screen a
    // supervisor uses to find out who is covering.
    expect(heartbeatIsFresh(null, NOW)).toBe(false);
    expect(heartbeatIsFresh(undefined, NOW)).toBe(false);
    expect(heartbeatIsFresh("", NOW)).toBe(false);
    expect(heartbeatIsFresh("not a date", NOW)).toBe(false);
  });

  it("requires is_online AND the timestamp, because the flag is a stale cache of it", () => {
    /*
      The monitor is what clears `is_online`, and it runs every two minutes. Between somebody
      closing their laptop and the next run the flag still says true and means nothing.
    */
    expect(
      presenceState({ isOnCall: false, isOnline: true, lastHeartbeatAt: ago(600) }, NOW),
    ).toBe("absent");
    expect(
      presenceState({ isOnCall: false, isOnline: false, lastHeartbeatAt: ago(1) }, NOW),
    ).toBe("absent");
  });
});

describe("the runner reads the shared definition and no longer its own", () => {
  const runner = readFileSync(
    join(process.cwd(), "supabase/functions/staff-shift-monitor/index.ts"),
    "utf8",
  );

  it("decides from presenceState, not from is_on_call alone", () => {
    expect(runner).toContain("presenceState(");
    expect(runner).toContain("_shared/presence.ts");
    // The line that caused it: a Set of on-call ids, consulted as if it answered the question.
    expect(runner).not.toMatch(/if\s*\(onCallIds\.has\([^)]*\)\)\s*continue;\s*\/\/\s*They signed in/);
  });

  it("reads staff_presence at all, which it never used to", () => {
    expect(runner).toContain('.from("staff_presence")');
    expect(runner).toMatch(/select\("staff_id, is_online, last_heartbeat_at"\)/);
  });

  it("declares no staleness constant of its own", () => {
    expect(runner).not.toMatch(/const\s+HEARTBEAT_STALE_SECONDS\s*=/);
  });

  it("does not alert on somebody who is present but not on duty", () => {
    // It counts and logs them. The NUDGE needs a once-per-shift row, which needs a migration.
    expect(runner).toContain('state === "present_not_on_duty"');
    expect(runner).toContain("present_but_not_on_duty");
    expect(runner).toContain("presentNotOnDuty");
  });
});

describe("the two clocks, which made one shift look like two", () => {
  const runner = readFileSync(
    join(process.cwd(), "supabase/functions/staff-shift-monitor/index.ts"),
    "utf8",
  );

  it("keys the alert to the SCHEDULED row's shift, not to the runner's clock", () => {
    /*
      `staff_on_shift_now` filters on CURRENT_DATE/CURRENT_TIME — the database's clock — while the
      runner keys on Europe/Madrid. The runner used to select `shift_type` and ignore it, writing
      its own `today`/`currentShift` onto the log row, so across midnight the same person and the
      same shift produced two different dedupe keys.
    */
    expect(runner).toMatch(/select\("staff_id, first_name, last_name, shift_type, shift_date"\)/);
    expect(runner).toContain("scheduled.shift_date ?? today");
    expect(runner).toMatch(/shift_date:\s*shiftDate/);
    expect(runner).toMatch(/shift_type:\s*shiftType/);
  });

  it("measures the grace period from THAT shift's start", () => {
    expect(runner).toContain("minutesIntoShift");
    expect(runner).toContain("(((shiftCtx.hour - bounds.start + 24) % 24) * 60) + shiftCtx.minute");
  });

  it("does not chase somebody for a shift that has already ended in Madrid", () => {
    // Between 07:00 and 09:00 Madrid the view's third branch still returns last night's NIGHT row.
    expect(runner).toContain("SHIFT_LENGTH_MINUTES");
    expect(runner).toContain("scheduled_row_outside_its_own_shift");
  });
});

describe("the arithmetic of that window", () => {
  /** The same expression the runner uses, so the numbers below are the runner's own. */
  const minutesInto = (startHour: number, hour: number, minute: number) =>
    (((hour - startHour + 24) % 24) * 60) + minute;

  it("a night shift at 02:30 Madrid is three and a half hours in — late, and chaseable", () => {
    expect(minutesInto(23, 2, 30)).toBe(210);
  });

  it("the same night row at 08:00 Madrid is NINE hours in — past its end, so nobody is chased", () => {
    expect(minutesInto(23, 8, 0)).toBe(540);
    expect(540).toBeGreaterThanOrEqual(8 * 60);
  });

  it("a morning shift at 07:03 is inside the grace period", () => {
    expect(minutesInto(7, 7, 3)).toBe(3);
    expect(3).toBeLessThan(5);
  });

  it("gives the supervisor fifteen minutes before being told about a missing button", () => {
    expect(NOT_ON_DUTY_ESCALATE_MINUTES).toBe(15);
  });
});
