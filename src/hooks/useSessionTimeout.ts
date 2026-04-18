import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { TIMEOUTS } from "@/config/constants";

const TIMEOUT_MS = TIMEOUTS.SESSION_IDLE;
const WARNING_MS = TIMEOUTS.SESSION_WARNING;

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "mousemove",
] as const;

/**
 * Auto-logout after inactivity. Returns warning state so the UI can show
 * a "you'll be logged out soon" modal.
 */
export function useSessionTimeout() {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();

  const resetTimers = useCallback(() => {
    if (!user) return;

    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Hide warning if it was showing
    setShowWarning(false);

    // Set warning timer
    warningRef.current = setTimeout(() => {
      setShowWarning(true);
    }, TIMEOUT_MS - WARNING_MS);

    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      signOut();
    }, TIMEOUT_MS);
  }, [user, signOut]);

  const extendSession = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!user) {
      setShowWarning(false);
      return;
    }

    // Throttle activity events to avoid excessive timer resets
    let lastActivity = Date.now();
    const THROTTLE_MS = TIMEOUTS.ACTIVITY_THROTTLE;

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivity > THROTTLE_MS) {
        lastActivity = now;
        resetTimers();
      }
    };

    // Start timers
    resetTimers();

    // Listen for user activity
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [user, resetTimers]);

  return { showWarning, extendSession };
}
