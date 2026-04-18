-- Enable Realtime publication for all SOS-related tables
-- These tables need real-time updates for the takeover screen

-- Conference rooms — status changes, SID updates
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.conference_rooms;

-- Conference participants — join/leave/mute events
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.conference_participants;

-- Isabella assessment notes — live feed in takeover screen
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.isabella_assessment_notes;

-- Alert escalations — escalation chain visibility
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.alert_escalations;

-- Note: alerts table should already have Realtime enabled from existing setup
-- Note: shift_escalation_chain was added to Realtime in its own migration
