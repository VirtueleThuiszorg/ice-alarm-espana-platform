// @vitest-environment node
//
// THE SANTANDER DATE. Item 1 of the Stripe migration goal.
//
// 431 imported members pay outside Stripe, on a day of the month each has had for years. The
// runner times each switch link to that day; get the day wrong and the member either pays twice
// (link before Santander has collected, then Santander collects anyway) or loses a month.
//
// So the date rule is pure, it is one module, and every branch of it is pinned here. The cases
// that matter are the ones nobody thinks about until February: a 31st member in a short month,
// a leap-day anniversary, and somebody whose date is TODAY.
import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  rolledForwardRenewal,
  parseBillingDay,
  nextRenewalFrom,
  nextAnniversaryFrom,
  deriveLegacySchedule,
  firstRenewalAfterPayment,
  needsBillingDate,
} from "../../supabase/functions/_shared/legacy-billing-schedule";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("daysInMonth", () => {
  it("knows the short months", () => {
    expect(daysInMonth(2027, 1)).toBe(28); // February 2027
    expect(daysInMonth(2028, 1)).toBe(29); // leap
    expect(daysInMonth(2026, 3)).toBe(30); // April
    expect(daysInMonth(2026, 0)).toBe(31); // January
  });

  it("treats 2100 as the non-leap year it is", () => {
    expect(daysInMonth(2100, 1)).toBe(28);
  });
});

describe("parseBillingDay", () => {
  it("reads a bare day", () => {
    expect(parseBillingDay("15")).toBe(15);
    expect(parseBillingDay(" 1 ")).toBe(1);
    expect(parseBillingDay("31")).toBe(31);
  });

  it("reads an ordinal, with or without words around it", () => {
    expect(parseBillingDay("15th")).toBe(15);
    expect(parseBillingDay("the 3rd")).toBe(3);
    expect(parseBillingDay("1st of the month")).toBe(1);
    expect(parseBillingDay("on the 22nd")).toBe(22);
  });

  it("takes the day out of a full date, in either order", () => {
    expect(parseBillingDay("15/03/2019")).toBe(15);
    expect(parseBillingDay("15-03-2019")).toBe(15);
    expect(parseBillingDay("2019-03-15")).toBe(15);
  });

  // The whole point of returning null: the "needs a date" filter is the queue of members a human
  // must look at. A guess here is a debit date on a member's record that nobody checked.
  it("returns null rather than guessing", () => {
    expect(parseBillingDay("")).toBeNull();
    expect(parseBillingDay(null)).toBeNull();
    expect(parseBillingDay(undefined)).toBeNull();
    expect(parseBillingDay("   ")).toBeNull();
    expect(parseBillingDay("monthly")).toBeNull();
    expect(parseBillingDay("varies")).toBeNull();
    expect(parseBillingDay("n/a")).toBeNull();
  });

  it("refuses a number that is not a day of the month", () => {
    expect(parseBillingDay("0")).toBeNull();
    expect(parseBillingDay("32")).toBeNull();
    expect(parseBillingDay("99")).toBeNull();
  });
});

describe("nextRenewalFrom", () => {
  it("returns a date later this month when the day is still ahead", () => {
    expect(nextRenewalFrom(15, utc("2026-09-01"))).toBe("2026-09-15");
  });

  // Somebody due this morning is due TODAY. The runner looks a few days ahead of this date, so
  // treating today as already gone would silently skip everybody whose day is the day we run.
  it("counts today as due today, not next month", () => {
    expect(nextRenewalFrom(15, utc("2026-09-15"))).toBe("2026-09-15");
  });

  it("rolls to next month once the day has passed", () => {
    expect(nextRenewalFrom(15, utc("2026-09-16"))).toBe("2026-10-15");
  });

  it("rolls across the year boundary", () => {
    expect(nextRenewalFrom(5, utc("2026-12-20"))).toBe("2027-01-05");
  });

  // THE CLAMP. A 31st member has no debit on 31 February; Santander takes it on the last day of
  // the month. Rolling into March instead would move their payment date permanently every year.
  it("clamps a 31st member to the last day of a short month", () => {
    expect(nextRenewalFrom(31, utc("2027-02-05"))).toBe("2027-02-28");
    expect(nextRenewalFrom(31, utc("2028-02-05"))).toBe("2028-02-29");
    expect(nextRenewalFrom(31, utc("2026-11-05"))).toBe("2026-11-30");
  });

  it("clamps when rolling forward into a short month too", () => {
    expect(nextRenewalFrom(30, utc("2027-01-31"))).toBe("2027-02-28");
  });

  it("gives a clamped day back to its own day the following month", () => {
    expect(nextRenewalFrom(31, utc("2027-03-01"))).toBe("2027-03-31");
  });
});

