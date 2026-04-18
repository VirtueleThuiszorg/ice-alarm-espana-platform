import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn("[Sentry] No DSN configured — error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: `ice-alarm-espana@${import.meta.env.VITE_APP_VERSION || "0.0.0"}`,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Performance monitoring
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.2 : 1.0,

    // Session replay for error sessions
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    // Filter out noisy errors
    ignoreErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection",
      "dynamically imported module",
      "Loading chunk",
      "Network request failed",
      "AbortError",
    ],

    beforeSend(event) {
      // Strip PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
            // Remove auth tokens from URLs
            if (breadcrumb.data?.url) {
              try {
                const url = new URL(breadcrumb.data.url);
                url.searchParams.delete("token");
                url.searchParams.delete("apikey");
                breadcrumb.data.url = url.toString();
              } catch {
                // Not a valid URL, leave as-is
              }
            }
          }
          return breadcrumb;
        });
      }
      return event;
    },
  });
}

// Helper to set user context after login
export function setSentryUser(user: { id: string; email?: string; role?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

// Helper to clear user context on logout
export function clearSentryUser() {
  Sentry.setUser(null);
}

// Helper to capture custom events
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  Sentry.captureMessage(message, level);
}

export { Sentry };
