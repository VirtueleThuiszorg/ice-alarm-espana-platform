-- ============================================================
-- Staff Invites Migration
-- Adds invite token system for staff onboarding wizard.
-- ============================================================

-- 1. Add 'pending' to staff status constraint
-- The constraint was added inline, so PostgreSQL names it staff_status_check
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_status_check;
ALTER TABLE staff ADD CONSTRAINT staff_status_check
  CHECK (status IN ('active', 'on_leave', 'suspended', 'terminated', 'pending'));

-- 2. Recreate is_active generated column (pending staff are NOT active)
ALTER TABLE staff DROP COLUMN IF EXISTS is_active;
ALTER TABLE staff ADD COLUMN is_active BOOLEAN GENERATED ALWAYS AS (status = 'active') STORED;

-- 3. Expand staff_activity_log action values
ALTER TABLE staff_activity_log DROP CONSTRAINT IF EXISTS staff_activity_log_action_check;
ALTER TABLE staff_activity_log ADD CONSTRAINT staff_activity_log_action_check
  CHECK (action IN (
    'status_change', 'role_change', 'profile_update',
    'document_upload', 'document_delete', 'login', 'note_added',
    'invite_sent', 'invite_completed'
  ));

-- 4. Create staff_invites table
CREATE TABLE IF NOT EXISTS public.staff_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_staff_invites_token ON public.staff_invites(token);
CREATE INDEX IF NOT EXISTS idx_staff_invites_staff_id ON public.staff_invites(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_invites_status ON public.staff_invites(status);

-- 6. Enable RLS
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;

-- 7. Admin/super_admin full access
CREATE POLICY "Admin full access to staff_invites"
  ON public.staff_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('admin', 'super_admin')
      AND staff.is_active = true
    )
  );
