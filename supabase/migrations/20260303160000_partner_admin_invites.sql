-- ============================================================
-- Partner Admin Invites Migration
-- Adds invite token system for admin-initiated partner onboarding.
-- ============================================================

-- 1. Add 'invited' to partner_status enum
ALTER TYPE public.partner_status ADD VALUE IF NOT EXISTS 'invited' BEFORE 'pending';

-- 2. Create partner_admin_invites table (mirrors staff_invites)
CREATE TABLE IF NOT EXISTS public.partner_admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_partner_admin_invites_token ON public.partner_admin_invites(token);
CREATE INDEX IF NOT EXISTS idx_partner_admin_invites_partner_id ON public.partner_admin_invites(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_admin_invites_status ON public.partner_admin_invites(status);

-- 4. Enable RLS
ALTER TABLE public.partner_admin_invites ENABLE ROW LEVEL SECURITY;

-- 5. Admin/super_admin full access
CREATE POLICY "Admin full access to partner_admin_invites"
  ON public.partner_admin_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('admin', 'super_admin')
      AND staff.is_active = true
    )
  );