describe("nextAnniversaryFrom", () => {
  it("finds the anniversary later this year", () => {
    expect(nextAnniversaryFrom("2019-11-04", utc("2026-09-11"))).toBe("2026-11-04");
  });

  it("counts an anniversary falling today as due today", () => {
    expect(nextAnniversaryFrom("2019-09-11", utc("2026-09-11"))).toBe("2026-09-11");
  });

  it("rolls into next year once this year's has passed", () => {
    expect(nextAnniversaryFrom("2019-03-04", utc("2026-09-11"))).toBe("2027-03-04");
  });

  it("clamps a leap-day joiner to 28 February in ordinary years", () => {
    expect(nextAnniversaryFrom("2020-02-29", utc("2027-01-01"))).toBe("2027-02-28");
    expect(nextAnniversaryFrom("2020-02-29", utc("2028-01-01"))).toBe("2028-02-29");
  });

  it("returns null for anything that is not an ISO date", () => {
    expect(nextAnniversaryFrom("", utc("2026-09-11"))).toBeNull();
    expect(nextAnniversaryFrom("04/11/2019", utc("2026-09-11"))).toBeNull();
    expect(nextAnniversaryFrom("2019-13-04", utc("2026-09-11"))).toBeNull();
  });
});

describe("deriveLegacySchedule", () => {
  const today = utc("2026-09-11");

  it("derives a monthly schedule from Monthly Payment Date", () => {
    expect(
      deriveLegacySchedule(
        { monthlyPaymentDate: "20th", startDate: "2019-03-04", billingFrequency: "monthly" },
        today,
      ),
    ).toEqual({
      day: 20,
      nextRenewal: "2026-09-20",
      frequency: "monthly",
      source: "monthly_payment_date",
    });
  });

  it("says so, rather than guessing, when the column is empty", () => {
    expect(
      deriveLegacySchedule(
        { monthlyPaymentDate: null, startDate: "2019-03-04", billingFrequency: "monthly" },
        today,
      ),
    ).toEqual({ day: null, nextRenewal: null, frequency: "monthly", source: "none" });
  });

  it("defaults to monthly when the frequency is unknown", () => {
    const s = deriveLegacySchedule(
      { monthlyPaymentDate: "8", startDate: null, billingFrequency: null },
      today,
    );
    expect(s.frequency).toBe("monthly");
    expect(s.nextRenewal).toBe("2026-10-08");
  });

  // An annual member has no monthly debit day. A stray value in Monthly Payment Date for one of
  // them would otherwise produce a monthly schedule for somebody who pays once a year — and the
  // runner would then send them a switch link eleven months early.
  it("reads an annual member from Date Joined, ignoring Monthly Payment Date", () => {
    expect(
      deriveLegacySchedule(
        { monthlyPaymentDate: "20th", startDate: "2019-11-04", billingFrequency: "annual" },
        today,
      ),
    ).toEqual({
      day: 4,
      nextRenewal: "2026-11-04",
      frequency: "annual",
      source: "date_joined",
    });
  });

  it("leaves an annual member without a start date for a human", () => {
    expect(
      deriveLegacySchedule(
        { monthlyPaymentDate: "20th", startDate: null, billingFrequency: "annual" },
        today,
      ),
    ).toEqual({ day: null, nextRenewal: null, frequency: "annual", source: "none" });
  });
});

describe("needsBillingDate", () => {
  it("is the queue of legacy members with no day", () => {
    expect(needsBillingDate({ billing_source: "legacy", legacy_billing_day: null })).toBe(true);
  });

  it("is quiet once a day is known", () => {
    expect(needsBillingDate({ billing_source: "legacy", legacy_billing_day: 15 })).toBe(false);
  });

  // Stripe members are billed by Stripe. Asking staff for a Santander day for one would be asking
  // them to invent it.
  it("never asks for a Santander day from a member Stripe bills", () => {
    expect(needsBillingDate({ billing_source: "stripe", legacy_billing_day: null })).toBe(false);
    expect(needsBillingDate({ billing_source: "none", legacy_billing_day: null })).toBe(false);
    expect(needsBillingDate({ billing_source: null, legacy_billing_day: null })).toBe(false);
  });
});

