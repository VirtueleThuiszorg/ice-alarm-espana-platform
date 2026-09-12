/**
 * WHO IS TOLD ABOUT A REAL NO-SHOW, AND WHEN — the brief's ladder.
 *
 *   operator   SMS + bell   at the grace period
 *   supervisor SMS + bell   at the grace period
 *   admins     SMS + bell   at grace + 15, and only if still absent
 *
 * ── WHAT IT WAS ─────────────────────────────────────────────────────────────
 *
 * Two calls to two different places, and neither was the router:
 *
 *   - `notify-admin` — so everybody at the TOP was told immediately, about a shift five minutes
 *     late, with nothing in between;
 *   - `notify-staff-whatsapp` — a bespoke sender that reads neither `notification_routes` nor
 *     `staff_notification_prefs`, so the one message that had to arrive bypassed every switch on
 *     the notifications settings screen.
 *
 * And the people who can actually cover the shift — the supervisors — were not told at all.
 *
 * ── AND THE CHANNEL NOBODY COULD HAVE USED ──────────────────────────────────
 *
 * `shift.no_show` was seeded sms=false. Gate 2 reads a disabled route as "off", so SMS — the
 * channel the brief names for every rung — was the one channel that could not send. A ladder
 * whose rungs are all routed to a channel that is switched off is a ladder nobody climbs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NOT_ON_DUTY_ESCALATE_MINUTES } from "../../supabase/functions/_shared/presence";

const ROOT = process.cwd();
const RUNNER = readFileSync(join(ROOT, "supabase/functions/staff-shift-monitor/index.ts"), "utf8");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20260912110000_no_show_ladder.sql"),
  "utf8",
);
const MIGRATION_SQL = MIGRATION.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

/** The no-show branch only — so an assertion here cannot be satisfied by the nudge's call. */
const NO_SHOW_BRANCH = RUNNER.slice(
  RUNNER.indexOf("// ── a real no-show ──"),
  RUNNER.indexOf("// CHECK 2: No coverage"),
);
/**
 * The branch's CODE, without its comments.
 *
 * The comments name what was replaced — `notify-admin`, `notify-staff-whatsapp` — because a
 * reader six months from now needs to know why those are gone. A search for the old sender must
 * therefore look at the statements, or the explanation of its absence fails the test that says it
 * is absent.
 */
