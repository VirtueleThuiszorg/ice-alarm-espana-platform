import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
  section: string;
  homePath?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Section-level error boundary for isolating failures within portal sections.
 * Each portal (admin, call-centre, client, partner) wraps its content with this
 * so that a crash in one section doesn't take down the whole app.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[${this.props.section}] Error caught:`, error, errorInfo);
    Sentry.withScope((scope) => {
      scope.setTag("section", this.props.section);
      scope.setExtra("componentStack", errorInfo.componentStack);
      Sentry.captureException(error);
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      const isDynamicImportError = this.state.error?.message?.includes(
        "dynamically imported module"
      );

      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4 p-8 max-w-md">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-semibold">
              {isDynamicImportError
                ? "Failed to load this section"
                : "Something went wrong"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isDynamicImportError
                ? "This section couldn't be loaded. Check your connection and try again."
                : `An error occurred in the ${this.props.section} section. Your other sections are unaffected.`}
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                onClick={isDynamicImportError ? () => window.location.reload() : this.handleRetry}
                variant="default"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {isDynamicImportError ? "Reload" : "Try Again"}
              </Button>
              {this.props.homePath && (
                <Button
                  onClick={() => (window.location.href = this.props.homePath!)}
                  variant="outline"
                  size="sm"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
