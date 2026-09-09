import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Sends periodic heartbeat pings to staff_presence while the staff member is on duty.
 * Also listens for browser online/offline events to update presence immediately.
 *
 * PRESENCE IS NOT DUTY, and the two must not be confused. `staff.is_on_call` is a DECLARATION —
 * an operator says "I am on duty" and the escalation ladder trusts it, calling their mobile.
 * `staff_presence` is an OBSERVATION: is a browser of theirs alive right now. So a closed tab
 * marks them offline here and leaves the declaration alone (Lee's dashboard notes, 9 Sep, item 7).
 *
 * `session_started_at` IS ONLY WRITTEN ONCE PER DUTY PERIOD. It used to be sent with every ping
 * — `session_started_at: new Date().toISOString()` inside the interval — so it always equalled
 * `last_heartbeat_at`, and "on duty since" read as "on duty for 0 seconds" forever. The first
 * ping of a period upserts it; every later ping updates only the two fields it actually
 * observes.
 */
export function useStaffHeartbeat(staffId: string | null, isOnDuty: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** False until the first ping of the current duty period has been sent. */
  const sessionOpenRef = useRef(false);

  const sendHeartbeat = useCallback(async () => {
    if (!staffId) return;

    try {
      if (sessionOpenRef.current) {
        // A later ping: it observes that the browser is still alive, and nothing else.
        await supabase
          .from("staff_presence")
          .update({ last_heartbeat_at: new Date().toISOString(), is_online: true })
          .eq("staff_id", staffId);
        return;
      }

      const now = new Date().toISOString();
      await supabase.from("staff_presence").upsert(
        {
          staff_id: staffId,
          last_heartbeat_at: now,
          is_online: true,
          session_started_at: now,
        },
        {
          onConflict: "staff_id",
          ignoreDuplicates: false,
        }
      );
      sessionOpenRef.current = true;
    } catch (err) {
      console.error("Heartbeat failed:", err);
    }
  }, [staffId]);

  const markOffline = useCallback(async () => {
    if (!staffId) return;
    // The next duty period starts a new session, so the next first ping must stamp it again.
    sessionOpenRef.current = false;

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
      // NOTHING TO CLEAR HERE. This branch used to call clearInterval as well, which read like
      // the line doing the work — but React runs the previous effect's cleanup BEFORE this body
      // on every dependency change, and that cleanup already clears the interval. A mutation
      // deleting the copy here changed no behaviour and no test, which is what dead code looks
      // like from the outside; the cleanup below is the single place that stops the timer.
      //
      // Mark offline when going OFF duty — but only if a session of ours was open.
      //
      // This effect's own cleanup already calls markOffline, and it runs first when `isOnDuty`
      // flips, so an unguarded call here wrote `is_online = false` TWICE on every transition.
      // The guard also means a page loaded while off duty writes nothing at all: we have
      // observed nothing about that operator's presence, and saying so is the honest answer —
      // a stale `is_online` from a crashed tab is staff-shift-monitor's job, not a guess made
      // by whichever browser happens to open next.
      if (staffId && !isOnDuty && sessionOpenRef.current) {
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
