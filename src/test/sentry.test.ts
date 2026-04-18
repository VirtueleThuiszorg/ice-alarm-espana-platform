import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock @sentry/react ----
const { mockInit, mockSetUser, mockCaptureMessage, mockBrowserTracingIntegration, mockReplayIntegration } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockSetUser: vi.fn(),
  mockCaptureMessage: vi.fn(),
  mockBrowserTracingIntegration: vi.fn(() => "browser-tracing-mock"),
  mockReplayIntegration: vi.fn(() => "replay-mock"),
}));

vi.mock("@sentry/react", () => ({
  init: mockInit,
  setUser: mockSetUser,
  captureMessage: mockCaptureMessage,
  browserTracingIntegration: mockBrowserTracingIntegration,
  replayIntegration: mockReplayIntegration,
}));

// We need to control import.meta.env, so we mock it via vi.stubEnv
// Note: Vitest supports `vi.stubEnv` for env variable mocking
import { initSentry, setSentryUser, clearSentryUser, captureMessage } from "@/lib/sentry";

// ============================================================
//  Tests
// ============================================================

describe("initSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a warning and does not call Sentry.init when no DSN is configured", () => {
    // By default in test env, VITE_SENTRY_DSN is not set
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Clear the env variable to make sure it's not set
    const originalDsn = import.meta.env.VITE_SENTRY_DSN;
    delete (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN;

    initSentry();

    expect(warnSpy).toHaveBeenCalledWith(
      "[Sentry] No DSN configured \u2014 error tracking disabled"
    );
    expect(mockInit).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    // Restore original value if it existed
    if (originalDsn !== undefined) {
      (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN = originalDsn;
    }
  });

  it("calls Sentry.init when a DSN is configured", () => {
    // Set a fake DSN
    (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN = "https://fake@sentry.io/12345";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    initSentry();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://fake@sentry.io/12345",
      })
    );

    warnSpy.mockRestore();
    delete (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN;
  });

  it("configures integrations when initializing", () => {
    (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN = "https://fake@sentry.io/12345";

    initSentry();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: expect.arrayContaining([
          "browser-tracing-mock",
          "replay-mock",
        ]),
      })
    );

    expect(mockBrowserTracingIntegration).toHaveBeenCalled();
    expect(mockReplayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      blockAllMedia: true,
    });

    delete (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN;
  });

  it("sets ignoreErrors filter list", () => {
    (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN = "https://fake@sentry.io/12345";

    initSentry();

    const initCall = mockInit.mock.calls[0][0];
    expect(initCall.ignoreErrors).toEqual(
      expect.arrayContaining([
        "ResizeObserver loop",
        "Non-Error promise rejection",
        "dynamically imported module",
        "Loading chunk",
        "Network request failed",
        "AbortError",
      ])
    );

    delete (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN;
  });

  it("provides a beforeSend function that strips tokens from breadcrumb URLs", () => {
    (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN = "https://fake@sentry.io/12345";

    initSentry();

    const initCall = mockInit.mock.calls[0][0];
    const beforeSend = initCall.beforeSend;

    // Create a mock event with a breadcrumb containing a token in the URL
    const event = {
      breadcrumbs: [
        {
          category: "fetch",
          data: {
            url: "https://api.example.com/data?token=secret123&apikey=key456&other=keep",
          },
        },
        {
          category: "ui",
          data: { target: "button" },
        },
      ],
    };

    const result = beforeSend(event);

    // Token and apikey should be stripped
    const fetchBreadcrumb = result.breadcrumbs[0];
    expect(fetchBreadcrumb.data.url).not.toContain("secret123");
    expect(fetchBreadcrumb.data.url).not.toContain("key456");
    expect(fetchBreadcrumb.data.url).toContain("other=keep");

    // Non-fetch breadcrumbs should be untouched
    const uiBreadcrumb = result.breadcrumbs[1];
    expect(uiBreadcrumb.data.target).toBe("button");

    delete (import.meta.env as Record<string, unknown>).VITE_SENTRY_DSN;
  });
});

describe("setSentryUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sentry.setUser with user info", () => {
    setSentryUser({ id: "user-123", email: "test@example.com", role: "member" });

    expect(mockSetUser).toHaveBeenCalledOnce();
    expect(mockSetUser).toHaveBeenCalledWith({
      id: "user-123",
      email: "test@example.com",
      role: "member",
    });
  });

  it("handles missing optional fields", () => {
    setSentryUser({ id: "user-456" });

    expect(mockSetUser).toHaveBeenCalledWith({
      id: "user-456",
      email: undefined,
      role: undefined,
    });
  });
});

describe("clearSentryUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sentry.setUser with null to clear context", () => {
    clearSentryUser();

    expect(mockSetUser).toHaveBeenCalledOnce();
    expect(mockSetUser).toHaveBeenCalledWith(null);
  });
});

describe("captureMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sentry.captureMessage with message and default level", () => {
    captureMessage("Something happened");

    expect(mockCaptureMessage).toHaveBeenCalledOnce();
    expect(mockCaptureMessage).toHaveBeenCalledWith("Something happened", "info");
  });

  it("calls Sentry.captureMessage with specified severity level", () => {
    captureMessage("Critical failure", "error");

    expect(mockCaptureMessage).toHaveBeenCalledWith("Critical failure", "error");
  });

  it("supports warning level", () => {
    captureMessage("Watch out", "warning");

    expect(mockCaptureMessage).toHaveBeenCalledWith("Watch out", "warning");
  });
});
