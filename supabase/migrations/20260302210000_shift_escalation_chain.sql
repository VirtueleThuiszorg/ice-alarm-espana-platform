-- Shift Escalation Chain
-- Allows admins to designate primary, backup, and supervisor per shift slot.
-- The sos-escalation-runner checks this table before falling back to
-- escalation_priority on the staff table.

CREATE TABLE public.shift_escalation_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'night')),
  primary_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  backup_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  supervisor_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shift_date, shift_type)
);

CREATE TRIGGER update_shift_escalation_chain_updated_at
  BEFORE UPDATE ON public.shift_escalation_chain
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_shift_escalation_chain_date ON public.shift_escalation_chain(shift_date);
CREATE INDEX idx_shift_escalation_chain_date_type ON public.shift_escalation_chain(shift_date, shift_type);

-- RLS
ALTER TABLE public.shift_escalation_chain ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage escalation chains" ON public.shift_escalation_chain
  FOR ALL USING (
    get_staff_role(auth.uid()) IN ('super_admin', 'admin', 'call_centre_supervisor')
  );

CREATE POLICY "Staff view escalation chains" ON public.shift_escalation_chain
  FOR SELECT USING (
    public.is_staff(auth.uid())
  );

-- Function: get current shift escalation chain
-- Returns the chain for the currently active shift based on time of day.
CREATE OR REPLACE FUNCTION public.get_current_escalation_chain()
RETURNS TABLE (
  primary_staff_id UUID,
  backup_staff_id UUID,
  supervisor_staff_id UUID,
  primary_mobile TEXT,
  backup_mobile TEXT,
  supervisor_mobile TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_shift AS (
    SELECT
      CASE
        WHEN CURRENT_TIME BETWEEN '07:00:00' AND '14:59:59' THEN 'morning'
        WHEN CURRENT_TIME BETWEEN '15:00:00' AND '22:59:59' THEN 'afternoon'
        ELSE 'night'
      END AS shift_type,
      CASE
        WHEN CURRENT_TIME < '07:00:00' THEN CURRENT_DATE - INTERVAL '1 day'
        ELSE CURRENT_DATE
      END AS shift_date
  )
  SELECT
    sec.primary_staff_id,
    sec.backup_staff_id,
    sec.supervisor_staff_id,
    sp.personal_mobile AS primary_mobile,
    sb.personal_mobile AS backup_mobile,
    ss.personal_mobile AS supervisor_mobile
  FROM shift_escalation_chain sec
  JOIN current_shift cs ON sec.shift_date = cs.shift_date::date AND sec.shift_type = cs.shift_type
  LEFT JOIN staff sp ON sp.id = sec.primary_staff_id
  LEFT JOIN staff sb ON sb.id = sec.backup_staff_id
  LEFT JOIN staff ss ON ss.id = sec.supervisor_staff_id
  LIMIT 1;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_escalation_chain;
