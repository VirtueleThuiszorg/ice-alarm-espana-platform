-- staff_presence describes a BROWSER, not a duty period.
--
-- The table comment has said, since the table was created in 20260303123455:
--
--     'Tracks real-time heartbeat pings from on-duty call centre staff'
--
-- and the client matched it: `useStaffHeartbeat` took an `isOnDuty` argument and returned early
-- unless it was set, so `last_heartbeat_at` only ever advanced while `staff.is_on_call` was true.
--
-- That made the OBSERVATION a function of the DECLARATION, and it emptied out the middle state
-- the shift monitor turns on. `supabase/functions/_shared/presence.ts` defines three:
--
--     ON DUTY               is_on_call — alerts route to them
--     PRESENT, NOT ON DUTY  a fresh heartbeat and no button — a nudge, NOT a no-show
--     ABSENT                neither — the real no-show
--
-- The second could not occur: a heartbeat could only be fresh when the first was already true.
-- Travis Nelison's row (SHIFT_NOSHOW_FINDINGS.md) carried `last_heartbeat_at` equal to
-- `session_started_at` to the millisecond and three days stale, while `is_on_call` was false.
--
-- The client gate is removed in the same change as this migration. This corrects the comment so
-- the contract the table states is the contract the table has — a comment that describes the old
-- behaviour is how the next person rebuilds the defect.
--
-- REVERSIBLE: a comment. `COMMENT ON TABLE ... IS '<the old text>'` restores it exactly.
COMMENT ON TABLE public.staff_presence IS
  'Observation of whether a browser belonging to this staff member is alive right now: '
  'heartbeat pings every 30s from any signed-in staff session, on duty or not. '
  'NOT a duty declaration — that is staff.is_on_call. See supabase/functions/_shared/presence.ts '
  'for the three states these two columns combine into.';
