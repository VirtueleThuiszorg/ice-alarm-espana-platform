// @vitest-environment node
//
// The Spanish holiday rules, as settings.
//
// Lee's ruling (10 Sep): these are settings, not code — two of them are convenio questions
// nobody has answered, and a convenio changes without a deploy. So what is tested here is the
// PARSING and the ARITHMETIC, both of which decide a number somebody is paid or planned around:
// a setting that silently reads as its default, or a pro-rata that quietly removes a day from a
// statutory minimum, are the two ways this goes wrong without anybody noticing.
//
// The rule that is not a setting is also asserted here: there is no pay-out, anywhere.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CARRY_OVER_KEY,
  CARRY_OVER_SICKNESS_NOTE,
  FESTIVOS_COUNT_KEY,
  FESTIVOS_CONVENIO_NOTE,
  HOLIDAY_POLICY_DEFAULTS,
  HOLIDAY_POLICY_KEYS,
  PRORATA_KEY,
  SHORT_NOTICE_DAYS_KEY,
  STATUTORY_HOLIDAY_DAYS,
  daysUntil,
  holidayPolicyToSettings,
  parseBooleanSetting,
  parseDaysSetting,
  parseHolidayPolicy,
  prorataEntitlement,
  shortNoticeCheck,
} from "../../supabase/functions/_shared/holiday-policy";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the defaults are the ones Lee ruled on", () => {
  it("festivos do NOT count against vacaciones until the convenio says so", () => {
    expect(HOLIDAY_POLICY_DEFAULTS.festivosCountAgainstVacaciones).toBe(false);
    expect(FESTIVOS_CONVENIO_NOTE).toMatch(/convenio/i);
  });

  it("carry-over is off, with the sickness exception recorded as a note", () => {
    expect(HOLIDAY_POLICY_DEFAULTS.carryOverEnabled).toBe(false);
    // ET art. 38.3: leave overlapped by sickness or maternity/paternity is not lost. Not
    // automated — it takes a human to say which absence caused it — so it must at least be said.
    expect(CARRY_OVER_SICKNESS_NOTE).toMatch(/art\. 38\.3/);
    expect(CARRY_OVER_SICKNESS_NOTE.toLowerCase()).toMatch(/sickness|maternity/);
  });

  it("the short-notice warning is two months", () => {
    expect(HOLIDAY_POLICY_DEFAULTS.shortNoticeWarningDays).toBe(60);
  });

  it("the statutory minimum is 30 días naturales", () => {
    expect(STATUTORY_HOLIDAY_DAYS).toBe(30);
  });

  it("every key is listed once, so one read fetches the lot", () => {
    expect([...HOLIDAY_POLICY_KEYS].sort()).toEqual(
      [FESTIVOS_COUNT_KEY, CARRY_OVER_KEY, SHORT_NOTICE_DAYS_KEY, PRORATA_KEY].sort(),
    );
    expect(new Set(HOLIDAY_POLICY_KEYS).size).toBe(HOLIDAY_POLICY_KEYS.length);
    // Namespaced, so a future setting called `carry_over` for something else cannot collide.
    for (const key of HOLIDAY_POLICY_KEYS) expect(key.startsWith("holiday_")).toBe(true);
  });
});

