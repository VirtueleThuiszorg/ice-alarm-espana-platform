import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Label for Sentry to identify which section errored */
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    Sentry.withScope((scope) => {
      if (this.props.section) {
        scope.setTag("section", this.props.section);
      }
      scope.setExtra("componentStack", errorInfo.componentStack);
      Sentry.captureException(error);
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    // Force a page reload for dynamic import failures
    if (this.state.error?.message?.includes("dynamically imported module")) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDynamicImportError = this.state.error?.message?.includes(
        "dynamically imported module"
      );

      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4 p-8 max-w-md">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-semibold">
              {isDynamicImportError
                ? "Failed to load page"
                : "Something went wrong"}
            </h2>
            <p className="text-muted-foreground">
              {isDynamicImportError
                ? "The page couldn't be loaded. This might be a temporary network issue."
                : "An unexpected error occurred. Please try again."}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={this.handleRetry} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                {isDynamicImportError ? "Reload Page" : "Try Again"}
              </Button>
              <Button
                onClick={() => (window.location.href = "/")}
                variant="outline"
              >
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