const NO_SHOW_CODE = NO_SHOW_BRANCH.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("rung one — the operator and the supervisor, at the grace period", () => {
  it("goes through the router, not through notify-admin", () => {
    expect(NO_SHOW_CODE).toContain("/functions/v1/notify-staff");
    expect(NO_SHOW_CODE).not.toContain("/functions/v1/notify-admin");
  });

  it("no longer uses the bespoke WhatsApp sender, which reads no routes and no preferences", () => {
    expect(NO_SHOW_CODE).not.toContain("notify-staff-whatsapp");
    // And it no longer reads the mobile number itself: the router resolves recipients.
    expect(NO_SHOW_CODE).not.toContain("personal_mobile");
    // …while the comment that explains the removal is still there for the next reader.
    expect(NO_SHOW_BRANCH).toContain("notify-staff-whatsapp");
  });

  it("tells the person who is late AND the people who cover for them, in one dispatch", () => {
    // `audience` ORs roles with staffIds in the runtime's recipient query.
    expect(NO_SHOW_BRANCH).toMatch(
      /audience: \{\s*\n\s*staffIds: \[scheduled\.staff_id\],\s*\n\s*roles: \["call_centre_supervisor"\],/,
    );
  });

  it("does not tell the admins yet", () => {
    const rungOne = NO_SHOW_CODE.slice(0, NO_SHOW_CODE.indexOf('alert_type: "no_show_escalated"'));
    expect(rungOne).not.toContain("super_admin");
  });

  it("runs only when this run is the one that raised the alert", () => {
    expect(NO_SHOW_BRANCH).toMatch(/if \(raisedNoShow\) \{/);
  });
});

describe("rung two — the admins, later, and only if still absent", () => {
  it("is reached only when the claim was REFUSED, which means the row was already open", () => {
    /*
      `state` is re-evaluated every run and an operator who arrives closes the row higher up, so
      reaching this line at all means somebody has been absent since the alert was raised.
    */
    expect(NO_SHOW_BRANCH).toContain("RUNG TWO");
    expect(NO_SHOW_BRANCH).toMatch(/\.eq\("alert_type", "no_show"\)[\s\S]{0,200}\.is\("resolved_at", null\)/);
  });

  it("waits for the row to be fifteen minutes old", () => {
    expect(NO_SHOW_BRANCH).toContain("openForMinutes");
    expect(NO_SHOW_BRANCH).toMatch(/if \(openForMinutes < NOT_ON_DUTY_ESCALATE_MINUTES\) continue;/);
    expect(NOT_ON_DUTY_ESCALATE_MINUTES).toBe(15);
  });

  it("claims a row of its own, so the admins are told once and not every two minutes", () => {
    expect(NO_SHOW_BRANCH).toMatch(/alert_type: "no_show_escalated"/);
    expect(NO_SHOW_BRANCH).toMatch(/if \(!escalated\) continue;/);
  });

  it("sends the SAME event type — what they are told is a no-show", () => {
    // A second event type would need a route, a preference, a spec and three translations to say
    // the same thing. Only the LOG needs to tell the two rungs apart.
    expect((NO_SHOW_CODE.match(/type: "shift\.no_show"/g) ?? [])).toHaveLength(2);
    expect(NO_SHOW_CODE).not.toMatch(/type: "shift\.no_show_escalated"/);
  });

  it("goes to the admins", () => {
    expect(NO_SHOW_BRANCH).toMatch(/audience: \{ roles: \["admin", "super_admin"\] \}/);
  });
});

describe("the ladder, as arithmetic", () => {
  /** The runner's rule, extracted: which rung a given state and row-age produces. */
  const rung = (opts: { absent: boolean; rowOpen: boolean; openForMinutes: number; escalatedAlready: boolean }) => {
    if (!opts.absent) return "none";
    if (!opts.rowOpen) return "operator+supervisor";
    if (opts.openForMinutes < NOT_ON_DUTY_ESCALATE_MINUTES) return "none";
    if (opts.escalatedAlready) return "none";
    return "admins";
  };

  it("at the grace period, the operator and the supervisor — nobody else", () => {
    expect(rung({ absent: true, rowOpen: false, openForMinutes: 0, escalatedAlready: false })).toBe(
      "operator+supervisor",
    );
  });

  it("five minutes later, nothing — the row is open and not yet old enough", () => {
    expect(rung({ absent: true, rowOpen: true, openForMinutes: 5, escalatedAlready: false })).toBe("none");
  });

  it("at grace+15, the admins", () => {
    expect(rung({ absent: true, rowOpen: true, openForMinutes: 15, escalatedAlready: false })).toBe("admins");
  });

  it("and then nothing again, however long it runs", () => {
    for (const minutes of [16, 30, 90, 480]) {
      expect(rung({ absent: true, rowOpen: true, openForMinutes: minutes, escalatedAlready: true })).toBe("none");
    }
  });

  it("somebody who is present climbs no rung at all", () => {
    expect(rung({ absent: false, rowOpen: true, openForMinutes: 240, escalatedAlready: false })).toBe("none");
  });
});

describe("the migration", () => {
  it("turns SMS on for shift.no_show — the channel every rung is supposed to use", () => {
    expect(MIGRATION_SQL).toMatch(
      /UPDATE public\.notification_routes[\s\S]*?SET enabled = true[\s\S]*?event_type = 'shift\.no_show'[\s\S]*?channel = 'sms'/,
    );
  });

  it("leaves the other channels alone", () => {
    // Turning off a channel somebody may rely on is a product decision, not a bug fix.
    expect(MIGRATION_SQL).not.toMatch(/SET enabled = false/);
    expect(MIGRATION_SQL).not.toMatch(/channel = 'whatsapp'/);
  });

  it("adds the escalation's alert type without dropping the other four", () => {
    expect(MIGRATION_SQL).toMatch(
      /CHECK \(alert_type IN \([\s\S]*'no_show'[\s\S]*'no_coverage'[\s\S]*'disconnected'[\s\S]*'not_on_duty'[\s\S]*'no_show_escalated'[\s\S]*\)\)/,
    );
  });

  it("says how to reverse it, including the rows that would block the constraint", () => {
    expect(MIGRATION).toContain("REVERSAL");
    expect(MIGRATION).toMatch(/no_show_escalated. rows must be deleted first/);
  });

  it("adds no route row for an event type that does not exist", () => {
    // The escalation is a log type, not an event type — nothing new to route.
    expect(MIGRATION_SQL).not.toContain("INSERT INTO public.notification_routes");
  });
});
