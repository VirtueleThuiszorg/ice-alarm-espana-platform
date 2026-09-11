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
  parseBillingDay,
  nextRenewalFrom,
  nextAnniversaryFrom,
  deriveLegacySchedule,
  needsBillingDate,
} from "@/lib/legacyBillingSchedule";

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
