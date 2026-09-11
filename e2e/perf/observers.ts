/**
 * THE BROWSER'S OWN NUMBERS, not the harness's guesses.
 *
 * Installed with `page.addInitScript`, so the observers exist before the first byte
 * of app code runs. Everything here is read back through `page.evaluate` after the
 * route has settled.
 *
 * Why PerformanceObserver rather than timing around `page.goto`: `goto` resolves on
 * a load event, which is not when a human sees content, and it cannot see a layout
 * shift or a task that blocked the main thread for 400ms. LCP, CLS and longtask are
 * the metrics the browser itself computes and the ones Lighthouse budgets against,
 * so the CI gate and this report are measuring the same thing.
 */

export interface CollectedVitals {
  lcpMs: number;
  cls: number;
  longTasksMs: number[];
  requestCount: number;
  totalBytes: number;
}

declare global {
  interface Window {
    __perf__?: {
      lcp: number;
      cls: number;
      longTasks: number[];
      /** Reset the transition clock. Called immediately before a nav click. */
      mark(): void;
      markedAt: number;
    };
  }
}

/**
 * The script string installed into every page. It is a string rather than a
 * function reference because `addInitScript` serialises it into a fresh realm
 * where nothing from this module exists.
 */
export const INSTALL_OBSERVERS = `
(() => {
  const state = { lcp: 0, cls: 0, longTasks: [], markedAt: 0 };
  state.mark = () => { state.markedAt = performance.now(); };
  window.__perf__ = state;

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // LCP is reported repeatedly as bigger elements paint; the LAST one wins.
        state.lcp = entry.startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* not supported: stays 0, and 0 would be a suspiciously good score,
                which is why the runner asserts LCP > 0 before believing it. */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Shifts the user caused by interacting are excluded, exactly as CWV does.
        if (!entry.hadRecentInput) state.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* ignored */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* ignored */ }
})();
`;

/** Read the vitals plus the resource totals back out of the page. */
export const READ_VITALS = `
(() => {
  const p = window.__perf__ || { lcp: 0, cls: 0, longTasks: [] };
  const resources = performance.getEntriesByType('resource');
  // transferSize is 0 for a cache hit and for an opaque response. On a cold context
  // neither applies, but decodedBodySize is the honest fallback so a zero here is a
  // genuine "nothing was fetched" rather than a measurement gap.
  const totalBytes = resources.reduce(
    (sum, r) => sum + (r.transferSize || r.decodedBodySize || 0),
    0,
  );
  return {
    lcpMs: p.lcp,
    cls: p.cls,
    longTasksMs: p.longTasks.filter((d) => d > 50),
    requestCount: resources.length,
    totalBytes,
  };
})()
`;

/** Milliseconds from the last `mark()` to now — the route transition timer. */
export const READ_SINCE_MARK = `performance.now() - (window.__perf__ ? window.__perf__.markedAt : 0)`;
