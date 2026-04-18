/**
 * Web Vitals monitoring and performance tracking.
 * Reports Core Web Vitals (LCP, FID, CLS, TTFB, INP) and custom metrics.
 */

interface Metric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  id: string;
}

type MetricCallback = (metric: Metric) => void;

/**
 * Observe Core Web Vitals using the PerformanceObserver API.
 * Falls back gracefully if the API isn't available.
 */
export function observeWebVitals(onMetric: MetricCallback) {
  if (typeof PerformanceObserver === "undefined") return;

  // Largest Contentful Paint
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as any;
      if (lastEntry) {
        const value = lastEntry.startTime;
        onMetric({
          name: "LCP",
          value,
          rating: value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor",
          delta: value,
          id: `lcp-${Date.now()}`,
        });
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    // LCP not supported
  }

  // First Input Delay / Interaction to Next Paint
  try {
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const value = (entry as any).processingStart - entry.startTime;
        onMetric({
          name: "FID",
          value,
          rating: value <= 100 ? "good" : value <= 300 ? "needs-improvement" : "poor",
          delta: value,
          id: `fid-${Date.now()}`,
        });
      }
    });
    fidObserver.observe({ type: "first-input", buffered: true });
  } catch {
    // FID not supported
  }

  // Cumulative Layout Shift
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      onMetric({
        name: "CLS",
        value: clsValue,
        rating: clsValue <= 0.1 ? "good" : clsValue <= 0.25 ? "needs-improvement" : "poor",
        delta: clsValue,
        id: `cls-${Date.now()}`,
      });
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch {
    // CLS not supported
  }

  // Time to First Byte
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (nav) {
      const value = nav.responseStart - nav.requestStart;
      onMetric({
        name: "TTFB",
        value,
        rating: value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor",
        delta: value,
        id: `ttfb-${Date.now()}`,
      });
    }
  } catch {
    // TTFB not supported
  }
}

/**
 * Default reporter that logs to console in dev and sends to Sentry in prod.
 */
export function initWebVitalsReporting() {
  observeWebVitals((metric) => {
    if (import.meta.env.DEV) {
      const color =
        metric.rating === "good"
          ? "color: green"
          : metric.rating === "needs-improvement"
            ? "color: orange"
            : "color: red";

      console.log(
        `%c[WebVitals] ${metric.name}: ${metric.value.toFixed(1)} (${metric.rating})`,
        color
      );
    }

    // Send to Sentry as a custom measurement
    try {
      import("@sentry/react").then((Sentry) => {
        Sentry.setMeasurement(metric.name, metric.value, "millisecond");
      });
    } catch {
      // Sentry not available
    }
  });
}