describe("reading a stored setting", () => {
  it("accepts what a human might have typed in the SQL editor", () => {
    // Not `value === "true"`: a row written as "1" by hand would read as false, and a policy
    // silently flipping to its default is the failure that is hard to notice.
    for (const yes of ["true", "TRUE", " true ", "1", "yes", "on"]) {
      expect(parseBooleanSetting(yes, false), yes).toBe(true);
    }
    for (const no of ["false", "FALSE", "0", "no", "off"]) {
      expect(parseBooleanSetting(no, true), no).toBe(false);
    }
  });

  it("falls back rather than guessing on nonsense", () => {
    for (const junk of [null, undefined, "", "maybe", "sí"]) {
      expect(parseBooleanSetting(junk, true), String(junk)).toBe(true);
      expect(parseBooleanSetting(junk, false), String(junk)).toBe(false);
    }
  });

  it("reads a day count, and refuses a negative or fractional one", () => {
    expect(parseDaysSetting("30", 60)).toBe(30);
    expect(parseDaysSetting(" 0 ", 60)).toBe(0);
    for (const junk of [null, "", "-1", "1.5", "two months", "60x"]) {
      expect(parseDaysSetting(junk, 60), String(junk)).toBe(60);
    }
  });

  it("builds the whole policy from rows in any order, with missing keys defaulted", () => {
    const policy = parseHolidayPolicy([
      { key: SHORT_NOTICE_DAYS_KEY, value: "30" },
      { key: FESTIVOS_COUNT_KEY, value: "true" },
    ]);
    expect(policy).toEqual({
      festivosCountAgainstVacaciones: true,
      carryOverEnabled: false,
      shortNoticeWarningDays: 30,
      prorataEnabled: true,
    });
  });

  it("returns the defaults for no rows at all — the state on a fresh database", () => {
    expect(parseHolidayPolicy([])).toEqual(HOLIDAY_POLICY_DEFAULTS);
    expect(parseHolidayPolicy(null)).toEqual(HOLIDAY_POLICY_DEFAULTS);
  });

  it("round-trips through what is written back", () => {
    const policy = {
      festivosCountAgainstVacaciones: true,
      carryOverEnabled: true,
      shortNoticeWarningDays: 45,
      prorataEnabled: false,
    };
    const rows = Object.entries(holidayPolicyToSettings(policy)).map(([key, value]) => ({
      key,
      value,
    }));
    expect(parseHolidayPolicy(rows)).toEqual(policy);
  });
});

describe("the short-notice warning", () => {
  const TODAY = "2026-09-10";

  it("counts calendar days to the first day of leave", () => {
    expect(daysUntil("2026-09-11", TODAY)).toBe(1);
    expect(daysUntil("2026-11-09", TODAY)).toBe(60);
    expect(daysUntil("2026-09-01", TODAY)).toBe(-9);
    // Across the October clock change, which a naive hours-based subtraction gets wrong by one.
    expect(daysUntil("2026-11-02", TODAY)).toBe(53);
  });

  it("fires inside two months and not outside", () => {
    // Exactly 60 days ahead SATISFIES art. 38.3 ("at least two months"), so it does not warn;
    // 59 does. The boundary is asserted from both sides because an off-by-one here either cries
    // wolf on every lawful request or stays silent on the one that matters.
    expect(shortNoticeCheck("2026-11-08", TODAY).shortNotice).toBe(true); // 59 days
    expect(shortNoticeCheck("2026-11-09", TODAY).shortNotice).toBe(false); // 60 days exactly
    expect(shortNoticeCheck("2026-11-10", TODAY).shortNotice).toBe(false); // 61
    expect(shortNoticeCheck("2026-09-12", TODAY).shortNotice).toBe(true);
  });

  it("fires on a request whose dates have already started", () => {
    // Backdated requests happen — somebody was off sick and it is being recorded late.
    const verdict = shortNoticeCheck("2026-09-01", TODAY);
    expect(verdict.shortNotice).toBe(true);
    expect(verdict.daysAhead).toBe(-9);
  });

  it("moves with the setting, and reports the threshold it used", () => {
    const strict = { ...HOLIDAY_POLICY_DEFAULTS, shortNoticeWarningDays: 90 };
    expect(shortNoticeCheck("2026-11-10", TODAY, strict).shortNotice).toBe(true); // 61 < 90
    expect(shortNoticeCheck("2026-11-10", TODAY, strict).thresholdDays).toBe(90);
    const off = { ...HOLIDAY_POLICY_DEFAULTS, shortNoticeWarningDays: 0 };
    expect(shortNoticeCheck("2026-09-11", TODAY, off).shortNotice).toBe(false);
  });
});

