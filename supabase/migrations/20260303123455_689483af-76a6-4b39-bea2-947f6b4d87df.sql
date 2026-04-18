
-- 1. staff_presence — heartbeat tracking for on-duty staff
CREATE TABLE IF NOT EXISTS public.staff_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_online BOOLEAN NOT NULL DEFAULT true,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_presence_staff_id_unique UNIQUE (staff_id)
);

COMMENT ON TABLE public.staff_presence IS
  'Tracks real-time heartbeat pings from on-duty call centre staff';

ALTER TABLE public.staff_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage own presence"
  ON public.staff_presence
  FOR ALL
  USING (
    staff_id IN (
      SELECT id FROM public.staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    staff_id IN (
      SELECT id FROM public.staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all presence"
  ON public.staff_presence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'call_centre_supervisor')
    )
  );

-- 2. shift_alert_log — deduplication for shift monitoring alerts
CREATE TABLE IF NOT EXISTS public.shift_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('no_show', 'no_coverage', 'disconnected')),
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

COMMENT ON TABLE public.shift_alert_log IS
  'Deduplication log for shift monitoring alerts — prevents spam notifications';

CREATE UNIQUE INDEX shift_alert_log_dedup_idx
  ON public.shift_alert_log (alert_type, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid), shift_date, shift_type)
  WHERE resolved_at IS NULL;

ALTER TABLE public.shift_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage shift alerts"
  ON public.shift_alert_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'call_centre_supervisor')
    )
  );

-- 3. Add whatsapp_shift_alerts column to notification_settings
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS whatsapp_shift_alerts BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.notification_settings.whatsapp_shift_alerts IS
  'Whether to send WhatsApp notifications for shift monitoring alerts';

-- Enable realtime for staff_presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_presence;
