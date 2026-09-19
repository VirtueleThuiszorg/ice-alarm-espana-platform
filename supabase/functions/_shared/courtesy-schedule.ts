/**
 * ONE COURTESY-CALL SCHEDULE RULE, FOR THE WHOLE PLATFORM.
 *
 * It existed twice and the two copies DID NOT AGREE, which is why this file exists rather than a
 * comment asking the next person to keep them in step:
 *
 *   - `CourtesyCallsCard` used date-fns `addMonths`, which CLAMPS: 31 Jan + 1 month = 28 Feb.
 *   - `generate-courtesy-calls` used `Date.setMonth(m + 1)`, which OVERFLOWS: 31 Jan + 1 month
 *     is 31 February, and JavaScript rolls that forward to 3 March (2 March in a leap year).
 *
 * So for every member whose call lands on a 29th, 30th or 31st, the member's record showed one
 * next-call date and the generator wrote a different one — three days apart, in the direction of
 * calling a vulnerable person LATER than the record promised. Nobody had to make a mistake for
 * that to happen; the two rules simply drifted, exactly as `_shared/phone.ts` describes.
 *
 * THE CLAMP IS THE CORRECT BEHAVIOUR, not merely the one that won. A monthly call on the 31st
 * means "once a month", and February has no 31st; answering "3 March" turns a monthly rhythm
 * into an 31-day one and silently skips the end of the month. Clamping to the last day of the
 * target month keeps the cadence and never moves a call outside the month it belongs to.
 *
 * WHY THIS FILE LIVES UNDER `supabase/functions/_shared/`: the edge functions run in Deno and can
 * only reach their own directory and `_shared`; `src/` is not on that path. The app side reaches
 * it the way this repo already reaches `phone`, `pricing-calc`, `holiday-policy` and
 * `legacy-plan` — `src/lib/courtesySchedule.ts` re-exports it, so app files write
 * `@/lib/courtesySchedule` and there is still exactly one implementation.
 */

/** The frequencies `members.courtesy_call_frequency` may hold. Anything else is treated monthly. */
export type CourtesyFrequency = "daily" | "weekly" | "bi-weekly" | "monthly" | "quarterly";

/** Whole days to add, for the frequencies that are a fixed number of days. */
const DAYS_BY_FREQUENCY: Partial<Record<string, number>> = {
  daily: 1,
  weekly: 7,
  "bi-weekly": 14,
};

/** Whole months to add, for the frequencies that are calendar months. */
const MONTHS_BY_FREQUENCY: Partial<Record<string, number>> = {
  monthly: 1,
  quarterly: 3,
};

/**
 * Add whole calendar months, clamping the day to the last day of the target month.
 *
 * This is `date-fns` `addMonths` semantics, written out because `_shared` is loaded by Deno
 * straight from disk and this is the whole of what was needed from the library.
 */
function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getDate();
  // Land on the 1st of the target month first, so the day-of-month can never overflow during
  // the month arithmetic itself — `setMonth` on the 31st is the bug this function replaces.
  const result = new Date(base.getTime());
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  // Day 0 of the following month is the last day of this one.
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));
  return result;
}

/**
 * When the next courtesy call is due, given the member's frequency.
 *
 * `baseDate` is not defaulted to `new Date()` on purpose: every caller states the date it is
 * scheduling from, so the result is a pure function of its inputs and a test can assert the
 * month-end cases without freezing the clock.
 */
export function calculateNextCallDate(frequency: string, baseDate: Date): Date {
  const days = DAYS_BY_FREQUENCY[frequency];
  if (days !== undefined) {
    const result = new Date(baseDate.getTime());
    result.setDate(result.getDate() + days);
    return result;
  }
  // Monthly is the default for an unknown or missing frequency, matching both previous copies
  // and the `|| "monthly"` at every call site.
  const months = MONTHS_BY_FREQUENCY[frequency] ?? 1;
  return addMonthsClamped(baseDate, months);
}

/**
 * The same answer as a `YYYY-MM-DD` string, which is what `members.next_courtesy_call_date` holds.
 *
 * Formatted from the LOCAL date parts rather than `toISOString().split("T")[0]`. The previous
 * copies used the ISO form, which converts to UTC first: a call scheduled at 00:30 in Spain
 * (UTC+1, or +2 in summer) serialises as the PREVIOUS day, so the date written to the member's
 * record was a day earlier than the date shown to the staff member who set it.
 */
export function nextCallDateString(frequency: string, baseDate: Date): string {
  const next = calculateNextCallDate(frequency, baseDate);
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${month}-${day}`;
}
