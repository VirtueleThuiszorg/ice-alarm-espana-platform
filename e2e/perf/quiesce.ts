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

/**
 * HOW MUCH THE PAGE ASKS FOR AFTER IT HAS FINISHED LOADING.
 *
 * ── WHY QUIESCENCE ALONE IS NOT ENOUGH ──────────────────────────────────────
 *
 * `quiesce` answers "has the load finished". It cannot answer "does this page
 * ever stop", and the difference is not academic — it is how the runaway loop on
 * /call-centre/alerts stayed invisible to the gate that was supposed to catch it.
 *
 * Measured, on a build with the loop present, mobile profile:
 *
 *     4x CPU throttled:   17 calls at quiescence, quiet declared,
 *                         390 calls ten seconds later
 *     unthrottled:        1,729 calls at quiescence, never quiet
 *
 * Under throttling the page is slow enough to reach a genuine 600 ms of quiet
 * BEFORE the alerts land and the loop starts. The gate then photographed a
 * perfectly ordinary 17-query load and passed a page that went on to issue
 * hundreds. The slower the machine, the more likely the gate misses it — the
 * exact opposite of what a performance gate should do.
 *
 * ── WHAT THIS MEASURES, AND WHY A RATE ──────────────────────────────────────
 *
 * After the load settles, watch for a fixed window and count what arrives. A
 * page at rest is not silent — a realtime event, a window refocus or a
 * background refresh is legitimate and occasional. A render loop is not
 * occasional: the one above ran at roughly 30 queries a second throttled and 130
 * unthrottled. Those two live orders of magnitude apart, so a rate separates them
 * without needing to know the right number for any particular page.
 *
 * It is machine-independent for the same reason: a loop is a loop on fast and
 * slow hardware alike, while the COUNT of a page's load is not.
 */
export async function idleQueryRate(
  page: Page,
  stub: { calls: RecordedCall[] },
  { windowMs = 5_000 } = {},
): Promise<{
  queries: number;
  windowMs: number;
  breakdown: string;
  /** Reads of the single busiest table in the window — a loop's fingerprint. */
  maxPerTable: number;
  worstTable: string;
}> {
  const before = stub.calls.length;
  await page.waitForTimeout(windowMs);
  const arrived = stub.calls.slice(before);

  // WHICH reads arrive at rest, not just how many. A budget on this number is
  // only defensible if somebody can see what it is allowing, and a loop and a
  // polling interval look identical until you can name the table.
  const perTable = new Map<string, number>();
  for (const c of arrived) {
    const t = c.path.split("?")[0].replace("/rest/v1/", "").replace("/functions/v1/", "fn:");
    perTable.set(t, (perTable.get(t) ?? 0) + 1);
  }
  const breakdown = [...perTable.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}=${n}`)
    .join(" ");

  /*
    THE SHAPE IS THE SIGNAL, NOT THE TOTAL — and the measurements say so.

    At rest, over five seconds, on the six gated routes:

        public.home / pricing / join.wizard / auth.login   0 queries
        member.dashboard   5  :: members=2 ai_agents=1 devices=1 conversations=1
        cc.alerts          7  :: alerts=1 admin_ideas=1 staff_presence=1 members=1
                                 isabella_assessment_notes=1 ai_agents=1 fn:twilio-token=1

    Seven queries sounds like a lot until you see that it is seven DIFFERENT
    tables, once each: the tail of lazily-mounted panels finishing their first
    read. The render loop this gate exists to catch looked like `members=206` —
    one table, over and over.

    So the gate is on the worst single table, not the sum. A total would have to
    be set above 7 to let an ordinary call-centre screen through, and 7 is already
    within a factor of three of a slow loop; the per-table maximum separates them
    by two orders of magnitude and needs no tuning as panels are added.
  */
  const maxPerTable = perTable.size === 0 ? 0 : Math.max(...perTable.values());
  const worstTable = [...perTable.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return { queries: arrived.length, windowMs, breakdown, maxPerTable, worstTable };
}
