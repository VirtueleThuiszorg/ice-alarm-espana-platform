// @vitest-environment node
//
// THE PACING OF THE MIGRATION — item 3 of the Stripe billing goal.
//
// 431 members move over months, each on the day Santander takes their money. What this file
// pins is the two properties that decide whether that is safe:
//
//   1. EXACTLY ON THE DAY, not "within N days". A `<=` would send the monthly link three days
//      running — three texts about money to the same 80-year-old, each looking like the last one
//      failed. The dedupe key would stop the second and third being recorded, but the rule has
//      to be right on its own: the key is a guarantee, not a substitute for the decision.
//
//   2. NEVER TWICE PER RENEWAL, as a KEY rather than a check. The runner is a daily cron; it
//      will be re-run by hand, it will overlap itself, and one day it will crash halfway through
//      431 members. A "have we sent this?" SELECT is a race with all three. Every send carries a
//      key naming the member, the renewal and the kind, and the database holds a unique index on
//      it — so `ON CONFLICT DO NOTHING` makes the whole run idempotent and "just run it again" a
//      safe instruction.
//
// The annual ladder is the other half, and it is worth the extra machinery for one reason: an
// annual member who misses the switch does not get another chance for twelve months.
import { describe, it, expect } from "vitest";
import {
  DEFAULT_RUNNER_SETTINGS,
  RUNNER_SETTING_KEYS,
  daysUntil,
  isMemberFacing,
  parseRunnerSettings,
  planTodaysRun,
  plannedActionFor,
  sendKey,
  type RunnerCandidate,
  type RunnerSettings,
} from "../../supabase/functions/_shared/billing-migration-runner";

const TODAY = new Date("2026-09-11T00:00:00.000Z");
const ON: RunnerSettings = { ...DEFAULT_RUNNER_SETTINGS, enabled: true };

const member = (over: Partial<RunnerCandidate> = {}): RunnerCandidate => ({
  id: "m-1",
  billing_source: "legacy",
  legacy_next_renewal: "2026-09-14",
  billing_frequency: "monthly",
  ...over,
});

describe("daysUntil", () => {
  it("counts whole days forward", () => {
    expect(daysUntil("2026-09-14", TODAY)).toBe(3);
    expect(daysUntil("2026-09-11", TODAY)).toBe(0);
  });

  it("goes negative once the renewal has passed", () => {
    expect(daysUntil("2026-09-10", TODAY)).toBe(-1);
  });

  it("crosses a month and a year boundary without drifting", () => {
    expect(daysUntil("2026-10-11", TODAY)).toBe(30);
    expect(daysUntil("2027-09-11", TODAY)).toBe(365);
  });

  // 25 October 2026 is when Spain puts the clocks back. A local-time implementation counts 24
  // hours and lands an hour early, which across a DST boundary silently shifts a whole day.
  it("is unaffected by a daylight-saving change", () => {
    expect(daysUntil("2026-10-26", new Date("2026-10-24T00:00:00.000Z"))).toBe(2);
  });

  it("returns null for anything that is not an ISO date", () => {
    expect(daysUntil("", TODAY)).toBeNull();
    expect(daysUntil("14/09/2026", TODAY)).toBeNull();
  });
});

describe("a monthly member", () => {
  it("gets the switch link exactly three days before their Santander date", () => {
    expect(plannedActionFor(member({ legacy_next_renewal: "2026-09-14" }), ON, TODAY)).toBe("switch_link");
  });

  // THE ONE THAT MATTERS. `<=` here is three texts about money in three days.
  it("gets NOTHING on the days either side of it", () => {
    for (const renewal of ["2026-09-13", "2026-09-15", "2026-09-12", "2026-09-20"]) {
      expect(plannedActionFor(member({ legacy_next_renewal: renewal }), ON, TODAY), renewal).toBeNull();
    }
  });

  it("gets nothing once the renewal has gone past", () => {
    expect(plannedActionFor(member({ legacy_next_renewal: "2026-09-08" }), ON, TODAY)).toBeNull();
  });

  it("follows the configured lead time rather than a hard-coded three", () => {
    const sooner = { ...ON, monthlyLeadDays: 7 };
    expect(plannedActionFor(member({ legacy_next_renewal: "2026-09-18" }), sooner, TODAY)).toBe("switch_link");
    expect(plannedActionFor(member({ legacy_next_renewal: "2026-09-14" }), sooner, TODAY)).toBeNull();
  });

  // A row whose frequency nobody recorded is treated as monthly: monthly comes round again, so
  // a mistake costs a month rather than a year.
  it("is the default for a row with no frequency recorded", () => {
    expect(plannedActionFor(member({ billing_frequency: null }), ON, TODAY)).toBe("switch_link");
  });
});

