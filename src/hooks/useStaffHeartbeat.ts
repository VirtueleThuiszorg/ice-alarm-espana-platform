import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Sends periodic heartbeat pings to staff_presence while the staff member is on duty.
 * Also listens for browser online/offline events to update presence immediately.
 */
export function useStaffHeartbeat(staffId: string | null, isOnDuty: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async () => {
    if (!staffId) return;

    try {
      await supabase.from("staff_presence").upsert(
        {
          staff_id: staffId,
          last_heartbeat_at: new Date().toISOString(),
          is_online: true,
          session_started_at: new Date().toISOString(),
        },
        {
          onConflict: "staff_id",
          ignoreDuplicates: false,
        }
      );
    } catch (err) {
      console.error("Heartbeat failed:", err);
    }
  }, [staffId]);

  const markOffline = useCallback(async () => {
    if (!staffId) return;

    try {
      await supabase
        .from("staff_presence")
        .update({ is_online: false })
        .eq("staff_id", staffId);
    } catch (err) {
      console.error("Mark offline failed:", err);
    }
  }, [staffId]);

  useEffect(() => {
    if (!staffId || !isOnDuty) {
      // Clean up if going off duty
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Mark offline when going off duty
      if (staffId && !isOnDuty) {
        markOffline();
      }
      return;
    }

    // Send initial heartbeat immediately
    sendHeartbeat();

    // Set up periodic heartbeat
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Browser online/offline detection
    const handleOnline = () => {
      sendHeartbeat();
    };

    const handleOffline = () => {
      markOffline();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      // Mark offline on unmount (tab close / navigation away)
      markOffline();
    };
  }, [staffId, isOnDuty, sendHeartbeat, markOffline]);
}