describe("rolling a renewal forward once it has passed", () => {
  /*
    THE HOLE THIS CLOSES, and it is the one that would have stopped the whole migration.

    `legacy_next_renewal` is ONE DATE, written once by the import. Santander collects again next
    month regardless — but every reader here treats a date in the past as "nothing due": the
    runner skips the member for good, the CSV blanks their collection date, and the dashboard's
    "due this month" empties as the month goes by. With 431 dates scattered across a month, most
    would already have passed by the time the runner was switched on.
  */
  const monthly = (renewal: string, day: number | null = 15) => ({
    legacy_billing_day: day,
    legacy_next_renewal: renewal,
    billing_frequency: "monthly" as const,
  });

  it("moves a passed monthly date on to the next one", () => {
    expect(rolledForwardRenewal(monthly("2026-08-15"), utc("2026-09-11"))).toBe("2026-09-15");
  });

  it("leaves a date that is still ahead alone", () => {
    expect(rolledForwardRenewal(monthly("2026-09-15"), utc("2026-09-11"))).toBeNull();
  });

  // Due today is due today — rolling it forward now would skip this month's collection entirely.
  it("leaves TODAY alone", () => {
    expect(rolledForwardRenewal(monthly("2026-09-11"), utc("2026-09-11"))).toBeNull();
  });

  /*
    ROLLS FROM THE STORED DAY, NEVER FROM THE DATE. The February rule again: a 31st member whose
    last collection clamped to the 28th would become a 28th member forever if the next one were
    computed from that date instead of from the 31 on their record.
  */
  it("keeps a 31st member on the 31st after a February", () => {
    expect(rolledForwardRenewal(monthly("2027-02-28", 31), utc("2027-03-01"))).toBe("2027-03-31");
  });

  it("catches up a date that is months stale, not just one cycle", () => {
    expect(rolledForwardRenewal(monthly("2026-03-15"), utc("2026-09-11"))).toBe("2026-09-15");
  });

  // An annual member's anniversary is what repeats, and the day of the month is not enough to
  // reconstruct it — so this one rolls from the date.
  it("moves an annual member on by a year, from the date itself", () => {
    expect(
      rolledForwardRenewal(
        { legacy_billing_day: 4, legacy_next_renewal: "2026-03-04", billing_frequency: "annual" },
        utc("2026-09-11"),
      ),
    ).toBe("2027-03-04");
  });

  it("clamps a leap-day annual member into an ordinary February", () => {
    expect(
      rolledForwardRenewal(
        { legacy_billing_day: 29, legacy_next_renewal: "2028-02-29", billing_frequency: "annual" },
        utc("2028-03-01"),
      ),
    ).toBe("2029-02-28");
  });

  // Nothing to work from is the "needs a billing date" queue's problem, not this function's to
  // guess at.
  it("returns null rather than inventing a date it cannot work out", () => {
    expect(rolledForwardRenewal(monthly("2026-08-15", null), utc("2026-09-11"))).toBeNull();
    expect(
      rolledForwardRenewal(
        { legacy_billing_day: 15, legacy_next_renewal: null, billing_frequency: "monthly" },
        utc("2026-09-11"),
      ),
    ).toBeNull();
    expect(
      rolledForwardRenewal(
        { legacy_billing_day: 15, legacy_next_renewal: "not a date", billing_frequency: "monthly" },
        utc("2026-09-11"),
      ),
    ).toBeNull();
  });
});


/*
  ── THE SETUP DAY BECOMES THE BILLING DAY ──────────────────────────────────────

  Lee's rule: "a member pays the month's fee the moment they set up (join or switch) and again
  exactly one month later — the setup day becomes their billing day."

  The platform did not record that day. `create_payment_link_order` writes `renewal_date` when
  the ORDER is created — the day the link was SENT — and the join path does the same when the
  wizard is submitted. The member pays later: a switch link stands for up to 24 hours, and a SEPA
  debit settles days after the mandate is signed. So the first recorded renewal was the
  anniversary of a day nothing happened on, and nothing corrected it until the SECOND invoice.

  `firstRenewalAfterPayment` is the date the webhook now writes when the money actually arrives.
*/
describe("the first renewal after a first payment", () => {
  const on = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

  it("is one month later, on the same day of the month", () => {
    expect(firstRenewalAfterPayment(on("2026-09-15"), "monthly")).toBe("2026-10-15");
  });

  it("is one year later for an annual member", () => {
    expect(firstRenewalAfterPayment(on("2026-09-15"), "annual")).toBe("2027-09-15");
  });

  /*
    THE ONE THE NAIVE VERSION GETS WRONG. `setUTCMonth(+1)` on 31 January overflows to 3 March —
    a date in the wrong MONTH, on a record that decides when somebody is chased for money. Stripe
    clamps to the last day of the short month, and so does this, because it is the same
    `nextRenewalFrom` the Santander dates use rather than a second implementation of the clamp.
  */
  it("clamps a month-end payment to the short month, rather than overflowing into the next", () => {
    expect(firstRenewalAfterPayment(on("2026-01-31"), "monthly")).toBe("2026-02-28");
    expect(firstRenewalAfterPayment(on("2028-01-31"), "monthly")).toBe("2028-02-29");
    expect(firstRenewalAfterPayment(on("2026-08-31"), "monthly")).toBe("2026-09-30");
  });

  it("clamps a leap-day annual member to the 28th in the years that have no 29th", () => {
    expect(firstRenewalAfterPayment(on("2028-02-29"), "annual")).toBe("2029-02-28");
  });

  /*
    STRICTLY AFTER THE PAYMENT. The underlying rule is "on or after", which is right for a
    Santander date — somebody due today is due today — and wrong here: it would say the member
    renews the moment they have just paid.
  */
  it("is never the day of the payment itself", () => {
    for (const day of ["2026-01-01", "2026-02-28", "2026-06-30", "2026-12-31"]) {
      expect(firstRenewalAfterPayment(on(day), "monthly") > day, day).toBe(true);
      expect(firstRenewalAfterPayment(on(day), "annual") > day, day).toBe(true);
    }
  });
});
