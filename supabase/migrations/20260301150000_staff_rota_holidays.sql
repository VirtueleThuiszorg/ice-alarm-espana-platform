-- Staff Rota, Holidays & Shift Cover System
-- Migration for 24/7 call centre scheduling

-- ============================================================
-- 1. Extend staff table with holiday/hours columns
-- ============================================================

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS annual_holiday_days INTEGER DEFAULT 22,
  ADD COLUMN IF NOT EXISTS contracted_hours_per_week NUMERIC DEFAULT 40;

-- ============================================================
-- 2. staff_shifts table
-- ============================================================

CREATE TABLE public.staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'night')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_confirmed BOOLEAN DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(staff_id, shift_date, shift_type)
);

-- ============================================================
-- 3. staff_holidays table
-- ============================================================

CREATE TABLE public.staff_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled')),
  total_days INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  reviewed_by UUID REFERENCES public.staff(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- ============================================================
-- 4. staff_shift_covers table
-- ============================================================

CREATE TABLE public.staff_shift_covers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  holiday_id UUID REFERENCES public.staff_holidays(id) ON DELETE SET NULL,
  original_staff_id UUID NOT NULL REFERENCES public.staff(id),
  cover_staff_id UUID NOT NULL REFERENCES public.staff(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  requested_by UUID REFERENCES public.staff(id),
  requested_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  response_note TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. Triggers: updated_at (function already exists)
-- ============================================================

CREATE TRIGGER update_staff_shifts_updated_at
  BEFORE UPDATE ON public.staff_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_holidays_updated_at
  BEFORE UPDATE ON public.staff_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_shift_covers_updated_at
  BEFORE UPDATE ON public.staff_shift_covers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. Indexes
-- ============================================================

CREATE INDEX idx_staff_shifts_date ON public.staff_shifts(shift_date);
CREATE INDEX idx_staff_shifts_staff_id ON public.staff_shifts(staff_id);
CREATE INDEX idx_staff_shifts_type_date ON public.staff_shifts(shift_type, shift_date);

CREATE INDEX idx_staff_holidays_staff_id ON public.staff_holidays(staff_id);
CREATE INDEX idx_staff_holidays_status ON public.staff_holidays(status);
CREATE INDEX idx_staff_holidays_dates ON public.staff_holidays(start_date, end_date);

CREATE INDEX idx_staff_shift_covers_status ON public.staff_shift_covers(status);
CREATE INDEX idx_staff_shift_covers_expires ON public.staff_shift_covers(expires_at) WHERE status = 'pending';
CREATE INDEX idx_staff_shift_covers_shift ON public.staff_shift_covers(shift_id);

-- ============================================================
-- 7. View: staff_holiday_balance (current year)
-- ============================================================

CREATE OR REPLACE VIEW public.staff_holiday_balance AS
SELECT
  s.id AS staff_id,
  s.first_name,
  s.last_name,
  s.annual_holiday_days,
  COALESCE(SUM(h.total_days) FILTER (WHERE h.status IN ('approved', 'requested')), 0)::INTEGER AS days_used_or_pending,
  COALESCE(SUM(h.total_days) FILTER (WHERE h.status = 'approved'), 0)::INTEGER AS days_approved,
  COALESCE(SUM(h.total_days) FILTER (WHERE h.status = 'requested'), 0)::INTEGER AS days_pending,
  (s.annual_holiday_days - COALESCE(SUM(h.total_days) FILTER (WHERE h.status IN ('approved', 'requested')), 0))::INTEGER AS days_remaining
FROM public.staff s
LEFT JOIN public.staff_holidays h ON h.staff_id = s.id
  AND EXTRACT(YEAR FROM h.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
  AND h.status IN ('approved', 'requested')
WHERE s.is_active = true
GROUP BY s.id, s.first_name, s.last_name, s.annual_holiday_days;

-- ============================================================
-- 8. View: staff_on_shift_now
--    Handles overnight shifts with 3-way UNION
-- ============================================================

CREATE OR REPLACE VIEW public.staff_on_shift_now AS
-- Today's morning/afternoon shifts that are currently active
SELECT ss.id, ss.staff_id, s.first_name, s.last_name, ss.shift_type, ss.start_time, ss.end_time, ss.shift_date
FROM public.staff_shifts ss
JOIN public.staff s ON s.id = ss.staff_id
WHERE ss.shift_date = CURRENT_DATE
  AND ss.shift_type IN ('morning', 'afternoon')
  AND CURRENT_TIME BETWEEN ss.start_time AND ss.end_time

UNION

-- Today's night shift starting at 23:00 (still today, after 23:00)
SELECT ss.id, ss.staff_id, s.first_name, s.last_name, ss.shift_type, ss.start_time, ss.end_time, ss.shift_date
FROM public.staff_shifts ss
JOIN public.staff s ON s.id = ss.staff_id
WHERE ss.shift_date = CURRENT_DATE
  AND ss.shift_type = 'night'
  AND CURRENT_TIME >= ss.start_time

UNION

-- Yesterday's night shift that extends past midnight (before 07:00 today)
SELECT ss.id, ss.staff_id, s.first_name, s.last_name, ss.shift_type, ss.start_time, ss.end_time, ss.shift_date
FROM public.staff_shifts ss
JOIN public.staff s ON s.id = ss.staff_id
WHERE ss.shift_date = CURRENT_DATE - INTERVAL '1 day'
  AND ss.shift_type = 'night'
  AND CURRENT_TIME < ss.end_time;

-- ============================================================
-- 9. Function: check_shift_coverage
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_shift_coverage(p_start DATE, p_end DATE)
RETURNS TABLE (
  check_date DATE,
  check_shift_type TEXT,
  is_covered BOOLEAN,
  staff_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH date_range AS (
    SELECT generate_series(p_start, p_end, '1 day'::interval)::date AS d
  ),
  shift_types AS (
    SELECT unnest(ARRAY['morning', 'afternoon', 'night']) AS st
  ),
  all_slots AS (
    SELECT dr.d, st.st FROM date_range dr CROSS JOIN shift_types st
  )
  SELECT
    a.d AS check_date,
    a.st AS check_shift_type,
    (ss.id IS NOT NULL) AS is_covered,
    CASE WHEN ss.id IS NOT NULL THEN s.first_name || ' ' || s.last_name ELSE NULL END AS staff_name
  FROM all_slots a
  LEFT JOIN staff_shifts ss ON ss.shift_date = a.d AND ss.shift_type = a.st
  LEFT JOIN staff s ON s.id = ss.staff_id
  ORDER BY a.d, a.st;
$$;

-- ============================================================
-- 10. Function: expire_pending_covers
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_pending_covers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE staff_shift_covers
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending' AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- ============================================================
-- 11. Row Level Security
-- ============================================================

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shift_covers ENABLE ROW LEVEL SECURITY;

-- staff_shifts: admins/supervisors full access, staff read own
CREATE POLICY "Admins manage all shifts" ON public.staff_shifts
  FOR ALL USING (
    get_staff_role(auth.uid()) IN ('super_admin', 'admin', 'call_centre_supervisor')
  );

CREATE POLICY "Staff view own shifts" ON public.staff_shifts
  FOR SELECT USING (
    staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
  );

-- staff_holidays: admins/supervisors full access, staff manage own
CREATE POLICY "Admins manage all holidays" ON public.staff_holidays
  FOR ALL USING (
    get_staff_role(auth.uid()) IN ('super_admin', 'admin', 'call_centre_supervisor')
  );

CREATE POLICY "Staff view own holidays" ON public.staff_holidays
  FOR SELECT USING (
    staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Staff request own holidays" ON public.staff_holidays
  FOR INSERT WITH CHECK (
    staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Staff cancel own holidays" ON public.staff_holidays
  FOR UPDATE USING (
    staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
    AND status = 'requested'
  ) WITH CHECK (
    status = 'cancelled'
  );

-- staff_shift_covers: admins/supervisors full access, staff accept/decline own
CREATE POLICY "Admins manage all covers" ON public.staff_shift_covers
  FOR ALL USING (
    get_staff_role(auth.uid()) IN ('super_admin', 'admin', 'call_centre_supervisor')
  );

CREATE POLICY "Staff view own covers" ON public.staff_shift_covers
  FOR SELECT USING (
    cover_staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
    OR original_staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Staff respond to covers" ON public.staff_shift_covers
  FOR UPDATE USING (
    cover_staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1)
    AND status = 'pending'
  ) WITH CHECK (
    status IN ('accepted', 'declined')
  );

-- ============================================================
-- 12. Enable realtime for new tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_holidays;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_shift_covers;

-- ============================================================
-- 13. CRON job: daily shift reminders + cover expiry (19:00 UTC)
-- ============================================================

SELECT cron.schedule(
  'shift-daily-reminders',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/shift-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