describe("an annual member gets a ladder, not a surprise", () => {
  const annual = (renewal: string) =>
    member({ billing_frequency: "annual", legacy_next_renewal: renewal });

  it("is told 14 days out", () => {
    expect(plannedActionFor(annual("2026-09-25"), ON, TODAY)).toBe("annual_notice");
  });

  it("is reminded at 7", () => {
    expect(plannedActionFor(annual("2026-09-18"), ON, TODAY)).toBe("annual_reminder");
  });

  // Not a message to them — a bell for somebody to ring them. An annual member who misses this
  // does not get another chance for twelve months.
  it("becomes somebody's phone call at 3", () => {
    expect(plannedActionFor(annual("2026-09-14"), ON, TODAY)).toBe("staff_bell");
    expect(isMemberFacing("staff_bell")).toBe(false);
    expect(isMemberFacing("annual_notice")).toBe(true);
  });

  it("is left alone on every other day of the fortnight", () => {
    for (const renewal of ["2026-09-24", "2026-09-19", "2026-09-17", "2026-09-13", "2026-09-12"]) {
      expect(plannedActionFor(annual(renewal), ON, TODAY), renewal).toBeNull();
    }
  });

  // The rung an annual member would otherwise get on the day a MONTHLY member gets their link.
  it("never gets the monthly link, whatever the lead days say", () => {
    const collide = { ...ON, monthlyLeadDays: 14 };
    expect(plannedActionFor(annual("2026-09-25"), collide, TODAY)).toBe("annual_notice");
  });
});

describe("who is not written to at all", () => {
  it("nobody, while the runner is switched off", () => {
    expect(plannedActionFor(member(), { ...ON, enabled: false }, TODAY)).toBeNull();
  });

  // A second FIRST link is a second way to be charged for the same month.
  it("a monthly member who already has a link out", () => {
    expect(plannedActionFor(member({ billing_source: "switch_pending" }), ON, TODAY)).toBeNull();
  });

  it("a member Stripe already bills", () => {
    expect(plannedActionFor(member({ billing_source: "stripe" }), ON, TODAY)).toBeNull();
  });

  // They are in the "needs a billing date" queue, which is a person's job. Guessing here puts a
  // link in front of somebody on a day nobody chose.
  it("a member with no Santander date on file", () => {
    expect(plannedActionFor(member({ legacy_next_renewal: null }), ON, TODAY)).toBeNull();
  });
});

describe("the ladder has to reach a member it has already written to", () => {
  /*
    THE DEFECT, found by reviewing the merged runner. `plannedActionFor` said `legacy` only — and
    the annual NOTICE is what puts a member into `switch_pending`. So from 14 days onward they
    were excluded from the candidate set entirely: the reminder at 7 days and the phone call at 3
    were never planned at all. The ladder was one rung, for exactly the people a missed switch
    costs a whole year.

    The refusal these tests protect is about a FIRST link — nobody should be given two payable
    sessions — and the chase is not a first link.
  */
  const midSwitch = (renewal: string) =>
    member({ billing_source: "switch_pending", billing_frequency: "annual", legacy_next_renewal: renewal });

  it("reminds a member who is mid-switch because the notice put them there", () => {
    expect(plannedActionFor(midSwitch("2026-09-18"), ON, TODAY)).toBe("annual_reminder");
  });

  it("and rings the office about them at three days, which is when it matters most", () => {
    expect(plannedActionFor(midSwitch("2026-09-14"), ON, TODAY)).toBe("staff_bell");
  });

  // The opening message is for somebody who has not had one.
  it("but never sends the NOTICE twice", () => {
    expect(plannedActionFor(midSwitch("2026-09-25"), ON, TODAY)).toBeNull();
  });

  it("and still leaves a member Stripe bills, or one with no arrangement, alone", () => {
    for (const source of ["stripe", "none", null]) {
      expect(
        plannedActionFor(
          member({ billing_source: source, billing_frequency: "annual", legacy_next_renewal: "2026-09-18" }),
          ON,
          TODAY,
        ),
        String(source),
      ).toBeNull();
    }
  });

  it("a whole day's run picks up the mid-switch members too", () => {
    const plan = planTodaysRun(
      [
        member({ id: "legacy-notice", billing_frequency: "annual", legacy_next_renewal: "2026-09-25" }),
        { ...midSwitch("2026-09-18"), id: "mid-reminder" },
        { ...midSwitch("2026-09-14"), id: "mid-bell" },
      ],
      ON,
      TODAY,
    );
    expect(plan.map((p) => p.member.id).sort()).toEqual(["legacy-notice", "mid-bell", "mid-reminder"]);
  });
});

