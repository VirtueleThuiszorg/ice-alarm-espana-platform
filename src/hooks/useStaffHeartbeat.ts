import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Sends periodic heartbeat pings to `staff_presence` while a staff member has the platform open.
 *
 * PRESENCE IS NOT DUTY, and the two must not be confused. `staff.is_on_call` is a DECLARATION —
 * an operator says "I am on duty" and the escalation ladder trusts it, calling their mobile.
 * `staff_presence` is an OBSERVATION: is a browser of theirs alive right now. So a closed tab
 * marks them offline here and leaves the declaration alone (Lee's dashboard notes, 9 Sep, item 7).
 *
 * ── WHY THIS NO LONGER TAKES `isOnDuty` ─────────────────────────────────────
 *
 * It used to return early unless the operator was on duty, so the ping only ever ran while
 * `staff.is_on_call` was true. That made the OBSERVATION a function of the DECLARATION — the two
 * things this comment says must not be confused — and it emptied out the state the whole no-show
 * fix turns on.
 *
 * `supabase/functions/_shared/presence.ts` defines three states, and its second is
 * PRESENT-BUT-NOT-ON-DUTY: "a fresh heartbeat and no button". Its header describes exactly the
 * operator this work is about — one "who worked a whole night shift with the platform open,
 * SENDING A HEARTBEAT EVERY THIRTY SECONDS, but who never pressed that button". That sentence was
 * not true of this hook. With the gate in place the middle state was unreachable: a heartbeat
 * could only be fresh when `is_on_call` was already true, in which case the person is ON DUTY and
 * the second branch of the rule never decides anything.
 *
 * Production bears it out. Travis Nelison's row (SHIFT_NOSHOW_FINDINGS.md) had
 * `last_heartbeat_at` EQUAL TO `session_started_at` to the millisecond, three days stale, while
 * `is_on_call` was false — the signature of a session that pinged once, when the button was last
 * pressed, and never again.
 *
 * So the gate is gone. A signed-in staff member with the platform open is observed as present,
 * which is what "observation" means, and the declaration is left entirely alone.
 *
 * `session_started_at` IS ONLY WRITTEN ONCE PER SESSION. It used to be sent with every ping —
 * `session_started_at: new Date().toISOString()` inside the interval — so it always equalled
 * `last_heartbeat_at`, and "on duty since" read as "on duty for 0 seconds" forever. The first
 * ping upserts it; every later ping updates only the two fields it actually observes.
 */
export function useStaffHeartbeat(staffId: string | null) {
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
    // NOTHING TO CLEAR HERE. React runs the previous effect's cleanup BEFORE this body on every
    // dependency change, and that cleanup already clears the interval. The cleanup below is the
    // single place that stops the timer.
    //
    // Going OFF DUTY no longer stops the ping or marks anybody offline. Duty is a declaration
    // about routing; presence is an observation about a browser. An operator who presses "Off
    // duty" and keeps the tab open is still THERE, and saying otherwise is what made the middle
    // state unreachable.
    if (!staffId) return;

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
  }, [staffId, sendHeartbeat, markOffline]);
}