describe("pro-rata for somebody who started part-way through the year", () => {
  it("leaves a full-year employee alone", () => {
    // All four operators: contratos indefinidos predating 2026.
    expect(prorataEntitlement(30, "2019-04-01", 2026)).toEqual({
      days: 30,
      prorated: false,
      missingHireDate: false,
    });
  });

  it("reduces it in proportion to the days employed", () => {
    // 1 July 2026 → 184 of 365 days → 30 × 184 / 365 = 15.1, rounded UP to 16.
    const half = prorataEntitlement(30, "2026-07-01", 2026);
    expect(half.prorated).toBe(true);
    expect(half.days).toBe(16);
    // Hired on 1 January is the whole year, and must not come out at 29 through rounding.
    expect(prorataEntitlement(30, "2026-01-01", 2026).days).toBe(30);
    // The last day of the year is one day employed: one day of holiday, never zero.
    expect(prorataEntitlement(30, "2026-12-31", 2026).days).toBe(1);
  });

  it("rounds UP, because rounding down takes a day off a statutory minimum", () => {
    // 1 December 2026 → 31 days → 30 × 31 / 365 = 2.55. Down would be 2.
    expect(prorataEntitlement(30, "2026-12-01", 2026).days).toBe(3);
  });

  it("never exceeds the annual entitlement", () => {
    expect(prorataEntitlement(30, "2026-01-01", 2026).days).toBeLessThanOrEqual(30);
    expect(prorataEntitlement(22, "2026-01-01", 2026).days).toBeLessThanOrEqual(22);
  });

  it("says the hire date is MISSING rather than pro-rating a guess", () => {
    // "We do not know" and "they worked the whole year" must not look the same on the screen.
    const unknown = prorataEntitlement(30, null, 2026);
    expect(unknown).toEqual({ days: 30, prorated: false, missingHireDate: true });
    expect(prorataEntitlement(30, undefined, 2026).missingHireDate).toBe(true);
  });

  it("is silent when the setting is off, including about a missing date", () => {
    const off = { ...HOLIDAY_POLICY_DEFAULTS, prorataEnabled: false };
    expect(prorataEntitlement(30, null, 2026, off)).toEqual({
      days: 30,
      prorated: false,
      missingHireDate: false,
    });
    expect(prorataEntitlement(30, "2026-07-01", 2026, off).days).toBe(30);
  });

  it("does not pro-rate a hire date in a LATER year", () => {
    // Somebody who starts in 2027 has no 2026 entitlement to reduce; the 2026 page should not
    // show them a smaller number, it should not show them at all.
    expect(prorataEntitlement(30, "2027-02-01", 2026).prorated).toBe(false);
  });
});

describe("there is no pay-out, anywhere", () => {
  // ET art. 38.1: vacaciones cannot be substituted by financial compensation. Lee's ruling says
  // the same. A control that offered it would be unlawful as well as wrong, so its absence is
  // asserted rather than trusted to reviewer attention.
  const statements = (rel: string) =>
    read(rel)
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l.trim()))
      .join("\n")
      .toLowerCase();

  it("not in the policy module", () => {
    expect(statements("supabase/functions/_shared/holiday-policy.ts")).not.toMatch(
      /pay[_ -]?out|payout|compensat|in_lieu|buy[_ -]?back/,
    );
  });

  it("not in the card that edits the policy", () => {
    expect(statements("src/components/admin/HolidayPolicyCard.tsx")).not.toMatch(
      /pay[_ -]?out|payout|compensat|in_lieu|buy[_ -]?back/,
    );
  });

  it("and the module says so out loud, so the next person does not add one", () => {
    const source = read("supabase/functions/_shared/holiday-policy.ts");
    expect(source).toMatch(/never be one|no pay-out/i);
  });
});
