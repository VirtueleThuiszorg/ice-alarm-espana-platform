import type { Page } from "@playwright/test";
import type { RecordedCall } from "../helpers/supabaseStub";

/**
 * WAIT UNTIL THE PAGE HAS STOPPED ASKING THE DATABASE FOR THINGS.
 *
 * ── WHY A QUERY COUNT WAS NOT REPRODUCIBLE ──────────────────────────────────
 *
 * `settle()` waits for ANIMATIONS. That is the right question for a screenshot
 * and the wrong one for a query count: it says the page has stopped MOVING, not
 * that it has stopped FETCHING. Counting there photographs whichever reads
 * happen to have landed, so a page whose reads are still in flight reports a
 * number that depends on how the run was scheduled.
 *
 * `cc.alerts` measured 17, then 28, then 36 across three runs of the same code.
 * Nothing about the page changed. What changed was how far its per-alert `staff`
 * lookups had got when the shutter closed — and, perversely, a page made FASTER
 * gets further and reports a WORSE number. The CI gate failed a font change on
 * that mechanism, which is a gate reporting noise rather than regressions.
 *
 * ── WHAT THIS MEASURES INSTEAD ──────────────────────────────────────────────
 *
 * The whole load: keep waiting while new Supabase calls keep arriving, and stop
 * once none has arrived for `quietMs`. That is the number the budget is actually
 * about — "DB queries per page load" — and it is stable, because it no longer
 * depends on where in the waterfall the measurement happened to look.
 *
 * It also makes the numbers BIGGER than the snapshot ones, which is the point: a
 * page reading 36 rows one at a time was always doing that, and the old count
 * only ever saw part of it.
 *
 * ── THE TWO WAYS OUT, AND WHY BOTH ARE RIGHT ────────────────────────────────
 *
 * Quiet for `quietMs` is the normal exit. `timeoutMs` is the other, and it is not
 * a failure: a page that polls faster than the quiet window never goes quiet, and
 * hanging until the job times out would be worse than returning the count so far.
 * Whether that happened is returned rather than swallowed, so a caller can say so
 * instead of quietly reporting a truncated load.
 */
export interface QuiesceResult {
  /** Calls seen when the page went quiet — a copy, so later traffic cannot alter it. */
  calls: RecordedCall[];
  /** True when the quiet window was never reached and the cap ended the wait. */
  timedOut: boolean;
}

export async function quiesce(
  page: Page,
  stub: { calls: RecordedCall[] },
  { quietMs = 600, timeoutMs = 15_000 } = {},
): Promise<QuiesceResult> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = stub.calls.length;
  let quietSince = Date.now();

  for (;;) {
    // Polled at a fraction of the quiet window so the moment it goes quiet is
    // detected promptly rather than up to a full window late.
    await page.waitForTimeout(100);

    if (stub.calls.length !== lastCount) {
      lastCount = stub.calls.length;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return { calls: [...stub.calls], timedOut: false };
    }

    if (Date.now() >= deadline) {
      return { calls: [...stub.calls], timedOut: true };
    }
  }
}
