/**
 * Is Isabella actually working? — the verdict behind the admin dashboard's Isabella card.
 *
 * THE DEFECT THIS REPLACES. `IsabellaStatusBanner` decided with one line:
 *
 *     const isActive = enabledFunctions.length > 0;
 *
 * That is a reading of `isabella_settings` — a list of switches an admin flipped, some of them
 * months ago. It says nothing whatsoever about whether the assistant can complete a run. On
 * 8 Sep the Anthropic balance hit zero, every call failed, and the dashboard said ISABELLA
 * ACTIVE all day in green with a list of forty-odd functions underneath. A status light wired to
 * a switch instead of to the thing it describes is worse than no light: it is an assurance.
 *
 * So the verdict here comes from EXECUTIONS ONLY. `ai_runs` is the execution record —
 * `ai-run/index.ts` inserts a row per run and updates it to `completed`, or to `failed` with the
 * Anthropic error text in `error_message` (which is exactly where "credit balance is too low"
 * lands). Settings are not an input, and cannot become one: nothing in this module reads them.
 *
 * WHY A PURE FUNCTION. The card renders whatever this returns, so every rule below can be tested
 * against fixed inputs rather than against a rendered DOM and a mocked clock. `now` is injected
 * for the same reason.
 *
 * THE RULES, worst-first. Two axes — recent failures, and staleness of the last success — and
 * the verdict is the worse of them.
 *
 *   red    failing        something failed in the last hour and nothing has succeeded since
 *   red    noRunEver      no run has ever completed: an assistant that has never worked
 *   red    stale          the last success is over 24h old — a whole day of nothing is not quiet
 *   amber  intermittent   failures in the last hour, but runs are also completing
 *   amber  notToday       the last success was yesterday: fine at 00:30, worth a look at 16:00
 *   green  healthy        a success today and no failures in the last hour
 *
 * ONE DELIBERATE DEVIATION from the brief, which asks for `"Never" when no run today`. "Never"
 * is shown when nothing has EVER completed; when the last success was two days ago the card
 * shows that timestamp and goes red, because "Never" would be false and the date is the more
 * useful thing to hand the person now reading it. Both cases are red either way.
 */

export type IsabellaHealthLevel = "green" | "amber" | "red";

/** Why the level is what it is. A code rather than a sentence, so tests and copy agree. */
export type IsabellaHealthReason =
  | "failing"
  | "noRunEver"
  | "stale"
  | "intermittent"
  | "notToday"
  | "healthy";

export interface IsabellaHealthInput {
  /** MAX(created_at) over ai_runs WHERE status = 'completed'. Null when there is none. */
  lastCompletedAt: string | Date | null;
  /** COUNT(*) over ai_runs WHERE status = 'failed' AND created_at >= now() - 60 min. */
  errorsLast60Min: number | null;
  /** The commonest `error_message` in that window; null when there were no failures. */
  commonestError: string | null;
  /** Injected so the verdict is a pure function of its arguments. Defaults to the wall clock. */
  now?: Date;
}

export interface IsabellaHealthVerdict {
  level: IsabellaHealthLevel;
  reason: IsabellaHealthReason;
  /** Parsed, or null when absent/unparseable. */
  lastCompletedAt: Date | null;
  /** True only when nothing has ever completed — the card's "Never". */
  never: boolean;
  /** Normalised: negative, NaN and null all become 0. */
  errorsLast60Min: number;
  commonestError: string | null;
}

const MINUTE = 60_000;
export const ERROR_WINDOW_MS = 60 * MINUTE;
export const STALE_MS = 24 * 60 * MINUTE;

/** Local-calendar-day comparison. `toDateString()` is date-only, so it is the day test. */
function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function parse(value: string | Date | null): Date | null {
  if (value === null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isabellaHealth(input: IsabellaHealthInput): IsabellaHealthVerdict {
  const now = input.now ?? new Date();
  const last = parse(input.lastCompletedAt);

  // A count that arrives as null (PostgREST when the header is absent) or as anything
  // non-finite is treated as "none observed" rather than as a failure — inventing failures from
  // a broken read would cry wolf. A read that FAILS outright is the card's problem, not this
  // function's: it renders an explicit unknown state instead of calling this at all.
  const raw = Number(input.errorsLast60Min);
  const errors = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const commonestError = errors > 0 ? (input.commonestError?.trim() || null) : null;

  const succeededWithinWindow = last !== null && now.getTime() - last.getTime() < ERROR_WINDOW_MS;

  const verdict = (level: IsabellaHealthLevel, reason: IsabellaHealthReason): IsabellaHealthVerdict => ({
    level,
    reason,
    lastCompletedAt: last,
    never: last === null,
    errorsLast60Min: errors,
    commonestError,
  });

  // Failing NOW, and said first: it is the most actionable thing on the card, and it outranks
  // both staleness reds because it carries the error text with it.
  if (errors > 0 && !succeededWithinWindow) return verdict("red", "failing");
  if (last === null) return verdict("red", "noRunEver");
  if (now.getTime() - last.getTime() > STALE_MS) return verdict("red", "stale");
  if (errors > 0) return verdict("amber", "intermittent");
  if (!sameDay(last, now)) return verdict("amber", "notToday");
  return verdict("green", "healthy");
}

/**
 * The commonest string in a list, ties broken by whichever appeared FIRST.
 *
 * The caller passes the failure rows newest-first, so a tie resolves to the most recent error —
 * the one an admin acting on this card is about to go and look at.
 */
export function commonestOf(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [s, n] of counts) {
    if (n > bestCount) {
      best = s;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Error text, shortened for a card that is one of two on a row.
 *
 * Anthropic's messages are a sentence or two and the useful part is at the front
 * ("Your credit balance is too low to access the Anthropic API…"), so this truncates rather
 * than eliding the middle. The full string stays available as a `title`.
 */
export function summariseError(message: string | null, max = 110): string | null {
  if (!message) return null;
  const one = message.replace(/\s+/g, " ").trim();
  if (!one) return null;
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}
