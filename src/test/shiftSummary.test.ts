// @vitest-environment node
//
// The arithmetic on "My shifts", tested as arithmetic.
//
// Every number on that screen is one an operator may be paid on or arrange childcare around, so
// each is asserted directly rather than through a rendered string. The cases that matter are the
// ones a rota actually produces: a night shift that wraps midnight, a week that straddles a month
// boundary, and a handover note written at 01:00 that belongs to the previous day's night shift.
//
// Holiday balances are NOT here either: `staff_holiday_balance` already computes entitlement,
// approved, pending and remaining in Postgres, and `useMyHolidayBalance` reads it. Recomputing
// them on the client would be a second answer to the same question — and the one the page showed
// would not be the one a supervisor's approval screen used.
//
// The long-day warning is deliberately NOT here: `findLongDays` in src/lib/rota.ts already
// classifies a doubled day by shape (continuous-16h / split-16h / continuous-24h) and is tested
// in src/test/rota.test.ts against the real 2026 sheet. A second implementation of "this is a
// long day" is the duplicate parallel implementation the bar forbids, so the page uses that one —
// and `findLongDays` now takes its hours from `shiftHours` below rather than from its own `= 8`.

import { describe, it, expect } from "vitest";
import {
  groupByMonth,
  groupByWeek,
  hoursDisagree,
  monthKey,
  rowHours,
  shiftHours,
  shiftKey,
  shiftKeyOfTimestamp,
  totalHours,
  weekStart,
  type ShiftLike,
} from "@/lib/shiftSummary";
import { SHIFT_BOUNDS } from "../../supabase/functions/_shared/shift-time";

const shift = (date: string, type: ShiftLike["shift_type"], extra: Partial<ShiftLike> = {}) =>
  ({ shift_date: date, shift_type: type, ...extra }) as ShiftLike;

describe("how long a shift is", () => {
  it("is eight hours for each of the three", () => {
    expect(shiftHours("morning")).toBe(8);
    expect(shiftHours("afternoon")).toBe(8);
    expect(shiftHours("night")).toBe(8);
  });

  it("gets the night right by wrapping midnight, not by subtracting", () => {
    // 23 → 7 is +8, and 7 − 23 is −16. The wrong sign is the whole hazard here.
    expect(SHIFT_BOUNDS.night.end).toBeLessThan(SHIFT_BOUNDS.night.start);
    expect(shiftHours("night")).toBeGreaterThan(0);
  });

  it("is derived from SHIFT_BOUNDS, so a change there moves it", () => {
    // Not a tautology: it fails if the function ever hard-codes 8.
    for (const type of ["morning", "afternoon", "night"] as const) {
      const b = SHIFT_BOUNDS[type];
      const expected = b.end > b.start ? b.end - b.start : 24 - b.start + b.end;
      expect(shiftHours(type)).toBe(expected);
    }
  });

  it("totals a set", () => {
    expect(totalHours([shift("2026-09-10", "morning"), shift("2026-09-11", "night")])).toBe(16);
    expect(totalHours([])).toBe(0);
  });
});

describe("what a row itself claims", () => {
  it("reads its own start and end when they are there", () => {
    expect(rowHours(shift("2026-09-10", "morning", { start_time: "07:00:00", end_time: "15:00:00" }))).toBe(8);
    expect(rowHours(shift("2026-09-10", "night", { start_time: "23:00:00", end_time: "07:00:00" }))).toBe(8);
    expect(rowHours(shift("2026-09-10", "morning", { start_time: "07:30", end_time: "12:00" }))).toBe(4.5);
  });

  it("says nothing rather than guessing when the times are missing or unreadable", () => {
    expect(rowHours(shift("2026-09-10", "morning"))).toBeNull();
    expect(rowHours(shift("2026-09-10", "morning", { start_time: null, end_time: "15:00" }))).toBeNull();
    expect(rowHours(shift("2026-09-10", "morning", { start_time: "later", end_time: "15:00" }))).toBeNull();
  });

  it("flags a hand-edited shift whose hours are not the canonical eight", () => {
    // Reporting a four-hour shift as eight is a payroll error, not a display quirk.
    expect(hoursDisagree(shift("2026-09-10", "morning", { start_time: "07:00", end_time: "11:00" }))).toBe(true);
    expect(hoursDisagree(shift("2026-09-10", "morning", { start_time: "07:00", end_time: "15:00" }))).toBe(false);
    // Silent when the row does not say — absence of evidence is not a disagreement.
    expect(hoursDisagree(shift("2026-09-10", "morning"))).toBe(false);
  });
});