describe("the key that makes a second send impossible", () => {
  it("names the member, the renewal and the kind", () => {
    expect(sendKey("m-1", "2026-09-14", "switch_link")).toBe(
      "billing-switch:m-1:2026-09-14:switch_link",
    );
  });

  it("is different for the notice and the reminder against ONE renewal", () => {
    expect(sendKey("m-1", "2026-09-25", "annual_notice")).not.toBe(
      sendKey("m-1", "2026-09-25", "annual_reminder"),
    );
  });

  it("is different for next year's renewal, so the ladder runs again", () => {
    expect(sendKey("m-1", "2026-09-25", "annual_notice")).not.toBe(
      sendKey("m-1", "2027-09-25", "annual_notice"),
    );
  });

  it("is different per member, so one member's send cannot block another's", () => {
    expect(sendKey("m-1", "2026-09-14", "switch_link")).not.toBe(
      sendKey("m-2", "2026-09-14", "switch_link"),
    );
  });
});

describe("a whole day's run", () => {
  const people: RunnerCandidate[] = [
    member({ id: "monthly-due", legacy_next_renewal: "2026-09-14" }),
    member({ id: "monthly-not-yet", legacy_next_renewal: "2026-09-20" }),
    member({ id: "annual-notice", billing_frequency: "annual", legacy_next_renewal: "2026-09-25" }),
    member({ id: "annual-bell", billing_frequency: "annual", legacy_next_renewal: "2026-09-14" }),
    member({ id: "already-switching", billing_source: "switch_pending", legacy_next_renewal: "2026-09-14" }),
    member({ id: "no-date", legacy_next_renewal: null }),
  ];

  it("picks exactly the members due today", () => {
    const plan = planTodaysRun(people, ON, TODAY);
    expect(plan.map((p) => p.member.id).sort()).toEqual(["annual-bell", "annual-notice", "monthly-due"]);
  });

  it("carries the key and the renewal each send is about", () => {
    const plan = planTodaysRun(people, ON, TODAY);
    const due = plan.find((p) => p.member.id === "monthly-due")!;
    expect(due.key).toBe("billing-switch:monthly-due:2026-09-14:switch_link");
    expect(due.renewal).toBe("2026-09-14");
    expect(due.daysUntilRenewal).toBe(3);
  });

  /*
    THE DRY RUN IS THE SAME COMPUTATION, not a second description of it. A preview written
    separately is a preview that will one day disagree with what actually happens — and the
    screen it is on exists precisely so somebody can believe it before switching the runner on
    over 431 people.
  */
  it("is identical in dry-run mode — only the sending differs", () => {
    expect(planTodaysRun(people, { ...ON, dryRun: true }, TODAY)).toEqual(
      planTodaysRun(people, ON, TODAY),
    );
  });

  it("plans nothing at all while the runner is off", () => {
    expect(planTodaysRun(people, { ...ON, enabled: false }, TODAY)).toEqual([]);
  });
});

describe("the settings, read out of system_settings", () => {
  const rows = (o: Record<string, string | null>) =>
    Object.entries(o).map(([key, value]) => ({ key, value }));

  it("reads what an admin set", () => {
    const s = parseRunnerSettings(
      rows({
        [RUNNER_SETTING_KEYS.enabled]: "true",
        [RUNNER_SETTING_KEYS.monthlyLeadDays]: "5",
        [RUNNER_SETTING_KEYS.annualNoticeDays]: "21",
      }),
    );
    expect(s.enabled).toBe(true);
    expect(s.monthlyLeadDays).toBe(5);
    expect(s.annualNoticeDays).toBe(21);
    expect(s.annualReminderDays).toBe(7);
  });

  /*
    OFF IS THE FALLBACK FOR EVERY UNREADABLE INPUT. This setting decides whether 431 elderly
    people are written to about money; the safe answer to "I cannot tell what it says" is to send
    nothing and let somebody look.
  */
  it("is OFF for anything that is not exactly 'true'", () => {
    for (const value of ["", "1", "yes", "TRUE", "on", null]) {
      expect(parseRunnerSettings(rows({ [RUNNER_SETTING_KEYS.enabled]: value })).enabled, String(value)).toBe(false);
    }
  });

  it("is OFF when the row is missing altogether", () => {
    expect(parseRunnerSettings([]).enabled).toBe(false);
  });

  it("falls back to the default lead times rather than to zero", () => {
    for (const value of ["", "soon", "-1", "61", "3.5", null]) {
      const s = parseRunnerSettings(rows({ [RUNNER_SETTING_KEYS.monthlyLeadDays]: value }));
      expect(s.monthlyLeadDays, String(value)).toBe(DEFAULT_RUNNER_SETTINGS.monthlyLeadDays);
    }
  });

  // Zero is a real choice: send on the day itself. It must not be swallowed by a falsy check.
  it("accepts zero, which means 'on the day'", () => {
    expect(parseRunnerSettings(rows({ [RUNNER_SETTING_KEYS.monthlyLeadDays]: "0" })).monthlyLeadDays).toBe(0);
  });

  it("ships switched OFF by default", () => {
    expect(DEFAULT_RUNNER_SETTINGS.enabled).toBe(false);
  });
});
