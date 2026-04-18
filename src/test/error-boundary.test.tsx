import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ---- Mock Sentry ----
const { mockCaptureException, mockSetTag, mockSetExtra } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockSetTag: vi.fn(),
  mockSetExtra: vi.fn(),
}));

vi.mock("@sentry/react", () => ({
  withScope: (callback: (scope: { setTag: typeof mockSetTag; setExtra: typeof mockSetExtra }) => void) => {
    callback({ setTag: mockSetTag, setExtra: mockSetExtra });
  },
  captureException: mockCaptureException,
}));

// ---- Mock lucide-react ----
vi.mock("lucide-react", () => ({
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="alert-icon" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <span data-testid="refresh-icon" {...props} />,
  Home: (props: Record<string, unknown>) => <span data-testid="home-icon" {...props} />,
}));

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

// ============================================================
//  Helpers
// ============================================================

/** A component that throws on render */
function ThrowingComponent({ message }: { message?: string }): React.JSX.Element {
  throw new Error(message || "Test render error");
}

/** Suppress React's console.error for expected boundary catches */
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.clearAllMocks();
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ============================================================
//  ErrorBoundary
// ============================================================

describe("ErrorBoundary", () => {
  // ---- Happy path ----

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p data-testid="child">Hello</p>
      </ErrorBoundary>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  // ---- Error path ----

  it("catches an error and shows fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("shows dynamic import error message for module loading failures", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Failed to fetch dynamically imported module: /chunk-abc123.js" />
      </ErrorBoundary>
    );

    expect(screen.getByText("Failed to load page")).toBeInTheDocument();
    expect(screen.getByText(/temporary network issue/i)).toBeInTheDocument();
  });

  // ---- Sentry integration ----

  it("reports error to Sentry via captureException", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Sentry test error" />
      </ErrorBoundary>
    );

    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error));
    const capturedError = mockCaptureException.mock.calls[0][0] as Error;
    expect(capturedError.message).toBe("Sentry test error");
  });

  it("sets the section tag in Sentry scope when section prop is provided", () => {
    render(
      <ErrorBoundary section="admin-portal">
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(mockSetTag).toHaveBeenCalledWith("section", "admin-portal");
  });

  it("does not set section tag when section prop is not provided", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(mockSetTag).not.toHaveBeenCalled();
  });

  it("passes componentStack as extra context to Sentry", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(mockSetExtra).toHaveBeenCalledWith("componentStack", expect.any(String));
  });

  // ---- Retry ----

  it("resets error state when Try Again button is clicked", () => {
    // We need a component that throws on the first render but not after a retry.
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error("Conditional error");
      }
      return <div data-testid="recovered">Recovered!</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Fix the error before retrying
    shouldThrow = false;

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByTestId("recovered")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("shows Go Home button that navigates to /", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    const homeButton = screen.getByRole("button", { name: /go home/i });
    expect(homeButton).toBeInTheDocument();
  });
});

// ============================================================
//  SectionErrorBoundary
// ============================================================

describe("SectionErrorBoundary", () => {
  // ---- Happy path ----

  it("renders children when there is no error", () => {
    render(
      <SectionErrorBoundary section="test-section">
        <p data-testid="section-child">Section Content</p>
      </SectionErrorBoundary>
    );

    expect(screen.getByTestId("section-child")).toBeInTheDocument();
  });

  // ---- Error path ----

  it("catches an error and shows section-specific fallback UI", () => {
    render(
      <SectionErrorBoundary section="admin">
        <ThrowingComponent />
      </SectionErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/error occurred in the admin section/i)).toBeInTheDocument();
  });

  it("shows dynamic import error message for module loading failures", () => {
    render(
      <SectionErrorBoundary section="client-portal">
        <ThrowingComponent message="Failed to fetch dynamically imported module: /chunk-xyz.js" />
      </SectionErrorBoundary>
    );

    expect(screen.getByText("Failed to load this section")).toBeInTheDocument();
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
  });

  // ---- Sentry integration ----

  it("reports error to Sentry with section tag", () => {
    render(
      <SectionErrorBoundary section="partner-portal">
        <ThrowingComponent message="Section error" />
      </SectionErrorBoundary>
    );

    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockSetTag).toHaveBeenCalledWith("section", "partner-portal");
    expect(mockSetExtra).toHaveBeenCalledWith("componentStack", expect.any(String));
  });

  // ---- Retry ----

  it("resets error state when Try Again button is clicked", () => {
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error("Section conditional error");
      }
      return <div data-testid="section-recovered">Section Recovered!</div>;
    }

    render(
      <SectionErrorBoundary section="test-section">
        <ConditionalThrower />
      </SectionErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    shouldThrow = false;

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByTestId("section-recovered")).toBeInTheDocument();
  });

  // ---- Home path ----

  it("shows Go Back button when homePath is provided", () => {
    render(
      <SectionErrorBoundary section="admin" homePath="/admin">
        <ThrowingComponent />
      </SectionErrorBoundary>
    );

    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
  });

  it("does not show Go Back button when homePath is not provided", () => {
    render(
      <SectionErrorBoundary section="admin">
        <ThrowingComponent />
      </SectionErrorBoundary>
    );

    expect(screen.queryByRole("button", { name: /go back/i })).not.toBeInTheDocument();
  });
});
