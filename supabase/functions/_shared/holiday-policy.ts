/**
 * holiday-policy.ts — the Spanish holiday rules as SETTINGS, in one place.
 *
 * Lee's ruling (10 Sep): the legal rules are settings, not code. Two of them are convenio
 * questions nobody has answered yet, and a convenio changes without a deploy — so they live in
 * `system_settings` behind these keys, with the defaults below, and the screens read them rather
 * than hardcoding a rule that turns out to be somebody else's.
 *
 * WHY THE DEFAULTS ARE WHAT THEY ARE:
 *
 *   festivosCountAgainstVacaciones  OFF. The Estatuto does not settle whether a bank holiday
 *                                   falling inside `vacaciones` is consumed by it; that is
 *                                   convenio territory. Off is the reading that favours the
 *                                   worker, which is the safe default to be wrong in.
 *   carryOverEnabled                OFF. Vacaciones are taken in the year they accrue (ET
 *                                   art. 38.3). The one statutory exception — sickness or
 *                                   maternity/paternity overlapping booked leave, where the days
 *                                   are not lost — is deliberately NOT automated: it needs a
 *                                   human to say which absence caused it.
 *   shortNoticeWarningDays          60. Two months, as the brief asked. A WARNING, never a block:
 *                                   ET art. 38.3 requires the dates be agreed at least two months
 *                                   before they start, and a supervisor may still say yes.
 *   prorataEnabled                  ON, and it only bites for somebody whose `hire_date` falls
 *                                   inside the year. Everyone on the rota today is on a contrato
 *                                   indefinido predating 2026, so it changes nothing for them.
 *
 * THERE IS NO PAY-OUT SETTING, and there must never be one: days are taken, never paid instead
 * (Lee's ruling; ET art. 38.1 makes vacaciones non-substitutable by compensation). Asserted by
 * src/test/holidayPolicy.test.ts, which fails on the word appearing in this module or in the card.
 *
 * Pure module — no Deno, no React, no Supabase — so the edge runtime, the SPA and vitest all
 * import the same rules. Same pattern as `_shared/checkout-payment-methods.ts`.
 */

export const FESTIVOS_COUNT_KEY = "holiday_festivos_count_against_vacaciones";
export const CARRY_OVER_KEY = "holiday_carry_over_enabled";
export const SHORT_NOTICE_DAYS_KEY = "holiday_short_notice_warning_days";
export const PRORATA_KEY = "holiday_prorata_enabled";

/** Every key this module owns, for a single `.in()` when reading them. */
export const HOLIDAY_POLICY_KEYS = [
  FESTIVOS_COUNT_KEY,
  CARRY_OVER_KEY,
  SHORT_NOTICE_DAYS_KEY,
  PRORATA_KEY,
] as const;

export interface HolidayPolicy {
  /** Does a festivo inside a holiday range count against the 30 days? Convenio question. */
  festivosCountAgainstVacaciones: boolean;
  /** May unused days move into next year? */
  carryOverEnabled: boolean;
  /** Warn when approving dates that start fewer than this many days from now. */
  shortNoticeWarningDays: number;
  /** Pro-rata the entitlement for somebody who started part-way through the year. */
  prorataEnabled: boolean;
}

export const HOLIDAY_POLICY_DEFAULTS: HolidayPolicy = {
  festivosCountAgainstVacaciones: false,
  carryOverEnabled: false,
  shortNoticeWarningDays: 60,
  prorataEnabled: true,
};

/** The statutory minimum, in días naturales: ET art. 38.1 says 30 calendar days. */
export const STATUTORY_HOLIDAY_DAYS = 30;

/**
 * The one note that is statute rather than convenio, shown beside the carry-over switch.
 *
 * Kept as data rather than as copy inside the card so the same sentence reaches a Spanish
 * translation and any future edge function that has to explain a refusal.
 */
export const CARRY_OVER_SICKNESS_NOTE =
  "Sickness or maternity/paternity leave overlapping booked holiday is the statutory exception " +
  "(ET art. 38.3): those days are not lost, whatever this switch says. Handled by hand, because " +
  "it takes a human to say which absence caused it.";

export const FESTIVOS_CONVENIO_NOTE =
  "Confirm with the convenio. The Estatuto does not say whether a festivo inside vacaciones is " +
  "consumed by it, so this is off until somebody checks.";

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

/**
 * Read a stored boolean, falling back to the default on anything unrecognised.
 *
 * Deliberately not `value === "true"`: a row written as "1" by hand in the SQL editor would then
 * read as false, and a policy silently flipping to its default is exactly the failure that is
 * hard to notice. Anything genuinely unreadable falls back to the default rather than guessing.
 */
export function parseBooleanSetting(value: string | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return fallback;
}

/**
 * Read a stored whole number of days; anything invalid or negative falls back.
 *
 * An empty string falls back rather than reading as zero — `Number("")` is 0, and a blank row
 * would otherwise silently switch the warning off altogether.
 */
