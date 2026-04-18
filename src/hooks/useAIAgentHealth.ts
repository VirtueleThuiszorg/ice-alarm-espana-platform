import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AgentHealthStatus = "online" | "degraded" | "offline";

interface AIAgentHealthState {
  agentStatus: AgentHealthStatus;
  isHealthy: boolean;
  lastResponseTime: number | null; // milliseconds
  lastCheckedAt: Date | null;
  isChecking: boolean;
  errorMessage: string | null;
}

const HEALTH_CHECK_INTERVAL_MS = 60_000; // 60 seconds
const DEGRADED_THRESHOLD_MS = 5_000; // 5 seconds response time = degraded
const OFFLINE_TIMEOUT_MS = 15_000; // 15 seconds = consider offline

export function useAIAgentHealth(enabled: boolean = true) {
  const [state, setState] = useState<AIAgentHealthState>({
    agentStatus: "offline",
    isHealthy: false,
    lastResponseTime: null,
    lastCheckedAt: null,
    isChecking: false,
    errorMessage: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  /**
   * Ping the ai-run edge function with a lightweight health check.
   */
  const checkHealth = useCallback(async () => {
    if (!isMountedRef.current) return;

    setState((prev) => ({ ...prev, isChecking: true }));

    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        OFFLINE_TIMEOUT_MS
      );

      const { error } = await supabase.functions.invoke("ai-run", {
        body: {
          agentKey: "customer_service_expert",
          context: {
            healthCheck: true,
            currentMessage: "ping",
            source: "health_check",
          },
        },
      });

      clearTimeout(timeoutId);

      const elapsed = Math.round(performance.now() - startTime);

      if (!isMountedRef.current) return;

      if (error) {
        setState({
          agentStatus: "offline",
          isHealthy: false,
          lastResponseTime: elapsed,
          lastCheckedAt: new Date(),
          isChecking: false,
          errorMessage: error.message || "Health check failed",
        });
        return;
      }

      // Determine status based on response time
      let status: AgentHealthStatus = "online";
      if (elapsed > DEGRADED_THRESHOLD_MS) {
        status = "degraded";
      }

      setState({
        agentStatus: status,
        isHealthy: true,
        lastResponseTime: elapsed,
        lastCheckedAt: new Date(),
        isChecking: false,
        errorMessage: null,
      });
    } catch (error: any) {
      const elapsed = Math.round(performance.now() - startTime);

      if (!isMountedRef.current) return;

      setState({
        agentStatus: "offline",
        isHealthy: false,
        lastResponseTime: elapsed,
        lastCheckedAt: new Date(),
        isChecking: false,
        errorMessage:
          error.name === "AbortError"
            ? "Health check timed out"
            : error.message || "Unknown error",
      });
    }
  }, []);

  // Set up periodic health checking when enabled
  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      // Run an initial check
      checkHealth();

      // Set up periodic checks
      intervalRef.current = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);
    }

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, checkHealth]);

  return {
    agentStatus: state.agentStatus,
    isHealthy: state.isHealthy,
    lastResponseTime: state.lastResponseTime,
    lastCheckedAt: state.lastCheckedAt,
    isChecking: state.isChecking,
    errorMessage: state.errorMessage,
    checkHealth,
  };
}
