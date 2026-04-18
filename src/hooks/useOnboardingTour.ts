import { useState, useCallback } from "react";

const STORAGE_PREFIX = "ice_tour_";

function storageKey(tourKey: string) {
  return `${STORAGE_PREFIX}${tourKey}_completed`;
}

/**
 * Hook for managing onboarding tour state.
 *
 * Usage:
 *   const { activeTourKey, startTour, isTourCompleted, resetTour, handleTourComplete } = useOnboardingTour();
 *
 *   // Render the tour when activeTourKey matches
 *   {activeTourKey === "memberDashboard" && (
 *     <OnboardingTour
 *       steps={memberDashboardTour}
 *       tourKey="memberDashboard"
 *       onComplete={handleTourComplete}
 *     />
 *   )}
 */
export function useOnboardingTour() {
  const [activeTourKey, setActiveTourKey] = useState<string | null>(null);

  /**
   * Check whether a tour has already been completed by the current user.
   */
  const isTourCompleted = useCallback((tourKey: string): boolean => {
    try {
      return localStorage.getItem(storageKey(tourKey)) === "true";
    } catch {
      return false;
    }
  }, []);

  /**
   * Manually trigger a tour. If the tour has already been completed it
   * will not start unless you `resetTour` first.
   */
  const startTour = useCallback(
    (tourKey: string) => {
      if (!isTourCompleted(tourKey)) {
        setActiveTourKey(tourKey);
      }
    },
    [isTourCompleted],
  );

  /**
   * Force-start a tour even if it was previously completed.
   * Useful for "Replay tour" buttons.
   */
  const forceStartTour = useCallback((tourKey: string) => {
    try {
      localStorage.removeItem(storageKey(tourKey));
    } catch {
      // ignore
    }
    setActiveTourKey(tourKey);
  }, []);

  /**
   * Reset a tour so it will display again on next visit.
   */
  const resetTour = useCallback((tourKey: string) => {
    try {
      localStorage.removeItem(storageKey(tourKey));
    } catch {
      // ignore
    }
  }, []);

  /**
   * Reset all tours.
   */
  const resetAllTours = useCallback(() => {
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith(STORAGE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  /**
   * Callback to pass as `onComplete` to `<OnboardingTour />`.
   */
  const handleTourComplete = useCallback(() => {
    setActiveTourKey(null);
  }, []);

  return {
    /** The key of the currently-active tour, or null */
    activeTourKey,
    startTour,
    forceStartTour,
    isTourCompleted,
    resetTour,
    resetAllTours,
    handleTourComplete,
  };
}