export function parseDaysSetting(value: string | null | undefined, fallback: number): number {
  if (value === null || value === undefined || value.trim() === "") return fallback;
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

/** Build the policy from `system_settings` rows (any order, missing keys allowed). */
export function parseHolidayPolicy(
  rows: Array<{ key: string; value: string | null }> | null | undefined,
): HolidayPolicy {
  const value = (key: string) => rows?.find((r) => r.key === key)?.value ?? null;
  return {
    festivosCountAgainstVacaciones: parseBooleanSetting(
      value(FESTIVOS_COUNT_KEY),
      HOLIDAY_POLICY_DEFAULTS.festivosCountAgainstVacaciones,
    ),
    carryOverEnabled: parseBooleanSetting(
      value(CARRY_OVER_KEY),
      HOLIDAY_POLICY_DEFAULTS.carryOverEnabled,
    ),
    shortNoticeWarningDays: parseDaysSetting(
      value(SHORT_NOTICE_DAYS_KEY),
      HOLIDAY_POLICY_DEFAULTS.shortNoticeWarningDays,
    ),
    prorataEnabled: parseBooleanSetting(
      value(PRORATA_KEY),
      HOLIDAY_POLICY_DEFAULTS.prorataEnabled,
    ),
  };
}

/** The rows to write back. Booleans as "true"/"false", days as digits. */
export function holidayPolicyToSettings(policy: HolidayPolicy): Record<string, string> {
  return {
    [FESTIVOS_COUNT_KEY]: String(policy.festivosCountAgainstVacaciones),
    [CARRY_OVER_KEY]: String(policy.carryOverEnabled),
    [SHORT_NOTICE_DAYS_KEY]: String(policy.shortNoticeWarningDays),
    [PRORATA_KEY]: String(policy.prorataEnabled),
  };
}

/** Days from `today` to `startDate`, negative when the start is in the past. */
export function daysUntil(startDate: string, today: string): number {
  const at = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return at(startDate) - at(today);
}

export interface ShortNoticeVerdict {
  /** Show the warning. */
  shortNotice: boolean;
  /** Days between today and the first day of leave; negative when it has already started. */
  daysAhead: number;
  /** The threshold in force, so the message can name it. */
  thresholdDays: number;
}

/**
 * Is this request short notice?
 *
 * ET art. 38.3: the dates are agreed between employer and worker, and the worker must know them
 * at least two months before they start. Approving inside that window is lawful — both sides can
 * agree to it — so this is a WARNING and never a refusal. The distinction matters: a system that
 * blocked it would push a legitimate agreement into a spreadsheet.
 */
export function shortNoticeCheck(
  startDate: string,
  today: string,
  policy: HolidayPolicy = HOLIDAY_POLICY_DEFAULTS,
): ShortNoticeVerdict {
  const daysAhead = daysUntil(startDate, today);
  return {
    shortNotice: daysAhead < policy.shortNoticeWarningDays,
    daysAhead,
    thresholdDays: policy.shortNoticeWarningDays,
  };
}

export interface ProrataResult {
  /** The entitlement to show. Equals `annualDays` when nothing is pro-rated. */
  days: number;
  /** True when `days` was reduced because the person started inside the year. */
  prorated: boolean;
  /**
   * Set when pro-rata was asked for and could NOT be computed: there is no hire date on file.
   * The full entitlement is returned in that case, and the screen says the date is missing —
   * quietly reducing somebody's holiday on a guess is not an option.
   */
  missingHireDate: boolean;
}

/**
 * The entitlement for one person in one year.
 *
 * Proportional to the part of the year they were employed for, counted in days and rounded UP:
 * a rounding that took a day off somebody's statutory minimum would be the wrong way to be
 * approximate. A hire date before the year, or after it, or absent, all return the full
 * entitlement — the last of those with `missingHireDate` set, because "we do not know" and
 * "they worked the whole year" must not look the same on the screen.
 */
export function prorataEntitlement(
  annualDays: number,
  hireDate: string | null | undefined,
  year: number,
  policy: HolidayPolicy = HOLIDAY_POLICY_DEFAULTS,
): ProrataResult {
  if (!policy.prorataEnabled) {
    return { days: annualDays, prorated: false, missingHireDate: false };
  }
  if (!hireDate) {
    return { days: annualDays, prorated: false, missingHireDate: true };
  }
  const startsInYear = hireDate >= `${year}-01-01` && hireDate <= `${year}-12-31`;
  if (!startsInYear) {
    return { days: annualDays, prorated: false, missingHireDate: false };
  }
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const totalDays = daysUntil(yearEnd, yearStart) + 1;
  const employedDays = daysUntil(yearEnd, hireDate) + 1;
  return {
    days: Math.min(annualDays, Math.ceil((annualDays * employedDays) / totalDays)),
    prorated: true,
    missingHireDate: false,
  };
}