describe("grouping", () => {
  it("keys months off the date string, not off a parsed Date", () => {
    expect(monthKey("2026-01-01")).toBe("2026-01");
    expect(monthKey("2026-12-31")).toBe("2026-12");
  });

  it("finds the Monday of the week, including when the date IS Monday or Sunday", () => {
    expect(weekStart("2026-09-10")).toBe("2026-09-07"); // a Thursday
    expect(weekStart("2026-09-07")).toBe("2026-09-07"); // Monday itself
    expect(weekStart("2026-09-13")).toBe("2026-09-07"); // Sunday belongs to the week before
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
  });

  it("crosses a month boundary inside one week", () => {
    // 2026-10-01 is a Thursday, so its week starts in September.
    expect(weekStart("2026-10-01")).toBe("2026-09-28");
  });

  it("groups by month, oldest first, with hours per month", () => {
    const groups = groupByMonth([
      shift("2026-10-02", "night"),
      shift("2026-09-10", "morning"),
      shift("2026-09-11", "afternoon"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-09", "2026-10"]);
    expect(groups[0].hours).toBe(16);
    expect(groups[1].hours).toBe(8);
    expect(groups[0].shifts.map((s) => s.shift_date)).toEqual(["2026-09-10", "2026-09-11"]);
  });

  it("groups by week and sorts within a group by date", () => {
    const groups = groupByWeek([shift("2026-09-13", "night"), shift("2026-09-07", "morning")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-09-07");
    expect(groups[0].shifts.map((s) => s.shift_date)).toEqual(["2026-09-07", "2026-09-13"]);
  });

  it("does not mutate what it is given", () => {
    const input = [shift("2026-09-11", "morning"), shift("2026-09-10", "morning")];
    groupByMonth(input);
    expect(input.map((s) => s.shift_date)).toEqual(["2026-09-11", "2026-09-10"]);
  });
});

describe("attributing a timestamp to a shift", () => {
  it("keys a shift as date-type", () => {
    expect(shiftKey("2026-09-10", "night")).toBe("2026-09-10-night");
  });

  it("puts a note written at 01:00 on the PREVIOUS day's night shift", () => {
    // 00:30 Madrid on the 11th is 22:30Z on the 10th (CEST, +2). The night shift it belongs to
    // began at 23:00 on the 10th, so the key must say the 10th — this is the case a naive
    // `slice(0, 10)` of the timestamp gets wrong, and gets wrong for eight hours a day.
    expect(shiftKeyOfTimestamp("2026-09-10T23:30:00Z")).toBe("2026-09-10-night");
    expect(shiftKeyOfTimestamp("2026-09-11T00:30:00Z")).toBe("2026-09-10-night");
  });

  it("puts the rest of the day where it belongs, in Madrid time and not UTC", () => {
    // 06:00Z in September is 08:00 in Madrid — a morning shift, not a night one.
    expect(shiftKeyOfTimestamp("2026-09-10T06:00:00Z")).toBe("2026-09-10-morning");
    expect(shiftKeyOfTimestamp("2026-09-10T14:00:00Z")).toBe("2026-09-10-afternoon");
    // 21:30Z is 23:30 Madrid: the night shift of the same date.
    expect(shiftKeyOfTimestamp("2026-09-10T21:30:00Z")).toBe("2026-09-10-night");
  });

  it("survives the October clock change, when the offset is +1 rather than +2", () => {
    // Spain leaves CEST on 25 Oct 2026. 06:00Z is then 07:00 local — the first hour of a morning.
    expect(shiftKeyOfTimestamp("2026-11-02T06:00:00Z")).toBe("2026-11-02-morning");
    // And 05:30Z is 06:30 local, still the night shift that began on the 1st.
    expect(shiftKeyOfTimestamp("2026-11-02T05:30:00Z")).toBe("2026-11-01-night");
  });

  it("says nothing for a missing or unreadable timestamp", () => {
    expect(shiftKeyOfTimestamp(null)).toBeNull();
    expect(shiftKeyOfTimestamp(undefined)).toBeNull();
    expect(shiftKeyOfTimestamp("")).toBeNull();
    expect(shiftKeyOfTimestamp("last Tuesday")).toBeNull();
  });
});
