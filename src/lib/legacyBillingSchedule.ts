/**
 * WHEN SANTANDER TAKES A LEGACY MEMBER'S MONEY, and therefore when we may ask them to move.
 *
 * The 431 imported members pay outside Stripe: a standing order or a direct debit collected by
 * the office, on a day of the month each of them has had for years. Nothing in this platform
 * knew that day, so nothing could time a switch link to it — and a switch link that arrives on
 * the wrong day either asks somebody to pay twice or lands after Santander has already taken it.
 *
 * This module is the whole of the date rule, and it is PURE: the import derives a schedule from
 * Karma's columns, staff correct it by hand, and the runner reads it — three callers, one rule.
 * A second implementation anywhere is a second answer to "when is this person charged".
 *
 * ── THE CLAMP, WHICH IS THE ONLY SUBTLE PART ──────────────────────────────────
 *
 * A member whose day is the 31st has no debit in February. Santander takes it on the last day of
 * the month instead, so this does too: `nextRenewalFrom(31, 5 Feb)` is 28 February (29 in a leap
 * year), not 3 March and not an error. Getting this wrong in the other direction — rolling into
 * the next month — would move somebody's payment date permanently every February.
 *
 * The day itself is NEVER clamped in storage. A member whose day is the 31st keeps 31 in
 * `legacy_billing_day`, because clamping on write would quietly turn them into a 28th member
 * forever after one February.
 */

/** What the import could work out, and how sure it is. */
export interface LegacySchedule {
  /** 1–31, the day of the month Santander collects. Null when nothing in the row says. */
  day: number | null;
  /** The next date money is due, ISO. Null when the day is unknown. */
  nextRenewal: string | null;
  /** Monthly unless the row says annual. */
  frequency: "monthly" | "annual";
  /** Where the day came from, for a human checking the import. */
  source: "monthly_payment_date" | "date_joined" | "none";
}

const iso = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;

/** Days in a given UTC month — day 0 of the next month is the last day of this one. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The day of the month, out of whatever Karma holds.
 *
 * Deliberately narrow. "15", "15th", "the 15th", "15/03/2019" and "on the 1st" all mean a day;
 * "monthly", "varies" and "" mean nobody wrote one down, and a guess here is a debit date on a
 * member's record that nobody checked. Anything not clearly a 1–31 returns null, which is what
 * the "needs a date" filter exists to surface.
 */
export function parseBillingDay(raw: string | null | undefined): number | null {
  const v = (raw ?? "").trim();
  if (!v) return null;

  // A full date: take its day. `15/03/2019` and `2019-03-15` both appear in the export.
  const dmy = v.match(/^(\d{1,2})[/-]\d{1,2}[/-]\d{2,4}$/);
  if (dmy) return inRange(Number(dmy[1]));
  const ymd = v.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
  if (ymd) return inRange(Number(ymd[2]));

  // A bare day, with or without an ordinal suffix and with or without words around it.
  const bare = v.match(/(?:^|\D)(\d{1,2})\s*(?:st|nd|rd|th)?(?:\D|$)/i);
  if (bare) return inRange(Number(bare[1]));

  return null;
}

function inRange(n: number): number | null {
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

/**
 * The next date a monthly debit falls, on or after `from`.
 *
 * "On or after": a member whose day is today is due TODAY, not next month. The runner sends the
 * switch link some days before this date, so treating today as already past would skip whoever
 * is due this morning.
 */
export function nextRenewalFrom(day: number, from: Date): string {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();

  const thisMonth = Math.min(day, daysInMonth(year, month));
  if (thisMonth >= from.getUTCDate()) return iso(new Date(Date.UTC(year, month, thisMonth)));

  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  return iso(new Date(Date.UTC(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)))));
}

/**
 * The next anniversary of a start date, on or after `from`.
 *
 * 29 February is clamped the same way a monthly 31st is: an annual member who joined on a leap
 * day renews on 28 February in the years that have no 29th.
 */
export function nextAnniversaryFrom(startDate: string, from: Date): string | null {
  const m = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;

  for (const year of [from.getUTCFullYear(), from.getUTCFullYear() + 1]) {
    const candidate = Date.UTC(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
    const fromMidnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    if (candidate >= fromMidnight) return iso(new Date(candidate));
  }
  return null;
}

export interface ScheduleInputs {
  /** Karma's `Monthly Payment Date`, verbatim. */
  monthlyPaymentDate: string | null;
  /** Karma's `Date Joined`, already parsed to ISO by the mapper (or null). */
  startDate: string | null;
  /** From `mapMembership` — annual members renew on their anniversary, not on a day of the month. */
  billingFrequency: "monthly" | "annual" | null;
}

/**
 * The schedule for one member.
 *
 * ANNUAL MEMBERS ARE READ FROM `Date Joined`, not from `Monthly Payment Date`: an annual member
 * has no monthly debit day, and a stray value in that column for one would otherwise produce a
 * monthly schedule for somebody who pays once a year.
 */
export function deriveLegacySchedule(input: ScheduleInputs, today: Date): LegacySchedule {
  const frequency = input.billingFrequency === "annual" ? "annual" : "monthly";

  if (frequency === "annual") {
    const nextRenewal = input.startDate ? nextAnniversaryFrom(input.startDate, today) : null;
    const day = nextRenewal ? Number(nextRenewal.slice(8, 10)) : null;
    return {
      day,
      nextRenewal,
      frequency,
      source: nextRenewal ? "date_joined" : "none",
    };
  }

  const day = parseBillingDay(input.monthlyPaymentDate);
  if (day === null) return { day: null, nextRenewal: null, frequency, source: "none" };
  return {
    day,
    nextRenewal: nextRenewalFrom(day, today),
    frequency,
    source: "monthly_payment_date",
  };
}

/**
 * Whether a member still needs a human to supply a date.
 *
 * The import cannot invent one, and the runner cannot time a switch link without one — so this
 * is the queue the "needs a date" filter shows, not an error state.
 */
export function needsBillingDate(member: {
  billing_source: string | null;
  legacy_billing_day: number | null;
}): boolean {
  return member.billing_source === "legacy" && member.legacy_billing_day === null;
}
